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
  long_strike: number | null;
  long_expiry: string | null;
  short_strike: number | null;
  short_expiry: string | null;
  net_debit: number;
  max_gain: number | null;
  max_loss: number | null;
  peak_pnl: number | null;
}

interface UserPrefs {
  hard_loss_stop_pct: number;
  profit_trail_activation_pct: number;
  profit_trail_distance_pct: number;
}

export type TradeJobOutcome =
  | { action: 'closed'; exitReason: string; pnl: number }
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

    const res = await fetch(url, { cache: 'no-store' });
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
      'id, user_id, symbol, strategy, option_type, ' +
      'long_strike, long_expiry, short_strike, short_expiry, ' +
      'net_debit, max_gain, max_loss, peak_pnl',
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
    .select('hard_loss_stop_pct, profit_trail_activation_pct, profit_trail_distance_pct')
    .eq('user_id', userId)
    .maybeSingle();

  return {
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
  const { error } = await supabaseAdmin
    .from('option_paper_trades')
    .update({
      status: 'closed',
      exit_at: new Date().toISOString(),
      exit_price: currentValue,
      pnl,
      auto_exit_reason: exitReason,
    })
    .eq('id', trade.id);

  if (error) throw new Error(`closeTrade(${trade.id}): ${error.message}`);
}

async function savePeakPnl(tradeId: string, peakPnl: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from('option_paper_trades')
    .update({ peak_pnl: peakPnl })
    .eq('id', tradeId);

  if (error) throw new Error(`savePeakPnl(${tradeId}): ${error.message}`);
}

// ── Public: fetch IDs for the enqueue step ───────────────────────────────────

/**
 * Returns all open trade IDs.
 * Called by the options-cycle cron route before calling enqueueOptionsCycleJobs().
 */
export async function fetchAllOpenTradeIds(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('option_paper_trades')
    .select('id')
    .eq('status', 'open');

  if (error) throw new Error(`fetchAllOpenTradeIds: ${error.message}`);
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

  // Fetch long-leg price
  const longOcc = buildOccSymbol(trade.symbol, trade.long_expiry, longCt, trade.long_strike);
  const longPrice = await fetchOptionMidPrice(trade.symbol, longOcc);
  await sleep(CALL_DELAY_MS);

  if (longPrice === null) {
    return { action: 'price_unavailable' };
  }

  // For spreads, fetch short-leg and compute net value
  let currentValue = longPrice;
  if (trade.short_strike !== null && trade.short_expiry !== null) {
    const shortOcc = buildOccSymbol(trade.symbol, trade.short_expiry, longCt, trade.short_strike);
    const shortPrice = await fetchOptionMidPrice(trade.symbol, shortOcc);
    await sleep(CALL_DELAY_MS);
    if (shortPrice !== null) {
      currentValue = longPrice - shortPrice;
    }
  }

  const currentPnl = (currentValue - trade.net_debit) * 100;
  const peakPnl = Math.max(trade.peak_pnl ?? currentPnl, currentPnl);

  const prefs = await fetchUserPrefs(trade.user_id);

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
    await closeTrade(trade, currentValue, reason);

    const pnlLabel = `${currentPnl >= 0 ? '+' : ''}$${currentPnl.toFixed(2)}`;
    const stratLabel = trade.strategy.replace(/_/g, ' ');

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
