import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabaseServer";
import { getOptionPreferences } from "@/app/lib/db/optionPreferences";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaperTradeInsert {
  symbol: string;
  direction: "bullish" | "bearish";
  strategy: "call_debit_spread" | "put_debit_spread";
  long_strike?: number | null;
  long_expiry?: string | null;
  short_strike?: number | null;
  short_expiry?: string | null;
  option_type?: "call" | "put" | null;
  net_debit: number;
  max_gain?: number | null;
  max_loss?: number | null;
  entry_score?: number | null;
  entry_spot_price?: number | null;
  broker_order_id?: string | null; // reserved for auto-layer / Alpaca bridge
  entry_broker_order_id?: string | null;
  execution_mode_snapshot?: "paper" | "live" | null;
  qty_contracts?: number | null;
  broker_status?: string | null;
  notes?: string | null;
}

interface PaperTradeClose {
  id: string;
  exit_price: number;
}

interface PaperTradePeakUpdate {
  id: string;
  current_value: number;   // current estimated spread value (per share)
  max_gain: number;        // max_gain of the trade (per share)
  max_loss: number;        // max_loss of the trade (per share)
  net_debit: number;       // entry cost (per share)
  // trail-stop params (from user prefs)
  hard_loss_stop_pct: number;
  profit_trail_activation_pct: number;
  profit_trail_distance_pct: number;
}

// ─── Trail-stop evaluation ────────────────────────────────────────────────────
// Returns { shouldClose: boolean; exitReason: string | null }
function evaluateTrailStop(params: {
  currentPnl: number;      // current unrealized P&L (per share × 100)
  peakPnl: number;         // highest P&L ever recorded (per share × 100)
  maxGain: number;         // per share
  maxLoss: number;         // per share
  hardLossStopPct: number;
  trailActivationPct: number;
  trailDistancePct: number;
}): { shouldClose: boolean; exitReason: string | null } {
  const { currentPnl, peakPnl, maxGain, maxLoss,
          hardLossStopPct, trailActivationPct, trailDistancePct } = params;

  const maxGainDollars = maxGain * 100;
  const maxLossDollars = maxLoss * 100;

  // 1. Hard loss stop — always checked first
  const lossThreshold = -(maxLossDollars * hardLossStopPct / 100);
  if (currentPnl <= lossThreshold) {
    return { shouldClose: true, exitReason: `hard-loss-stop-${hardLossStopPct}pct` };
  }

  // 2. Trail profit stop — only active once peak crosses activation threshold
  const activationDollars = maxGainDollars * trailActivationPct / 100;
  if (peakPnl >= activationDollars) {
    const trailFloor = peakPnl - (maxGainDollars * trailDistancePct / 100);
    if (currentPnl < trailFloor) {
      return { shouldClose: true, exitReason: `trail-stop-from-peak` };
    }
  }

  return { shouldClose: false, exitReason: null };
}

// ─── Live option pricing for open positions ─────────────────────────────────

function getPolygonApiKey() {
  return process.env.POLYGON_API_KEY || '';
}

function buildOccSymbol(
  underlying: string,
  expiry: string,
  contractType: 'call' | 'put',
  strike: number,
) {
  const [year, month, day] = expiry.split('-');
  const yy = year.slice(2);
  const cp = contractType === 'call' ? 'C' : 'P';
  const strikeInt = Math.round(strike * 1000);
  const strikePadded = strikeInt.toString().padStart(8, '0');
  return `${underlying.toUpperCase()}${yy}${month}${day}${cp}${strikePadded}`;
}

async function fetchOptionMidPrice(underlying: string, occSymbol: string): Promise<number | null> {
  const apiKey = getPolygonApiKey();
  if (!apiKey) return null;

  try {
    const url =
      `https://api.polygon.io/v3/snapshot/options/${encodeURIComponent(underlying)}/${encodeURIComponent(occSymbol)}` +
      `?apiKey=${apiKey}`;

    const res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const snap = data?.results;
    if (!snap) return null;

    if (typeof snap.last_quote?.midpoint === 'number') return snap.last_quote.midpoint;
    const bid = snap.last_quote?.bid;
    const ask = snap.last_quote?.ask;
    if (typeof bid === 'number' && typeof ask === 'number') return (bid + ask) / 2;
    const dayClose = snap.day?.close;
    return typeof dayClose === 'number' ? dayClose : null;
  } catch {
    return null;
  }
}

// ─── GET — list open paper trades for current user ────────────────────────────

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

    const { data, error } = await supabase
      .from("option_paper_trades")
      .select(
        `id, symbol, direction, strategy, long_strike, long_expiry,
         short_strike, short_expiry, option_type, net_debit, max_gain,
         max_loss, entry_score, entry_spot_price, status,
        entry_at, exit_at, exit_price, pnl, broker_order_id, notes,
        qty_contracts, execution_mode_snapshot, broker_status,
        entry_broker_order_id, exit_broker_order_id, close_requested_at, peak_pnl`
      )
      .eq("user_id", user.id)
      .order("entry_at", { ascending: false });

    if (error) {
      console.error("[paper-trade] GET error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const trades = data ?? [];

    // Compute broker-filled entry averages per trade from option_trade_orders.
    const entryPriceByTradeId = new Map<string, number>();
    if (trades.length > 0) {
      const tradeIds = trades.map((t: any) => t.id).filter(Boolean);
      const { data: entryOrders } = await supabase
        .from('option_trade_orders')
        .select('trade_id, side, filled_avg_price, filled_qty, qty')
        .in('trade_id', tradeIds)
        .eq('order_role', 'entry');

      const buckets = new Map<string, { buyNotional: number; sellNotional: number; buyQty: number }>();
      for (const row of entryOrders ?? []) {
        const tradeId = row.trade_id as string;
        if (!tradeId) continue;

        const price = Number(row.filled_avg_price ?? null);
        if (!Number.isFinite(price) || price <= 0) continue;

        const filledQty = Number(row.filled_qty ?? null);
        const fallbackQty = Number(row.qty ?? null);
        const qty = Number.isFinite(filledQty) && filledQty > 0
          ? filledQty
          : Number.isFinite(fallbackQty) && fallbackQty > 0
            ? fallbackQty
            : 0;
        if (qty <= 0) continue;

        const curr = buckets.get(tradeId) ?? { buyNotional: 0, sellNotional: 0, buyQty: 0 };
        if (row.side === 'sell') {
          curr.sellNotional += price * qty;
        } else {
          curr.buyNotional += price * qty;
          curr.buyQty += qty;
        }
        buckets.set(tradeId, curr);
      }

      for (const [tradeId, b] of buckets.entries()) {
        if (b.buyQty > 0) {
          const debit = (b.buyNotional - b.sellNotional) / b.buyQty;
          if (Number.isFinite(debit) && debit >= 0) {
            entryPriceByTradeId.set(tradeId, debit);
          }
        }
      }
    }

    // Attach ai_decisions records (non-fatal if query fails)
    let decisionMap: Map<string, any> = new Map();
    try {
      const tradeIds = trades.map((t: any) => t.id).filter(Boolean);
      if (tradeIds.length > 0) {
        const { data: decisions } = await supabase
          .from("ai_decisions")
          .select("option_trade_id, action, reason, confidence, ocs_score, risk_flags")
          .in("option_trade_id", tradeIds)
          .not("option_trade_id", "is", null);
        decisionMap = new Map(
          (decisions ?? []).map((d: any) => [d.option_trade_id, d])
        );
      }
    } catch {
      // non-fatal — trades still returned without AI data
    }

    const tradesWithAi = trades.map((t: any) => ({
      ...t,
      broker_entry_price: entryPriceByTradeId.get(t.id) ?? null,
      ai_decision: decisionMap.get(t.id) ?? null,
    }));

    const openTrades = tradesWithAi.filter((t: any) => t.status === 'open');
    const priceByTradeId = new Map<string, { current_value: number | null; current_pnl: number | null }>();

    if (openTrades.length > 0) {
      await Promise.all(
        openTrades.map(async (t: any) => {
          try {
            const longStrike = Number(t.long_strike ?? 0);
            const longExpiry = String(t.long_expiry ?? '');
            const type = (t.option_type === 'put' ? 'put' : 'call') as 'call' | 'put';

            if (!t.symbol || !longExpiry || !Number.isFinite(longStrike) || longStrike <= 0) {
              priceByTradeId.set(t.id, { current_value: null, current_pnl: null });
              return;
            }

            const longOcc = buildOccSymbol(t.symbol, longExpiry, type, longStrike);
            const longMid = await fetchOptionMidPrice(t.symbol, longOcc);
            if (longMid == null) {
              priceByTradeId.set(t.id, { current_value: null, current_pnl: null });
              return;
            }

            let currentValue = longMid;

            const shortStrike = t.short_strike != null ? Number(t.short_strike) : null;
            const shortExpiry = t.short_expiry ? String(t.short_expiry) : null;

            if (shortStrike != null && shortExpiry) {
              const shortOcc = buildOccSymbol(t.symbol, shortExpiry, type, shortStrike);
              const shortMid = await fetchOptionMidPrice(t.symbol, shortOcc);
              if (shortMid != null) {
                currentValue = longMid - shortMid;
              }
            }

            // Keep P&L semantics aligned with existing close logic:
            // pnl = (price - net_debit) * 100 (per-contract dollars).
            const currentPnl = (Number(currentValue) - Number(t.net_debit)) * 100;

            priceByTradeId.set(t.id, {
              current_value: Number.isFinite(currentValue) ? currentValue : null,
              current_pnl: Number.isFinite(currentPnl) ? currentPnl : null,
            });
          } catch {
            priceByTradeId.set(t.id, { current_value: null, current_pnl: null });
          }
        })
      );
    }

    const tradesWithLive = tradesWithAi.map((t: any) => ({
      ...t,
      ...(priceByTradeId.get(t.id) ?? { current_value: null, current_pnl: null }),
    }));

    return NextResponse.json({ trades: tradesWithLive });
  } catch (err: any) {
    console.error("[paper-trade] GET exception:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── POST — save a new paper trade ───────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: PaperTradeInsert;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Required field validation
    if (!body.symbol || typeof body.symbol !== "string") {
      return NextResponse.json({ error: "symbol is required" }, { status: 400 });
    }
    if (!["bullish", "bearish"].includes(body.direction)) {
      return NextResponse.json({ error: "direction must be bullish or bearish" }, { status: 400 });
    }
    if (!["call_debit_spread", "put_debit_spread"].includes(body.strategy)) {
      return NextResponse.json({ error: "invalid strategy" }, { status: 400 });
    }
    if (typeof body.net_debit !== "number" || !Number.isFinite(body.net_debit) || body.net_debit <= 0) {
      return NextResponse.json({ error: "net_debit must be a positive number" }, { status: 400 });
    }

    // Enforce user-specific per-contract cost cap (net_debit × 100).
    const prefs = await getOptionPreferences(user.id);
    const contractCost = body.net_debit * 100;
    if (contractCost > prefs.max_loss_per_trade) {
      return NextResponse.json(
        {
          error: `Trade exceeds your per-contract max cost of $${prefs.max_loss_per_trade}. Raise it in Options Rules for pro-sized trades.`,
        },
        { status: 400 }
      );
    }

    const insert = {
      user_id: user.id,
      symbol: body.symbol.toUpperCase().trim(),
      direction: body.direction,
      strategy: body.strategy,
      long_strike: body.long_strike ?? null,
      long_expiry: body.long_expiry ?? null,
      short_strike: body.short_strike ?? null,
      short_expiry: body.short_expiry ?? null,
      option_type: body.option_type ?? null,
      net_debit: body.net_debit,
      max_gain: body.max_gain ?? null,
      max_loss: body.max_loss ?? null,
      entry_score: body.entry_score ?? null,
      entry_spot_price: body.entry_spot_price ?? null,
      broker_order_id: body.broker_order_id ?? null,
      entry_broker_order_id: body.entry_broker_order_id ?? body.broker_order_id ?? null,
      execution_mode_snapshot: body.execution_mode_snapshot ?? 'paper',
      qty_contracts: Math.max(1, Math.floor(Number(body.qty_contracts ?? 1))),
      broker_status: body.broker_status ?? null,
      notes: body.notes ?? null,
      status: "open",
    };

    const { data, error } = await supabase
      .from("option_paper_trades")
      .insert(insert)
      .select()
      .single();

    if (error) {
      console.error("[paper-trade] POST error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ trade: data }, { status: 201 });
  } catch (err: any) {
    console.error("[paper-trade] POST exception:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── PATCH — close a trade OR update peak_pnl (auto-layer scan cycle) ─────────

export async function PATCH(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.id || typeof body.id !== "string") {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // ── Mode A: manual close ──────────────────────────────────────────────────
    if (body.exit_price != null) {
      const exitPrice = Number(body.exit_price);
      if (!Number.isFinite(exitPrice)) {
        return NextResponse.json({ error: "exit_price must be a number" }, { status: 400 });
      }

      const { data: existing, error: fetchError } = await supabase
        .from("option_paper_trades")
        .select("id, user_id, net_debit, status, entry_broker_order_id, execution_mode_snapshot, broker_status")
        .eq("id", body.id)
        .eq("user_id", user.id)
        .single();

      if (fetchError || !existing) {
        return NextResponse.json({ error: "Trade not found" }, { status: 404 });
      }
      if (existing.status === "closed") {
        return NextResponse.json({ error: "Trade is already closed" }, { status: 409 });
      }
      if (existing.entry_broker_order_id) {
        return NextResponse.json(
          { error: "Broker-backed option trades cannot be manually paper-closed." },
          { status: 409 }
        );
      }

      // P&L = (exit_price - net_debit) × 100  (1 contract = 100 shares)
      const pnl = (exitPrice - existing.net_debit) * 100;

      const { data: updated, error: updateError } = await supabase
        .from("option_paper_trades")
        .update({
          status: "closed",
          exit_price: exitPrice,
          exit_at: new Date().toISOString(),
          pnl,
        })
        .eq("id", body.id)
        .eq("user_id", user.id)
        .select()
        .single();

      if (updateError) {
        console.error("[paper-trade] PATCH close error:", updateError);
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({ trade: updated, action: "closed" });
    }

    // ── Mode B: scan-cycle peak_pnl update + trail-stop evaluation ───────────
    if (body.current_value != null) {
      const b = body as unknown as PaperTradePeakUpdate;
      const currentValue = Number(b.current_value);
      const netDebit = Number(b.net_debit);
      const maxGain = Number(b.max_gain);
      const maxLoss = Number(b.max_loss);

      if (
        !Number.isFinite(currentValue) || !Number.isFinite(netDebit) ||
        !Number.isFinite(maxGain) || !Number.isFinite(maxLoss)
      ) {
        return NextResponse.json({ error: "current_value, net_debit, max_gain, max_loss are required numbers" }, { status: 400 });
      }

      const currentPnl = (currentValue - netDebit) * 100;

      // Fetch existing peak_pnl
      const { data: existing, error: fetchError } = await supabase
        .from("option_paper_trades")
        .select("id, user_id, status, peak_pnl, net_debit")
        .eq("id", body.id)
        .eq("user_id", user.id)
        .single();

      if (fetchError || !existing) {
        return NextResponse.json({ error: "Trade not found" }, { status: 404 });
      }
      if (existing.status === "closed") {
        return NextResponse.json({ trade: existing, action: "already_closed" });
      }

      const prevPeak = existing.peak_pnl ?? currentPnl;
      const newPeak = Math.max(prevPeak, currentPnl);

      // Evaluate trail-stop
      const { shouldClose, exitReason } = evaluateTrailStop({
        currentPnl,
        peakPnl: newPeak,
        maxGain,
        maxLoss,
        hardLossStopPct: Number(b.hard_loss_stop_pct) || 50,
        trailActivationPct: Number(b.profit_trail_activation_pct) || 40,
        trailDistancePct: Number(b.profit_trail_distance_pct) || 25,
      });

      if (shouldClose) {
        const { data: closed, error: closeError } = await supabase
          .from("option_paper_trades")
          .update({
            status: "closed",
            exit_price: currentValue,
            exit_at: new Date().toISOString(),
            pnl: currentPnl,
            peak_pnl: newPeak,
          })
          .eq("id", body.id)
          .eq("user_id", user.id)
          .select()
          .single();

        if (closeError) {
          console.error("[paper-trade] PATCH trail-close error:", closeError);
          return NextResponse.json({ error: closeError.message }, { status: 500 });
        }

        return NextResponse.json({ trade: closed, action: "trail_closed", exitReason });
      }

      // Not closing — just update peak_pnl
      const { data: updated, error: updateError } = await supabase
        .from("option_paper_trades")
        .update({ peak_pnl: newPeak })
        .eq("id", body.id)
        .eq("user_id", user.id)
        .select()
        .single();

      if (updateError) {
        console.error("[paper-trade] PATCH peak update error:", updateError);
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({ trade: updated, action: "peak_updated", currentPnl, peakPnl: newPeak });
    }

    return NextResponse.json({ error: "Provide exit_price (close) or current_value (peak update)" }, { status: 400 });
  } catch (err: any) {
    console.error("[paper-trade] PATCH exception:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
