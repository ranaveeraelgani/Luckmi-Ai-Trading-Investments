import { supabaseAdmin } from '@/app/lib/supabaseAdmin';

type InsertEngineRunParams  = {
  userId?: string | null;
  runType: 'manual' | 'cron' | 'admin';
  stocksProcessed?: number;
  tradesExecuted?: number;
  status?: 'success' | 'failed' | 'blocked' | 'error';
  blockedReason?: string | null;
  errorMessage?: string | null;
};

export async function insertEngineRun({
  userId,
  runType,
  status,
  stocksProcessed = 0,
  tradesExecuted = 0,
  errorMessage = null,
  blockedReason = null,
}: InsertEngineRunParams) {
  const { error } = await supabaseAdmin.from("engine_runs").insert({
    user_id: userId,
    run_type: runType,
    status,
    trades_count: tradesExecuted,
    stocks_processed: stocksProcessed,
    error_message: errorMessage,
    blocked_reason: blockedReason,
  });
  

  if (error) {
    console.error('engine_runs insert error:', error);
  }
}