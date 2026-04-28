import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabaseServer";

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

    const brokerMap = new Map(
      (brokerPositions || [])
        .filter((bp) => bp.auto_stock_id)
        .map((bp) => [bp.auto_stock_id, bp])
    );

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

    return NextResponse.json({
      positions: result,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to load auto portfolio" },
      { status: 500 }
    );
  }
}