/**
 * O6 — Options broker fill reconciliation
 *
 * Polls Alpaca for option_trade_orders that are submitted but not yet filled,
 * updates the trade lifecycle when fills arrive, and closes option_paper_trades
 * with real fill price when exit orders are confirmed.
 *
 * Called by the options-order-runs-drain cron route after submitPendingOptionExits().
 */

import { supabaseAdmin } from '@/app/lib/supabaseAdmin';
import { getUserBrokerCredentials } from '@/app/lib/broker/getUserBrokerCredentials';
import { getAlpacaOrder } from '@/app/lib/broker/alpaca';
import { enqueueNotificationEvent } from '@/app/lib/db/notifications';
import { insertOptionExitEvent } from '@/app/lib/options/insertOptionExitEvent';
import { syncOptionTradeNetDebitFromEntryFills } from '@/app/lib/options/syncOptionTradeNetDebit';

// ── Types ─────────────────────────────────────────────────────────────────────

type UnfilledOrderRow = {
  id: string;
  trade_id: string;
  broker_order_id: string;
  order_role: 'entry' | 'exit';
  side: 'buy' | 'sell';
  qty: number;
};

// ── DB helpers ────────────────────────────────────────────────────────────────

async function fetchUnfilledOptionOrders(limit: number, tradeIds?: string[]): Promise<UnfilledOrderRow[]> {
  if (tradeIds && tradeIds.length === 0) {
    return [];
  }

  // Fetch submitted/pending option trade orders that have no fill yet
  let query = supabaseAdmin
    .from('option_trade_orders')
    .select('id, trade_id, broker_order_id, order_role, side, qty')
    .in('status', ['pending_new', 'new', 'partially_filled', 'accepted', 'held'])
    .is('filled_at', null)
    .order('submitted_at', { ascending: true })
    .limit(limit);

  if (tradeIds) {
    query = query.in('trade_id', tradeIds);
  }

  const { data, error } = await query;

  if (error) throw new Error(`fetchUnfilledOptionOrders: ${error.message}`);
  return (data ?? []) as UnfilledOrderRow[];
}

async function fetchUserForOrder(tradeId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('option_paper_trades')
    .select('user_id')
    .eq('id', tradeId)
    .maybeSingle();
  return data?.user_id ?? null;
}

async function updateOptionTradeOrder(orderRowId: string, alpacaOrder: any) {
  await supabaseAdmin
    .from('option_trade_orders')
    .update({
      status: alpacaOrder.status,
      filled_qty: alpacaOrder.filled_qty ?? null,
      filled_avg_price: alpacaOrder.filled_avg_price ?? null,
      filled_at: alpacaOrder.filled_at ?? null,
      raw_order: alpacaOrder,
    })
    .eq('id', orderRowId);
}

async function closeOptionTrade(params: {
  tradeId: string;
  exitPrice: number;
  pnl: number;
  exitReason: string;
}) {
  await supabaseAdmin
    .from('option_paper_trades')
    .update({
      status: 'closed',
      broker_status: 'exit_filled',
      exit_at: new Date().toISOString(),
      exit_price: params.exitPrice,
      pnl: params.pnl,
      auto_exit_reason: params.exitReason,
    })
    .eq('id', params.tradeId)
    .eq('status', 'open'); // safety: only close if still open
}

async function markEntryFilled(tradeId: string) {
  await supabaseAdmin
    .from('option_paper_trades')
    .update({ broker_status: 'entry_filled' })
    .eq('id', tradeId)
    .eq('broker_status', 'entry_submitted');
}

// ── Reconcile one order ───────────────────────────────────────────────────────

async function reconcileOrder(row: UnfilledOrderRow): Promise<'filled' | 'still_open' | 'skipped'> {
  const userId = await fetchUserForOrder(row.trade_id);
  if (!userId) return 'skipped';

  let credentials: Awaited<ReturnType<typeof getUserBrokerCredentials>>;
  try {
    credentials = await getUserBrokerCredentials(userId);
  } catch {
    return 'skipped';
  }

  let alpacaOrder: any;
  try {
    alpacaOrder = await getAlpacaOrder(credentials, row.broker_order_id);
  } catch {
    return 'skipped';
  }

  const status: string = alpacaOrder.status ?? '';
  const isFilled = status === 'filled' && Number(alpacaOrder.filled_qty) > 0 && Number(alpacaOrder.filled_avg_price) > 0;

  // Update the order row regardless
  await updateOptionTradeOrder(row.id, alpacaOrder);

  if (!isFilled) return 'still_open';

  const filledAvgPrice = Number(alpacaOrder.filled_avg_price);

  if (row.order_role === 'entry') {
    // Entry confirmed — update broker_status and align trade debit with real fill prices
    await markEntryFilled(row.trade_id);
    await syncOptionTradeNetDebitFromEntryFills(row.trade_id);

    // For spread entries there are two entry orders (buy long + sell short).
    // Notify only on the buy/long leg to avoid duplicate fill notifications.
    if (row.side === 'buy') {
      const { data: trade } = await supabaseAdmin
        .from('option_paper_trades')
        .select('user_id, symbol, strategy, qty_contracts')
        .eq('id', row.trade_id)
        .maybeSingle();

      if (trade?.user_id) {
        const qty = Number(trade.qty_contracts ?? row.qty ?? 1);
        await enqueueNotificationEvent({
          userId: trade.user_id,
          type: 'option_entry',
          title: `Option entry filled: ${trade.symbol}`,
          body: `${String(trade.strategy || 'option').replace(/_/g, ' ')} filled at $${filledAvgPrice.toFixed(4)} — ${qty} contract(s)`,
          url: '/options',
          idempotencyKey: `option-entry-filled:${row.trade_id}:${row.broker_order_id}`,
          metadata: { tradeId: row.trade_id, fillPrice: filledAvgPrice, qty },
        });
      }
    }

    return 'filled';
  }

  if (row.order_role === 'exit') {
    // Fetch net_debit from the trade to compute final P&L
    const { data: trade } = await supabaseAdmin
      .from('option_paper_trades')
      .select('net_debit, auto_exit_reason, user_id, symbol, strategy, direction, execution_mode_snapshot, created_at')
      .eq('id', row.trade_id)
      .maybeSingle();

    if (!trade) return 'skipped';

    // Exit fill price is per share (Alpaca returns per-share for options)
    const exitPrice = filledAvgPrice;
    const pnl = (exitPrice - Number(trade.net_debit)) * 100;
    const exitReason = trade.auto_exit_reason ?? 'broker-exit-filled';

    await closeOptionTrade({
      tradeId: row.trade_id,
      exitPrice,
      pnl,
      exitReason,
    });

    await insertOptionExitEvent({
      tradeId:       row.trade_id,
      userId:        trade.user_id,
      symbol:        trade.symbol,
      strategy:      trade.strategy ?? null,
      direction:     trade.direction ?? null,
      rawExitReason: exitReason,
      exitAt:        new Date().toISOString(),
      entryAt:       trade.created_at ?? null,
      netDebit:      Number(trade.net_debit),
      pnl,
      executionMode: trade.execution_mode_snapshot ?? null,
    });

    const pnlLabel = `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`;
    await enqueueNotificationEvent({
      userId: trade.user_id,
      type: 'option_auto_closed',
      title: `Option closed: ${trade.symbol}`,
      body: `Exit filled at $${exitPrice.toFixed(4)} — P&L ${pnlLabel}`,
      url: '/options',
      idempotencyKey: `option-exit-filled:${row.trade_id}:${row.broker_order_id}`,
      metadata: { tradeId: row.trade_id, exitPrice, pnl, exitReason },
    });

    console.info(
      `[options-reconcile] CLOSED tradeId=${row.trade_id} symbol=${trade.symbol} ` +
      `exitPrice=${exitPrice} pnl=${pnl.toFixed(2)} reason=${exitReason}`,
    );

    return 'filled';
  }

  return 'still_open';
}

// ── Public: batch reconciler ──────────────────────────────────────────────────

export async function reconcileOptionBrokerFills(batchSize = 20, tradeIds?: string[]): Promise<{
  processed: number;
  filled: number;
  stillOpen: number;
  skipped: number;
}> {
  const orders = await fetchUnfilledOptionOrders(batchSize, tradeIds);

  let filled = 0;
  let stillOpen = 0;
  let skipped = 0;

  for (const order of orders) {
    try {
      const result = await reconcileOrder(order);
      if (result === 'filled') filled++;
      else if (result === 'still_open') stillOpen++;
      else skipped++;
    } catch (err: any) {
      console.error(`[options-reconcile] ERROR order=${order.id}:`, err?.message);
      skipped++;
    }
  }

  console.info(
    `[options-reconcile] batch done processed=${orders.length} ` +
    `filled=${filled} stillOpen=${stillOpen} skipped=${skipped}`,
  );

  return { processed: orders.length, filled, stillOpen, skipped };
}
