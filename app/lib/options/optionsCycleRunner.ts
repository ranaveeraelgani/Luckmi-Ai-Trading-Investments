/**
 * Phase E — Options Scan Cycle (queue-based)
 *
 * Architecture:
 *   options-cycle route  → calls fetchAllOpenTradeIds() + enqueueOptionsCycleJobs()
 *   options-jobs-drain   → claims jobs, calls runOptionsTradeJob(tradeId) per trade
 *
 * Per-trade logic:
 *  1. Fetch current mid-price of each option leg from Polygon.
 *  2. Evaluate hard-loss-stop and trail-profit-stop rules against the user's prefs.
 *  3. Auto-close triggered trades and queue an in-app notification.
 *  4. Otherwise update peak_pnl if a new high was reached.
 *
 * REQUIRED SQL (run once in Supabase SQL editor):
 * ─────────────────────────────────────────────────────────────────────────────
 *   ALTER TABLE option_paper_trades
 *     ADD COLUMN IF NOT EXISTS auto_exit_reason text;
 *
 *   -- engine_jobs.payload column (JSONB) — add if not already on your schema:
 *   ALTER TABLE engine_jobs
 *     ADD COLUMN IF NOT EXISTS payload jsonb;
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { supabaseAdmin } from '@/app/lib/supabaseAdmin';
import { enqueueNotificationEvent } from '@/app/lib/db/notifications';
import { requestOptionBrokerClose } from '@/app/lib/options/requestOptionBrokerClose';
import { insertOptionExitEvent } from '@/app/lib/options/insertOptionExitEvent';
import { syncAlpacaIfStale } from '@/app/lib/broker/syncAlpacaIfStale';

// ── Constants ─────────────────────────────────────────────────────────────────

const POLYGON_API_KEY = process.env.POLYGON_API_KEY ?? '';

/**
 * Polite delay between Polygon API calls (per trade).
 * 200 ms keeps us well under any Polygon tier limit.
 * Raise to 500 ms on the free tier (5 req/min).
 */
const CALL_DELAY_MS = 200;

// ── Types ─────────────────────────────────────────────────────────────────────

interface OpenTrade {
  id: string;
  user_id: string;
  symbol: string;
  strategy: string;
  option_type: string | null;
  direction: string | null;
  long_strike: number | null;
  long_expiry: string | null;
  short_strike: number | null;
  short_expiry: string | null;
  net_debit: number;
  max_gain: number | null;
  max_loss: number | null;
  peak_pnl: number | null;
  qty_contracts: number | null;
  execution_mode_snapshot: string | null;
  broker_status: string | null;
  entry_broker_order_id: string | null;
  exit_broker_order_id: string | null;
  entry_at: string | null;
}

interface UserPrefs {
  auto_exit_enabled: boolean;
  hard_loss_stop_pct: number;
  profit_trail_activation_pct: number;
  profit_trail_distance_pct: number;
}

export type TradeJobOutcome =
  | { action: 'closed'; exitReason: string; pnl: number }
  | { action: 'close_requested'; exitReason: string; mode: 'paper' | 'live' }
  | { action: 'peak_updated'; peakPnl: number }
  | { action: 'price_unavailable' }
  | { action: 'skipped'; reason: string };

// ── Utility helpers ───────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deriveLongLegType(trade: OpenTrade): 'call' | 'put' {
  if (trade.option_type === 'call') return 'call';
  if (trade.option_type === 'put') return 'put';
  if (trade.strategy === 'call_debit_spread' || trade.strategy === 'long_call') return 'call';
  return 'put';
}

/**
 * Build an OCC option ticker for Polygon.
 * e.g. O:AAPL231215C00195000  (AAPL Dec-15-2023 $195 call)
 * expiry format: YYYY-MM-DD, strike in dollars.
 */
function buildOccSymbol(
  underlying: string,
  expiry: string,
  contractType: 'call' | 'put',
  strike: number,
): string {
  const [year, month, day] = expiry.split('-');
  const yy = year.slice(2);
  const cp = contractType === 'call' ? 'C' : 'P';
  const strikeInt = Math.round(strike * 1000);
  const strikePadded = strikeInt.toString().padStart(8, '0');
  return `O:${underlying}${yy}${month}${day}${cp}${strikePadded}`;
}

function buildBrokerOccSymbol(
  underlying: string,
  expiry: string,
  contractType: 'call' | 'put',
  strike: number,
): string {
  const [year, month, day] = expiry.split('-');
  const yy = year.slice(2);
  const cp = contractType === 'call' ? 'C' : 'P';
  const strikeInt = Math.round(strike * 1000);
  const strikePadded = strikeInt.toString().padStart(8, '0');
  return `${underlying.toUpperCase()}${yy}${month}${day}${cp}${strikePadded}`;
}

async function fetchOptionMidPrice(
  underlying: string,
  occSymbol: string,
): Promise<number | null> {
  if (!POLYGON_API_KEY) return null;
  try {
    const url =
      `https://api.polygon.io/v3/snapshot/options/` +
      `${encodeURIComponent(underlying)}/${encodeURIComponent(occSymbol)}` +
      `?apiKey=${POLYGON_API_KEY}`;

    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
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

// ── Trail-stop evaluation ─────────────────────────────────────────────────────

function evaluateTrailStop(params: {
  currentPnl: number;
  peakPnl: number;
  maxGain: number;
  maxLoss: number;
  hardLossStopPct: number;
  trailActivationPct: number;
  trailDistancePct: number;
}): { shouldClose: boolean; exitReason: string | null } {
  const {
    currentPnl, peakPnl, maxGain, maxLoss,
    hardLossStopPct, trailActivationPct, trailDistancePct,
  } = params;

  const maxGainDollars = maxGain * 100;
  const maxLossDollars = maxLoss * 100;

  const lossThreshold = -(maxLossDollars * hardLossStopPct / 100);
  if (currentPnl <= lossThreshold) {
    return { shouldClose: true, exitReason: `hard-loss-stop-${hardLossStopPct}pct` };
  }

  const activationDollars = maxGainDollars * trailActivationPct / 100;
  if (peakPnl >= activationDollars) {
    const trailFloor = peakPnl - (maxGainDollars * trailDistancePct / 100);
    if (currentPnl < trailFloor) {
      return { shouldClose: true, exitReason: 'trail-stop-from-peak' };
    }
  }

  return { shouldClose: false, exitReason: null };
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function fetchTradeById(tradeId: string): Promise<OpenTrade | null> {
  const { data, error } = await supabaseAdmin
    .from('option_paper_trades')
    .select(
      'id, user_id, symbol, strategy, option_type, direction, ' +
      'long_strike, long_expiry, short_strike, short_expiry, ' +
      'net_debit, max_gain, max_loss, peak_pnl, qty_contracts, execution_mode_snapshot, ' +
      'broker_status, entry_broker_order_id, exit_broker_order_id, entry_at',
    )
    .eq('id', tradeId)
    .eq('status', 'open')
    .maybeSingle();

  if (error) throw new Error(`fetchTradeById(${tradeId}): ${error.message}`);
  return data as unknown as OpenTrade | null;
}

async function fetchUserPrefs(userId: string): Promise<UserPrefs> {
  const { data } = await supabaseAdmin
    .from('option_preferences')
    .select('auto_exit_enabled, hard_loss_stop_pct, profit_trail_activation_pct, profit_trail_distance_pct')
    .eq('user_id', userId)
    .maybeSingle();

  return {
    auto_exit_enabled: data?.auto_exit_enabled ?? true,
    hard_loss_stop_pct: data?.hard_loss_stop_pct ?? 50,
    profit_trail_activation_pct: data?.profit_trail_activation_pct ?? 40,
    profit_trail_distance_pct: data?.profit_trail_distance_pct ?? 25,
  };
}

async function closeTrade(
  trade: OpenTrade,
  currentValue: number,
  exitReason: string,
): Promise<void> {
  const pnl = (currentValue - trade.net_debit) * 100;
  const exitAt = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('option_paper_trades')
    .update({
      status: 'closed',
      exit_at: exitAt,
      exit_price: currentValue,
      pnl,
      auto_exit_reason: exitReason,
    })
    .eq('id', trade.id);

  if (error) throw new Error(`closeTrade(${trade.id}): ${error.message}`);

  await insertOptionExitEvent({
    tradeId:       trade.id,
    userId:        trade.user_id,
    symbol:        trade.symbol,
    strategy:      trade.strategy,
    direction:     trade.direction,
    rawExitReason: exitReason,
    exitAt,
    entryAt:       trade.entry_at ?? null,
    netDebit:      trade.net_debit,
    pnl,
    executionMode: trade.execution_mode_snapshot,
  });
}

async function savePeakPnl(tradeId: string, peakPnl: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from('option_paper_trades')
    .update({ peak_pnl: peakPnl })
    .eq('id', tradeId);

  if (error) throw new Error(`savePeakPnl(${tradeId}): ${error.message}`);
}

async function getBrokerDerivedCurrentValue(trade: OpenTrade): Promise<number | null> {
  const { data: entryLegs } = await supabaseAdmin
    .from('option_trade_orders')
    .select('option_symbol, side, filled_qty, qty')
    .eq('trade_id', trade.id)
    .eq('order_role', 'entry');

  const longType = deriveLongLegType(trade);

  const optionSymbols = Array.from(
    new Set(
      [
        ...(entryLegs ?? []).map((row: any) => String(row.option_symbol || '').toUpperCase()),
        trade.symbol && trade.long_expiry && trade.long_strike != null
          ? buildBrokerOccSymbol(trade.symbol, trade.long_expiry, longType, Number(trade.long_strike)).toUpperCase()
          : '',
        trade.symbol && trade.short_expiry && trade.short_strike != null
          ? buildBrokerOccSymbol(trade.symbol, trade.short_expiry, longType, Number(trade.short_strike)).toUpperCase()
          : '',
      ]
        .filter(Boolean),
    ),
  );

  if (optionSymbols.length === 0) return null;

  const { data: brokerRows } = await supabaseAdmin
    .from('broker_positions')
    .select('symbol, current_price, asset_class')
    .eq('user_id', trade.user_id)
    .eq('broker', 'alpaca')
    .eq('asset_class', 'us_option')
    .in('symbol', optionSymbols);

  const priceBySymbol = new Map<string, number>();
  for (const row of brokerRows ?? []) {
    const symbol = String(row.symbol || '').toUpperCase();
    const current = Number(row.current_price);
    if (symbol && Number.isFinite(current) && current >= 0) {
      priceBySymbol.set(symbol, current);
    }
  }

  if (entryLegs && entryLegs.length > 0) {
    let longNotional = 0;
    let longQty = 0;
    let shortNotional = 0;
    let shortQty = 0;

    for (const row of entryLegs) {
      const symbol = String(row.option_symbol || '').toUpperCase();
      const legPriceRaw = priceBySymbol.get(symbol);
      if (legPriceRaw == null || !Number.isFinite(legPriceRaw)) continue;
      const legPrice = legPriceRaw;

      const filledQty = Number(row.filled_qty);
      const fallbackQty = Number(row.qty);
      const qty = Number.isFinite(filledQty) && filledQty > 0
        ? filledQty
        : Number.isFinite(fallbackQty) && fallbackQty > 0
          ? fallbackQty
          : 1;

      if (String(row.side || '').toLowerCase() === 'sell') {
        shortNotional += legPrice * qty;
        shortQty += qty;
      } else {
        longNotional += legPrice * qty;
        longQty += qty;
      }
    }

    if (longQty > 0) {
      const longAvg = longNotional / longQty;
      const shortAvg = shortQty > 0 ? shortNotional / shortQty : 0;
      const currentValue = longAvg - shortAvg;
      if (Number.isFinite(currentValue)) return currentValue;
    }
  }

  // Fallback for legacy trades without option_trade_orders linkage.
  if (!trade.symbol || !trade.long_expiry || trade.long_strike == null) return null;

  const longSymbol = buildBrokerOccSymbol(trade.symbol, trade.long_expiry, longType, Number(trade.long_strike)).toUpperCase();
  const longPrice = priceBySymbol.get(longSymbol);
  if (longPrice == null || !Number.isFinite(longPrice)) return null;

  let currentValue = longPrice;
  if (trade.short_expiry && trade.short_strike != null) {
    const shortSymbol = buildBrokerOccSymbol(trade.symbol, trade.short_expiry, longType, Number(trade.short_strike)).toUpperCase();
    const shortPrice = priceBySymbol.get(shortSymbol);
    if (shortPrice != null && Number.isFinite(shortPrice)) {
      currentValue = longPrice - shortPrice;
    }
  }

  return Number.isFinite(currentValue) ? currentValue : null;
}

// ── Public: fetch IDs for the enqueue step ───────────────────────────────────

/**
 * Returns all open trade IDs.
 * Called by the options-cycle cron route before calling enqueueOptionsCycleJobs().
 */
export async function fetchAllOpenTradeIds(): Promise<string[]> {
  return fetchOpenTradeIdsForUser();
}

export async function fetchOpenTradeIdsForUser(userId?: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('option_paper_trades')
    .select('id')
    .eq('status', 'open')
    .match(userId ? { user_id: userId } : {});

  if (error) throw new Error(`fetchOpenTradeIdsForUser: ${error.message}`);
  return (data ?? []).map((r: any) => r.id as string);
}

// ── Public: process a single trade (called by options-jobs-drain) ─────────────

/**
 * Fetches the current price of a trade's option leg(s), evaluates trail-stop
 * rules, and either auto-closes the trade or updates its peak_pnl.
 *
 * Returns a typed outcome object so the drain route can report per-job results.
 */
export async function runOptionsTradeJob(tradeId: string): Promise<TradeJobOutcome> {
  const trade = await fetchTradeById(tradeId);

  if (!trade) {
    // Trade was closed manually between enqueue and drain — not an error
    return { action: 'skipped', reason: 'trade not found or already closed' };
  }

  if (
    trade.long_strike === null ||
    trade.long_expiry === null ||
    trade.max_gain === null ||
    trade.max_loss === null
  ) {
    return { action: 'skipped', reason: 'missing required fields (strike/expiry/max_gain/max_loss)' };
  }

  const longCt = deriveLongLegType(trade);

  // Keep broker option marks fresh enough for stop evaluation; TTL guard prevents over-syncing.
  try {
    await syncAlpacaIfStale(trade.user_id);
  } catch {
    // Non-fatal: we'll still attempt Polygon pricing.
  }

  // Prefer broker-derived live value; fall back to Polygon when unavailable.
  let currentValue = await getBrokerDerivedCurrentValue(trade);

  if (currentValue === null) {
    // Fetch long-leg price
    const longOcc = buildOccSymbol(trade.symbol, trade.long_expiry, longCt, trade.long_strike);
    const longPrice = await fetchOptionMidPrice(trade.symbol, longOcc);
    await sleep(CALL_DELAY_MS);

    if (longPrice === null) {
      return { action: 'price_unavailable' };
    }

    // For spreads, fetch short-leg and compute net value
    currentValue = longPrice;
    if (trade.short_strike !== null && trade.short_expiry !== null) {
      const shortOcc = buildOccSymbol(trade.symbol, trade.short_expiry, longCt, trade.short_strike);
      const shortPrice = await fetchOptionMidPrice(trade.symbol, shortOcc);
      await sleep(CALL_DELAY_MS);
      if (shortPrice !== null) {
        currentValue = longPrice - shortPrice;
      }
    }
  }

  const currentPnl = (currentValue - trade.net_debit) * 100;
  const peakPnl = Math.max(trade.peak_pnl ?? currentPnl, currentPnl);

  const prefs = await fetchUserPrefs(trade.user_id);

  if (trade.broker_status === 'close_pending' || trade.broker_status === 'close_submitted') {
    return { action: 'skipped', reason: 'broker close already pending' };
  }

  if (!prefs.auto_exit_enabled) {
    return { action: 'skipped', reason: 'auto exits disabled by user' };
  }

  const { shouldClose, exitReason } = evaluateTrailStop({
    currentPnl,
    peakPnl,
    maxGain: trade.max_gain,
    maxLoss: trade.max_loss,
    hardLossStopPct: prefs.hard_loss_stop_pct,
    trailActivationPct: prefs.profit_trail_activation_pct,
    trailDistancePct: prefs.profit_trail_distance_pct,
  });

  if (shouldClose) {
    const reason = exitReason ?? 'auto-exit';

    if (trade.entry_broker_order_id) {
      const brokerClose = await requestOptionBrokerClose({
        trade,
        exitReason: reason,
        currentValue,
        currentPnl,
      });

      if (!brokerClose.ok) {
        return { action: 'skipped', reason: `broker close blocked: ${brokerClose.reason}` };
      }

      console.info(
        `[options-cycle] CLOSE REQUESTED trade=${trade.id} symbol=${trade.symbol} ` +
        `mode=${brokerClose.mode} reason=${reason} pnl=${currentPnl.toFixed(2)}`,
      );

      return { action: 'close_requested', exitReason: reason, mode: brokerClose.mode };
    }

    await closeTrade(trade, currentValue, reason);

    const pnlLabel = `${currentPnl >= 0 ? '+' : ''}$${currentPnl.toFixed(2)}`;
    const stratLabel = String(trade.strategy || 'option').replace(/_/g, ' ');

    await enqueueNotificationEvent({
      userId: trade.user_id,
      type: 'option_auto_closed',
      title: `Option auto-closed: ${trade.symbol}`,
      body: `${stratLabel} closed via ${reason} — P&L ${pnlLabel}`,
      url: '/options',
      idempotencyKey: `option-auto-close-${trade.id}`,
      metadata: { tradeId: trade.id, exitReason: reason, pnl: currentPnl, currentValue },
    });

    console.info(
      `[options-cycle] CLOSED trade=${trade.id} symbol=${trade.symbol} ` +
      `reason=${reason} pnl=${currentPnl.toFixed(2)}`,
    );

    return { action: 'closed', exitReason: reason, pnl: currentPnl };
  }

  // Update peak if improved
  if (peakPnl > (trade.peak_pnl ?? -Infinity)) {
    await savePeakPnl(trade.id, peakPnl);
  }

  return { action: 'peak_updated', peakPnl };
}
