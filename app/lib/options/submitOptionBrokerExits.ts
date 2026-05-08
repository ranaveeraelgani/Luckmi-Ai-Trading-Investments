/**
 * O5 — Options broker exit submission
 *
 * Processes option_order_runs rows in status='pending_submission' (action='close')
 * and fires the Alpaca sell order for each one.
 *
 * Called by the options-order-runs-drain cron route.
 * Separate from the price-scan cycle so exits are submitted promptly
 * and don't block the next scan batch.
 */

import { supabaseAdmin } from '@/app/lib/supabaseAdmin';
import { getUserBrokerCredentials } from '@/app/lib/broker/getUserBrokerCredentials';
import { placeAlpacaOptionOrder } from '@/app/lib/broker/alpaca';
import { enqueueNotificationEvent } from '@/app/lib/db/notifications';

// ── Types ─────────────────────────────────────────────────────────────────────

type PendingExitRun = {
  id: string;
  user_id: string;
  trade_id: string;
  execution_mode: string;
  reason: string | null;
  idempotency_key: string;
  request_payload: {
    symbol: string;
    strategy: string;
    qtyContracts: number;
    exitReason: string;
    currentValue: number;
    currentPnl: number;
    entryBrokerOrderId: string | null;
  };
};

type ExitRunOutcome =
  | { action: 'submitted'; brokerOrderId: string }
  | { action: 'skipped'; reason: string }
  | { action: 'failed'; error: string };

// ── DB helpers ────────────────────────────────────────────────────────────────

async function claimPendingExitRuns(batchSize: number, tradeIds?: string[]): Promise<PendingExitRun[]> {
  if (tradeIds && tradeIds.length === 0) {
    return [];
  }

  let query = supabaseAdmin
    .from('option_order_runs')
    .select('id, user_id, trade_id, execution_mode, reason, idempotency_key, request_payload')
    .eq('action', 'close')
    .eq('status', 'pending_submission')
    .order('created_at', { ascending: true })
    .limit(batchSize);

  if (tradeIds) {
    query = query.in('trade_id', tradeIds);
  }

  const { data, error } = await query;

  if (error) throw new Error(`claimPendingExitRuns: ${error.message}`);
  return (data ?? []) as PendingExitRun[];
}

async function markRunSubmitted(runId: string, brokerOrderId: string) {
  await supabaseAdmin
    .from('option_order_runs')
    .update({
      status: 'submitted',
      broker_order_id: brokerOrderId,
      submitted_at: new Date().toISOString(),
    })
    .eq('id', runId);
}

async function markRunFailed(runId: string, errorMessage: string) {
  await supabaseAdmin
    .from('option_order_runs')
    .update({ status: 'failed', error_message: errorMessage.slice(0, 1000) })
    .eq('id', runId);
}

async function fetchTradeLongLeg(tradeId: string): Promise<{
  symbol: string;
  long_expiry: string;
  long_strike: number;
  option_type: 'call' | 'put';
  qty_contracts: number;
} | null> {
  const { data } = await supabaseAdmin
    .from('option_paper_trades')
    .select('symbol, long_expiry, long_strike, option_type, qty_contracts, strategy')
    .eq('id', tradeId)
    .maybeSingle();

  if (!data) return null;

  return {
    symbol: data.symbol,
    long_expiry: data.long_expiry,
    long_strike: data.long_strike,
    option_type: data.option_type ?? (
      data.strategy?.includes('call') ? 'call' : 'put'
    ),
    qty_contracts: data.qty_contracts ?? 1,
  };
}

function buildOccSymbol(
  underlying: string,
  expiry: string,   // YYYY-MM-DD
  optionType: 'call' | 'put',
  strike: number,
): string {
  const [year, month, day] = expiry.split('-');
  const yy = year.slice(2);
  const cp = optionType === 'call' ? 'C' : 'P';
  const strikeInt = Math.round(strike * 1000);
  const strikePadded = strikeInt.toString().padStart(8, '0');
  return `${underlying}${yy}${month}${day}${cp}${strikePadded}`;
}

// ── Process one pending exit run ──────────────────────────────────────────────

async function processExitRun(run: PendingExitRun): Promise<ExitRunOutcome> {
  const { trade_id, execution_mode, request_payload } = run;

  // Load the long leg to build the OCC exit symbol
  const trade = await fetchTradeLongLeg(trade_id);
  if (!trade) {
    return { action: 'skipped', reason: 'Trade no longer exists' };
  }

  const occSymbol = buildOccSymbol(
    trade.symbol,
    trade.long_expiry,
    trade.option_type,
    trade.long_strike,
  );

  const qtyContracts = request_payload.qtyContracts ?? trade.qty_contracts ?? 1;
  const executionMode = (execution_mode === 'live' ? 'live' : 'paper') as 'paper' | 'live';

  let credentials: Awaited<ReturnType<typeof getUserBrokerCredentials>>;
  try {
    credentials = await getUserBrokerCredentials(run.user_id);
  } catch (err: any) {
    return { action: 'failed', error: err?.message ?? 'No broker credentials' };
  }

  // Validate mode matches stored snapshot
  const expectedPaper = executionMode === 'paper';
  if (credentials.isPaper !== expectedPaper) {
    return {
      action: 'skipped',
      reason: `Broker mode mismatch: run expects ${executionMode} but credentials are ${credentials.isPaper ? 'paper' : 'live'}`,
    };
  }

  const clientOrderId = `luckmi-opt-exit-${run.user_id.slice(0, 8)}-${trade_id.slice(0, 8)}-${Date.now()}`;

  let order: any;
  try {
    order = await placeAlpacaOptionOrder({
      credentials,
      optionSymbol: occSymbol,
      side: 'sell',
      qtyContracts,
      type: 'market',
      timeInForce: 'day',
      clientOrderId,
    });
  } catch (err: any) {
    return { action: 'failed', error: err?.message ?? 'Alpaca sell order failed' };
  }

  const brokerOrderId: string = order.id;
  const exitReason = request_payload.exitReason ?? run.reason ?? 'auto-exit';

  // Update trade with exit order details
  await supabaseAdmin
    .from('option_paper_trades')
    .update({
      exit_broker_order_id: brokerOrderId,
      broker_status: 'close_submitted',
    })
    .eq('id', trade_id);

  // Persist exit order audit row
  await supabaseAdmin.from('option_trade_orders').insert({
    trade_id,
    broker: 'alpaca',
    broker_order_id: brokerOrderId,
    client_order_id: clientOrderId,
    order_role: 'exit',
    option_symbol: occSymbol,
    underlying_symbol: trade.symbol,
    side: 'sell',
    qty: qtyContracts,
    status: order.status,
    filled_qty: order.filled_qty ?? null,
    filled_avg_price: order.filled_avg_price ?? null,
    submitted_at: order.submitted_at ?? new Date().toISOString(),
    filled_at: order.filled_at ?? null,
    raw_order: order,
  });

  // Notification
  const pnl = request_payload.currentPnl;
  const pnlLabel = `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`;
  await enqueueNotificationEvent({
    userId: run.user_id,
    type: 'option_auto_closed',
    title: `Option exit submitted: ${trade.symbol}`,
    body: `Sell order submitted to Alpaca ${executionMode} — ${exitReason} — P&L ~${pnlLabel}`,
    url: '/options',
    idempotencyKey: `option-exit-submitted:${trade_id}:${brokerOrderId}`,
    metadata: { tradeId: trade_id, brokerOrderId, exitReason, pnl },
  });

  console.info(
    `[options-exit] SUBMITTED tradeId=${trade_id} occSymbol=${occSymbol} ` +
    `orderId=${brokerOrderId} mode=${executionMode} qty=${qtyContracts}`,
  );

  return { action: 'submitted', brokerOrderId };
}

// ── Public: batch processor ───────────────────────────────────────────────────

export async function submitPendingOptionExits(batchSize = 10, tradeIds?: string[]): Promise<{
  processed: number;
  submitted: number;
  skipped: number;
  failed: number;
}> {
  const runs = await claimPendingExitRuns(batchSize, tradeIds);

  let submitted = 0;
  let skipped = 0;
  let failed = 0;

  for (const run of runs) {
    try {
      const outcome = await processExitRun(run);

      if (outcome.action === 'submitted') {
        await markRunSubmitted(run.id, outcome.brokerOrderId);
        submitted++;
      } else if (outcome.action === 'skipped') {
        // Put back to pending_submission so next drain can retry after mode issues resolve
        console.warn(`[options-exit] SKIPPED run=${run.id} reason=${outcome.reason}`);
        skipped++;
      } else {
        await markRunFailed(run.id, outcome.error);
        failed++;
      }
    } catch (err: any) {
      const msg = err?.message ?? 'Unknown error';
      console.error(`[options-exit] ERROR run=${run.id}:`, msg);
      await markRunFailed(run.id, msg);
      failed++;
    }
  }

  return { processed: runs.length, submitted, skipped, failed };
}
