import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabaseServer";
import { syncAlpacaIfStale } from "@/app/lib/broker/syncAlpacaIfStale";

function n(value: any, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      await syncAlpacaIfStale(user.id);
    } catch {
      // Non-fatal: return the latest persisted values when broker sync fails.
    }

    const { data: positions, error } = await supabase
      .from("positions")
      .select(`
        id,
        auto_stock_id,
        shares,
        entry_price,
        peak_price,
        peak_pnl_percent,
        entry_time,
        updated_at,
        auto_stocks (
          id,
          symbol,
          allocation,
          status,
          last_ai_decision,
          last_evaluated_price
        )
      `)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to load auto portfolio" },
        { status: 500 }
      );
    }

    const { data: brokerPositions } = await supabase
      .from("broker_positions")
      .select(`
        id,
        auto_stock_id,
        symbol,
        qty,
        avg_entry_price,
        market_value,
        current_price,
        unrealized_pl,
        unrealized_plpc,
        last_synced_at
      `)
      .eq("user_id", user.id)
      .eq("broker", "alpaca");

    const { data: optionTrades, error: optionTradesError } = await supabase
      .from("option_paper_trades")
      .select(`
        id,
        symbol,
        strategy,
        option_type,
        direction,
        long_strike,
        long_expiry,
        short_strike,
        short_expiry,
        net_debit,
        qty_contracts,
        pnl,
        status,
        broker_status,
        entry_at,
        exit_at
      `)
      .eq("user_id", user.id)
      .eq("status", "open")
      .order("entry_at", { ascending: false });

    if (optionTradesError) {
      console.warn("[portfolio:auto] option trades query failed:", optionTradesError.message);
    }

    const optionTradeIds = (optionTrades || []).map((trade: any) => trade.id).filter(Boolean);
    const { data: optionEntryLegs } = optionTradeIds.length
      ? await supabase
          .from("option_trade_orders")
          .select("trade_id, option_symbol, side, filled_qty, qty")
          .in("trade_id", optionTradeIds)
          .eq("order_role", "entry")
      : { data: [] as any[] };

    const brokerMap = new Map(
      (brokerPositions || [])
        .filter((bp) => bp.auto_stock_id)
        .map((bp) => [bp.auto_stock_id, bp])
    );

    const optionPriceBySymbol = new Map<string, number>();
    for (const bp of brokerPositions || []) {
      const symbol = String(bp.symbol || "").toUpperCase();
      const current = Number(bp.current_price);
      if (symbol && Number.isFinite(current) && current >= 0) {
        optionPriceBySymbol.set(symbol, current);
      }
    }

    type OptionLegBucket = {
      longNotional: number;
      longQty: number;
      shortNotional: number;
      shortQty: number;
    };

    const optionValueByTradeId = new Map<string, number>();
    const optionLegBuckets = new Map<string, OptionLegBucket>();

    for (const leg of optionEntryLegs || []) {
      const tradeId = String(leg.trade_id || "");
      const symbol = String(leg.option_symbol || "").toUpperCase();
      if (!tradeId || !symbol) continue;

      const legPriceRaw = optionPriceBySymbol.get(symbol);
      if (legPriceRaw == null || !Number.isFinite(legPriceRaw)) continue;
      const legPrice = legPriceRaw;

      const filledQty = Number(leg.filled_qty);
      const fallbackQty = Number(leg.qty);
      const qty = Number.isFinite(filledQty) && filledQty > 0
        ? filledQty
        : Number.isFinite(fallbackQty) && fallbackQty > 0
        ? fallbackQty
        : 1;

      const bucket = optionLegBuckets.get(tradeId) ?? {
        longNotional: 0,
        longQty: 0,
        shortNotional: 0,
        shortQty: 0,
      };

      if (String(leg.side || "").toLowerCase() === "sell") {
        bucket.shortNotional += legPrice * qty;
        bucket.shortQty += qty;
      } else {
        bucket.longNotional += legPrice * qty;
        bucket.longQty += qty;
      }

      optionLegBuckets.set(tradeId, bucket);
    }

    for (const [tradeId, bucket] of optionLegBuckets.entries()) {
      if (bucket.longQty <= 0) continue;
      const longAvg = bucket.longNotional / bucket.longQty;
      const shortAvg = bucket.shortQty > 0 ? bucket.shortNotional / bucket.shortQty : 0;
      const currentValue = longAvg - shortAvg;
      if (Number.isFinite(currentValue)) {
        optionValueByTradeId.set(tradeId, currentValue);
      }
    }

    const result = (positions || [])
      .map((pos: any) => {
        const autoStock = Array.isArray(pos.auto_stocks)
          ? pos.auto_stocks[0]
          : pos.auto_stocks;

        const broker = brokerMap.get(pos.auto_stock_id);

        const symbol =
          broker?.symbol ||
          autoStock?.symbol ||
          "";

        if (!symbol) return null;

        const shares = n(broker?.qty ?? pos.shares);
        const entryPrice = n(broker?.avg_entry_price ?? pos.entry_price);
        const currentPrice = broker?.current_price != null
          ? n(broker.current_price)
          : null;

        const marketValue =
          broker?.market_value != null
            ? n(broker.market_value)
            : currentPrice != null
            ? shares * currentPrice
            : null;

        const pnl =
          broker?.unrealized_pl != null
            ? n(broker.unrealized_pl)
            : currentPrice != null
            ? (currentPrice - entryPrice) * shares
            : null;

        return {
          id: pos.id,
          source: "auto",
          auto_stock_id: pos.auto_stock_id,
          symbol: String(symbol).toUpperCase(),
          shares,
          avgPrice: entryPrice,
          entryPrice,
          currentPrice,
          marketValue,
          pnl,
          pnlPercent:
            broker?.unrealized_plpc != null ? n(broker.unrealized_plpc) : null,
          allocation: autoStock?.allocation ?? null,
          status: autoStock?.status ?? null,
          lastAiDecision: autoStock?.last_ai_decision ?? null,
          brokerPositionId: broker?.id ?? null,
          lastSyncedAt: broker?.last_synced_at ?? null,
        };
      })
      .filter(Boolean);

    const optionResult = (optionTrades || []).map((trade: any) => {
      const contracts = n(trade.qty_contracts, 1);
      const entryPricePerShare = n(trade.net_debit);
      const contractMultiplier = 100;
      const basis = contracts * entryPricePerShare * contractMultiplier;
      const currentPrice = optionValueByTradeId.get(String(trade.id)) ?? null;
      const marketValue = currentPrice != null ? currentPrice * contracts * contractMultiplier : null;
      const pnl = trade.pnl != null
        ? n(trade.pnl)
        : marketValue != null
        ? marketValue - basis
        : null;

      return {
        id: trade.id,
        source: "auto",
        assetType: "option",
        symbol: String(trade.symbol || "").toUpperCase(),
        strategy: trade.strategy || null,
        optionType: trade.option_type || null,
        direction: trade.direction || null,
        longStrike: trade.long_strike ?? null,
        longExpiry: trade.long_expiry ?? null,
        shortStrike: trade.short_strike ?? null,
        shortExpiry: trade.short_expiry ?? null,
        contracts,
        shares: contracts,
        avgPrice: entryPricePerShare,
        entryPrice: entryPricePerShare,
        currentPrice,
        marketValue,
        pnl,
        pnlPercent: basis > 0 && pnl != null ? (pnl / basis) * 100 : null,
        allocation: null,
        status: trade.status ?? null,
        brokerStatus: trade.broker_status ?? null,
        lastAiDecision: null,
        brokerPositionId: null,
        lastSyncedAt: trade.entry_at ?? null,
      };
    });

    return NextResponse.json({
      positions: [...result, ...optionResult],
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to load auto portfolio" },
      { status: 500 }
    );
  }
}