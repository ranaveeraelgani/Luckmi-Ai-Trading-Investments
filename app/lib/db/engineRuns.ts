import { supabaseAdmin } from '@/app/lib/supabaseAdmin';

type EngineRunInput = {
  userId?: string | null;
  runType: 'manual' | 'cron';
  stocksProcessed?: number;
  tradesExecuted?: number;
  status?: 'success' | 'failed' | 'blocked' | 'error';
  blockedReason?: string | null;
  errorMessage?: string | null;
};

export async function insertEngineRun(input: EngineRunInput) {
  const { error } = await supabaseAdmin.from('engine_runs').insert({
    user_id: input.userId ?? null,
    run_type: input.runType,
    stocks_processed: input.stocksProcessed ?? 0,
    trades_executed: input.tradesExecuted ?? 0,
    status: input.status ?? 'success',
    blocked_reason: input.blockedReason ?? null,
    error_message: input.errorMessage ?? null,
  });

  if (error) {
    console.error('engine_runs insert error:', error);
  }
}