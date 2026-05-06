import { supabaseAdmin } from '@/app/lib/supabaseAdmin';
import { getBrokerExecutionMode } from '@/app/lib/broker/getBrokerExecutionMode';

type BrokerBackedOptionTrade = {
  id: string;
  user_id: string;
  symbol: string;
  strategy: string;
  qty_contracts: number | null;
  execution_mode_snapshot: string | null;
  broker_status: string | null;
  entry_broker_order_id: string | null;
  exit_broker_order_id: string | null;
};

type RequestOptionBrokerCloseResult =
  | { ok: true; mode: 'paper' | 'live'; idempotencyKey: string }
  | { ok: false; reason: string };

function resolveRequestedMode(snapshot: string | null): 'paper' | 'live' {
  return snapshot === 'live' ? 'live' : 'paper';
}

async function checkOptionBrokerAccountCanTrade(params: {
  userId: string;
  expectedMode: 'paper' | 'live';
}): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  const { data: account, error } = await supabaseAdmin
    .from('broker_accounts')
    .select(
      'is_paper, trading_blocked, account_blocked, options_approved_level, options_trading_level',
    )
    .eq('user_id', params.userId)
    .eq('broker', 'alpaca')
    .order('last_synced_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { allowed: false, reason: error.message };
  }

  if (!account) {
    return { allowed: false, reason: 'Broker account not synced.' };
  }

  const accountMode = account.is_paper ? 'paper' : 'live';
  if (accountMode !== params.expectedMode) {
    return {
      allowed: false,
      reason: `Broker account mode mismatch. Expected ${params.expectedMode}, found ${accountMode}.`,
    };
  }

  if (account.account_blocked || account.trading_blocked) {
    return { allowed: false, reason: 'Broker account is blocked from trading.' };
  }

  if (params.expectedMode === 'live') {
    const approvedLevel = Number(account.options_approved_level || 0);
    const tradingLevel = Number(account.options_trading_level || 0);
    if (approvedLevel <= 0 && tradingLevel <= 0) {
      return {
        allowed: false,
        reason: 'Broker account is not approved for live options trading.',
      };
    }
  }

  return { allowed: true };
}

async function insertOptionOrderRun(params: {
  trade: BrokerBackedOptionTrade;
  action: 'close';
  executionMode: 'paper' | 'live';
  exitReason: string;
  currentValue: number;
  currentPnl: number;
}) {
  const idempotencyKey = `option-exit:${params.trade.id}:${params.executionMode}`;
  const row = {
    user_id: params.trade.user_id,
    trade_id: params.trade.id,
    broker: 'alpaca',
    action: params.action,
    trigger_source: 'options-cycle',
    execution_mode: params.executionMode,
    status: 'pending_submission',
    reason: params.exitReason,
    idempotency_key: idempotencyKey,
    request_payload: {
      symbol: params.trade.symbol,
      strategy: params.trade.strategy,
      qtyContracts: params.trade.qty_contracts ?? 1,
      exitReason: params.exitReason,
      currentValue: params.currentValue,
      currentPnl: params.currentPnl,
      entryBrokerOrderId: params.trade.entry_broker_order_id,
    },
  };

  const { error } = await supabaseAdmin
    .from('option_order_runs')
    .insert(row);

  if (error && error.code !== '23505') {
    throw new Error(`insertOptionOrderRun(${params.trade.id}): ${error.message}`);
  }

  return idempotencyKey;
}

export async function requestOptionBrokerClose(params: {
  trade: BrokerBackedOptionTrade;
  exitReason: string;
  currentValue: number;
  currentPnl: number;
}): Promise<RequestOptionBrokerCloseResult> {
  const { trade } = params;

  if (!trade.entry_broker_order_id) {
    return { ok: false, reason: 'Trade is not linked to a broker entry order.' };
  }

  if (trade.broker_status === 'close_pending' || trade.broker_status === 'close_submitted') {
    return { ok: true, mode: resolveRequestedMode(trade.execution_mode_snapshot), idempotencyKey: `option-exit:${trade.id}:${resolveRequestedMode(trade.execution_mode_snapshot)}` };
  }

  const executionMode = resolveRequestedMode(trade.execution_mode_snapshot);
  const brokerMode = await getBrokerExecutionMode(trade.user_id);

  if (!brokerMode.enabled || brokerMode.mode !== executionMode) {
    return {
      ok: false,
      reason: brokerMode.reason || `Broker execution mode mismatch. Expected ${executionMode}.`,
    };
  }

  const guard = await checkOptionBrokerAccountCanTrade({
    userId: trade.user_id,
    expectedMode: executionMode,
  });

  if (!guard.allowed) {
    return { ok: false, reason: guard.reason };
  }

  const idempotencyKey = await insertOptionOrderRun({
    trade,
    action: 'close',
    executionMode,
    exitReason: params.exitReason,
    currentValue: params.currentValue,
    currentPnl: params.currentPnl,
  });

  const { error } = await supabaseAdmin
    .from('option_paper_trades')
    .update({
      broker_status: 'close_pending',
      close_requested_at: new Date().toISOString(),
      auto_exit_reason: params.exitReason,
    })
    .eq('id', trade.id);

  if (error) {
    throw new Error(`requestOptionBrokerClose(${trade.id}): ${error.message}`);
  }

  return { ok: true, mode: executionMode, idempotencyKey };
}