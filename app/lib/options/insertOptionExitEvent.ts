/**
 * Shared helper — write one audit row to option_exit_events on every trade close.
 *
 * SQL to create the table (run once in Supabase SQL editor):
 * ─────────────────────────────────────────────────────────────────────────────
 *   create table if not exists public.option_exit_events (
 *     id              uuid        primary key default gen_random_uuid(),
 *     trade_id        uuid        not null,
 *     user_id         uuid        not null,
 *     symbol          text        not null,
 *     strategy        text,
 *     direction       text,
 *     exit_reason     text        not null,
 *     raw_exit_reason text,
 *     exit_at         timestamptz not null,
 *     entry_at        timestamptz,
 *     net_debit       numeric(18,6),
 *     pnl             numeric(18,6),
 *     execution_mode  text,
 *     created_at      timestamptz not null default now(),
 *     constraint option_exit_events_trade_uq unique (trade_id)
 *   );
 *   create index if not exists oee_user_exit_idx  on public.option_exit_events (user_id,    exit_at desc);
 *   create index if not exists oee_reason_idx     on public.option_exit_events (exit_reason, exit_at desc);
 *   create index if not exists oee_symbol_idx     on public.option_exit_events (symbol,     exit_at desc);
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { supabaseAdmin } from '@/app/lib/supabaseAdmin';

export interface OptionExitEventParams {
  tradeId: string;
  userId: string;
  symbol: string;
  strategy?: string | null;
  direction?: string | null;
  rawExitReason: string;
  exitAt?: string;        // ISO string; defaults to now
  entryAt?: string | null;
  netDebit?: number | null;
  pnl?: number | null;
  executionMode?: string | null;
}

/**
 * Normalize the raw auto_exit_reason into a stable bucketed value for reporting.
 */
function normalizeExitReason(raw: string): string {
  if (raw.startsWith('trail-stop') || raw === 'trail_closed') return 'trail_stop';
  if (raw.startsWith('hard-loss-stop')) return 'hard_loss';
  if (raw === 'broker-exit-filled') return 'broker_filled';
  if (raw === 'entry_order_failed') return 'entry_failed';
  if (raw === 'manual') return 'manual';
  return 'other';
}

/**
 * Upsert one audit row for a closed option trade.
 * Uses ON CONFLICT DO NOTHING so duplicate calls are safe.
 */
export async function insertOptionExitEvent(params: OptionExitEventParams): Promise<void> {
  const exitReason = normalizeExitReason(params.rawExitReason);
  const exitAt = params.exitAt ?? new Date().toISOString();

  const { error } = await supabaseAdmin
    .from('option_exit_events')
    .upsert(
      {
        trade_id:       params.tradeId,
        user_id:        params.userId,
        symbol:         params.symbol,
        strategy:       params.strategy ?? null,
        direction:      params.direction ?? null,
        exit_reason:    exitReason,
        raw_exit_reason: params.rawExitReason,
        exit_at:        exitAt,
        entry_at:       params.entryAt ?? null,
        net_debit:      params.netDebit ?? null,
        pnl:            params.pnl ?? null,
        execution_mode: params.executionMode ?? null,
      },
      { onConflict: 'trade_id', ignoreDuplicates: true },
    );

  if (error) {
    // Non-fatal — log but never crash the calling path
    console.warn(`[option-exit-event] upsert failed for trade ${params.tradeId}: ${error.message}`);
  }
}
