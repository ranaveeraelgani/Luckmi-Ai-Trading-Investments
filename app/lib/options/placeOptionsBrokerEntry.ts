/**
 * O4 — Options broker entry execution
 *
 * Called when a user triggers "Trade" on an opportunity and broker execution is enabled.
 * Submits a single-leg or spread opening order to Alpaca (paper or live),
 * persists the trade row in option_paper_trades with broker lifecycle fields,
 * and records an option_order_runs audit row.
 */

import { supabaseAdmin } from '@/app/lib/supabaseAdmin';
import { getUserBrokerCredentials } from '@/app/lib/broker/getUserBrokerCredentials';
import { getBrokerExecutionMode } from '@/app/lib/broker/getBrokerExecutionMode';
import { placeAlpacaOptionOrder } from '@/app/lib/broker/alpaca';
import { parseOptionContractSymbol } from '@/app/lib/broker/alpaca';
import { getOptionPreferences } from '@/app/lib/db/optionPreferences';
import { enqueueNotificationEvent } from '@/app/lib/db/notifications';

// ── Types ─────────────────────────────────────────────────────────────────────

export type OptionsEntryRequest = {
  userId: string;
  /** Underlying ticker, e.g. AAPL */
  symbol: string;
  direction: 'bullish' | 'bearish';
  strategy: 'call_debit_spread' | 'put_debit_spread' | 'long_call' | 'long_put';
  /** Full OCC option symbol of the long leg, e.g. AAPL260620C00200000 */
  longOccSymbol: string;
  /** Full OCC option symbol of the short leg for spreads, null for single-leg */
  shortOccSymbol: string | null;
  longStrike: number;
  longExpiry: string;      // YYYY-MM-DD
  shortStrike: number | null;
  shortExpiry: string | null;
  optionType: 'call' | 'put';
  /** Net debit per share (not per contract) */
  netDebit: number;
  maxGain: number | null;
  maxLoss: number | null;
  entryScore: number | null;
  entrySpotPrice: number | null;
  qtyContracts?: number;
  /** AI recommendation fields — persisted to ai_decisions when provided */
  aiAction?: 'Enter' | 'Watch' | 'Avoid';
  aiReason?: string;
  aiConfidence?: number;
  aiRiskFlags?: string[];
  /** 'auto_entry' when placed by cron, 'manual' when placed by user */
  aiSource?: 'auto_entry' | 'manual';
};

export type OptionsEntryResult =
  | { ok: true; tradeId: string; brokerOrderId: string; executionMode: 'paper' | 'live' }
  | { ok: false; reason: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeClientOrderId(userId: string, tradeId: string, side: 'buy' | 'sell') {
  return `luckmi-opt-${userId.slice(0, 8)}-${tradeId.slice(0, 8)}-${side}-${Date.now()}`;
}

async function insertOptionOrderRunEntry(params: {
  userId: string;
  tradeId: string;
  executionMode: 'paper' | 'live';
  brokerOrderId: string;
  clientOrderId: string;
  occSymbol: string;
  qtyContracts: number;
  netDebit: number;
  orderStatus: string;
  triggerSource: string;
  legSuffix?: string;
}) {
  const key = `option-entry:${params.tradeId}:${params.executionMode}${params.legSuffix ?? ''}`;
  await supabaseAdmin.from('option_order_runs').insert({
    user_id: params.userId,
    trade_id: params.tradeId,
    broker: 'alpaca',
    action: 'entry',
    trigger_source: params.triggerSource,
    execution_mode: params.executionMode,
    status: params.orderStatus === 'filled' ? 'filled' : 'submitted',
    idempotency_key: key,
    broker_order_id: params.brokerOrderId,
    request_payload: {
      occSymbol: params.occSymbol,
      qtyContracts: params.qtyContracts,
      netDebit: params.netDebit,
      clientOrderId: params.clientOrderId,
    },
    response_payload: { status: params.orderStatus },
    submitted_at: new Date().toISOString(),
  });
  return key;
}

async function persistOptionTradeOrders(params: {
  tradeId: string;
  brokerOrderId: string;
  clientOrderId: string;
  occSymbol: string;
  underlying: string;
  side: 'buy' | 'sell';
  qtyContracts: number;
  orderStatus: string;
  rawOrder: any;
}) {
  const parsed = parseOptionContractSymbol(params.occSymbol);
  await supabaseAdmin.from('option_trade_orders').insert({
    trade_id: params.tradeId,
    broker: 'alpaca',
    broker_order_id: params.brokerOrderId,
    client_order_id: params.clientOrderId,
    order_role: 'entry',
    option_symbol: params.occSymbol,
    underlying_symbol: params.underlying,
    side: params.side,
    qty: params.qtyContracts,
    status: params.orderStatus,
    filled_qty: params.rawOrder?.filled_qty ?? null,
    filled_avg_price: params.rawOrder?.filled_avg_price ?? null,
    submitted_at: params.rawOrder?.submitted_at ?? new Date().toISOString(),
    filled_at: params.rawOrder?.filled_at ?? null,
    raw_order: params.rawOrder,
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function placeOptionsBrokerEntry(
  req: OptionsEntryRequest,
): Promise<OptionsEntryResult> {
  const {
    userId,
    symbol,
    direction,
    strategy,
    longOccSymbol,
    shortOccSymbol,
    longStrike,
    longExpiry,
    shortStrike,
    shortExpiry,
    optionType,
    netDebit,
    maxGain,
    maxLoss,
    entryScore,
    entrySpotPrice,
    qtyContracts = 1,
  } = req;

  const triggerSource = req.aiSource === 'auto_entry' ? 'auto_entry' : 'user';
  const isSpread = !!shortOccSymbol && (strategy === 'call_debit_spread' || strategy === 'put_debit_spread');

  // 1. Broker mode gate
  const brokerMode = await getBrokerExecutionMode(userId);
  if (!brokerMode.enabled) {
    return { ok: false, reason: brokerMode.reason ?? 'Broker execution not enabled.' };
  }
  const executionMode = brokerMode.mode!;

  // 2. Per-contract cost cap
  const prefs = await getOptionPreferences(userId);
  const contractCost = netDebit * 100 * qtyContracts;
  if (contractCost > prefs.max_loss_per_trade * qtyContracts) {
    return { ok: false, reason: `Exceeds per-contract cap of $${prefs.max_loss_per_trade}.` };
  }

  // 3. Load credentials
  const credentials = await getUserBrokerCredentials(userId);

  // 4. Insert trade row first so we have an ID for the order audit
  const tradeInsert = {
    user_id: userId,
    symbol: symbol.toUpperCase(),
    direction,
    strategy,
    long_strike: longStrike,
    long_expiry: longExpiry,
    short_strike: shortStrike ?? null,
    short_expiry: shortExpiry ?? null,
    option_type: optionType,
    net_debit: netDebit,
    max_gain: maxGain ?? null,
    max_loss: maxLoss ?? null,
    entry_score: entryScore ?? null,
    entry_spot_price: entrySpotPrice ?? null,
    qty_contracts: Math.max(1, Math.floor(qtyContracts)),
    execution_mode_snapshot: executionMode,
    broker_status: 'entry_pending',
    status: 'open',
  };

  const { data: tradeRow, error: tradeError } = await supabaseAdmin
    .from('option_paper_trades')
    .insert(tradeInsert)
    .select('id')
    .single();

  if (tradeError || !tradeRow) {
    throw new Error(`Failed to insert option trade: ${tradeError?.message}`);
  }

  const tradeId = tradeRow.id as string;

  // 5. Submit entry order to Alpaca — buy the long leg
  const clientOrderId = makeClientOrderId(userId, tradeId, 'buy');
  let order: any;
  try {
    order = await placeAlpacaOptionOrder({
      credentials,
      optionSymbol: longOccSymbol,
      side: 'buy',
      qtyContracts,
      type: 'market',
      timeInForce: 'day',
      clientOrderId,
    });
  } catch (err: any) {
    // Mark trade failed so it doesn't show as live
    await supabaseAdmin
      .from('option_paper_trades')
      .update({ broker_status: 'entry_failed', status: 'closed', auto_exit_reason: 'entry_order_failed' })
      .eq('id', tradeId);
    return { ok: false, reason: err?.message ?? 'Alpaca order submission failed.' };
  }

  const brokerOrderId: string = order.id;

  // 6. Update trade row with broker entry order link
  await supabaseAdmin
    .from('option_paper_trades')
    .update({
      entry_broker_order_id: brokerOrderId,
      broker_status: order.status === 'filled' ? 'entry_filled' : 'entry_submitted',
    })
    .eq('id', tradeId);

  // 7. Persist audit rows for long leg
  await insertOptionOrderRunEntry({
    userId,
    tradeId,
    executionMode,
    brokerOrderId,
    clientOrderId,
    occSymbol: longOccSymbol,
    qtyContracts,
    netDebit,
    orderStatus: order.status,
    triggerSource,
    legSuffix: isSpread ? ':long' : undefined,
  });

  await persistOptionTradeOrders({
    tradeId,
    brokerOrderId,
    clientOrderId,
    occSymbol: longOccSymbol,
    underlying: symbol.toUpperCase(),
    side: 'buy',
    qtyContracts,
    orderStatus: order.status,
    rawOrder: order,
  });

  // 7b. For spread strategies: place short leg sell order
  if (isSpread && shortOccSymbol) {
    const shortClientOrderId = makeClientOrderId(userId, tradeId, 'sell');
    try {
      const shortOrder = await placeAlpacaOptionOrder({
        credentials,
        optionSymbol: shortOccSymbol,
        side: 'sell',
        qtyContracts,
        type: 'market',
        timeInForce: 'day',
        clientOrderId: shortClientOrderId,
      });
      const shortBrokerOrderId: string = shortOrder.id;

      await insertOptionOrderRunEntry({
        userId,
        tradeId,
        executionMode,
        brokerOrderId: shortBrokerOrderId,
        clientOrderId: shortClientOrderId,
        occSymbol: shortOccSymbol,
        qtyContracts,
        netDebit: 0,
        orderStatus: shortOrder.status,
        triggerSource,
        legSuffix: ':short',
      });

      await persistOptionTradeOrders({
        tradeId,
        brokerOrderId: shortBrokerOrderId,
        clientOrderId: shortClientOrderId,
        occSymbol: shortOccSymbol,
        underlying: symbol.toUpperCase(),
        side: 'sell',
        qtyContracts,
        orderStatus: shortOrder.status,
        rawOrder: shortOrder,
      });

      console.info(
        `[options-entry] SPREAD short leg submitted tradeId=${tradeId} symbol=${shortOccSymbol} ` +
        `orderId=${shortBrokerOrderId} mode=${executionMode}`,
      );
    } catch (shortErr: any) {
      // Non-fatal: long leg is placed; log the failure so it can be reconciled manually
      console.error(
        `[options-entry] SPREAD short leg FAILED tradeId=${tradeId} shortSymbol=${shortOccSymbol}:`,
        shortErr?.message,
      );
      await supabaseAdmin
        .from('option_paper_trades')
        .update({ broker_status: 'entry_short_leg_failed' })
        .eq('id', tradeId);
    }
  }

  // 8. Persist AI decision record if AI fields were supplied
  if (req.aiAction) {
    try {
      await supabaseAdmin.from('ai_decisions').insert({
        user_id: userId,
        symbol: symbol.toUpperCase(),
        action: req.aiAction,
        reason: req.aiReason ?? null,
        confidence: req.aiConfidence ?? null,
        option_trade_id: tradeId,
        option_strategy: strategy,
        option_direction: direction,
        ocs_score: entryScore ?? null,
        risk_flags: req.aiRiskFlags?.length ? req.aiRiskFlags : null,
        created_at: new Date().toISOString(),
      });
    } catch (aiErr: any) {
      // Non-fatal — trade is already placed; log and continue
      console.warn(`[options-entry] ai_decisions insert failed tradeId=${tradeId}:`, aiErr?.message);
    }
  }

  // 9. Entry notification
  await enqueueNotificationEvent({
    userId,
    type: 'option_entry',
    title: `Option entry submitted: ${symbol.toUpperCase()}`,
    body: `${strategy.replace(/_/g, ' ')} submitted to Alpaca ${executionMode} — ${qtyContracts} contract(s) at $${(netDebit * 100).toFixed(2)}`,
    url: '/options',
    idempotencyKey: `option-entry-submitted:${tradeId}`,
    metadata: { tradeId, brokerOrderId, executionMode, triggerSource },
  });

  console.info(
    `[options-entry] SUBMITTED tradeId=${tradeId} symbol=${symbol} ` +
    `orderId=${brokerOrderId} mode=${executionMode} qty=${qtyContracts}`,
  );

  return { ok: true, tradeId, brokerOrderId, executionMode };
}
