import { supabaseAdmin } from '@/app/lib/supabaseAdmin';

export const MARKET_CYCLE_JOB_NAME = 'market-cycle-user';

export type EngineQueueJob = {
  id: string;
  user_id: string;
  job_name: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed';
  attempts: number;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  lease_expires_at: string | null;
};

export async function enqueueMarketCycleJobs(userIds: string[]) {
  if (userIds.length === 0) {
    return { enqueued: 0, skipped: 0 };
  }

  const deduped = [...new Set(userIds.filter(Boolean))];

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('engine_jobs')
    .select('user_id')
    .eq('job_name', MARKET_CYCLE_JOB_NAME)
    .in('status', ['pending', 'processing'])
    .in('user_id', deduped);

  if (existingError) {
    throw existingError;
  }

  const activeUserIds = new Set((existing || []).map((row: any) => row.user_id).filter(Boolean));
  const userIdsToEnqueue = deduped.filter((userId) => !activeUserIds.has(userId));

  if (userIdsToEnqueue.length > 0) {
    const { error: insertError } = await supabaseAdmin
      .from('engine_jobs')
      .insert(
        userIdsToEnqueue.map((userId) => ({
          job_name: MARKET_CYCLE_JOB_NAME,
          user_id: userId,
          status: 'pending',
        }))
      );

    if (insertError) {
      throw insertError;
    }
  }

  return {
    enqueued: userIdsToEnqueue.length,
    skipped: deduped.length - userIdsToEnqueue.length,
  };
}

export async function claimEngineJobs(options?: {
  jobName?: string;
  batchSize?: number;
  leaseSeconds?: number;
}) {
  const jobName = options?.jobName || MARKET_CYCLE_JOB_NAME;
  const batchSize = options?.batchSize || 20;
  const leaseSeconds = options?.leaseSeconds || 180;

  const { data, error } = await supabaseAdmin.rpc('claim_engine_jobs', {
    p_job_name: jobName,
    p_batch_size: batchSize,
    p_lease_seconds: leaseSeconds,
  });

  if (error) {
    throw error;
  }

  return (data || []) as EngineQueueJob[];
}

export async function markEngineJobSucceeded(jobId: string) {
  const { error } = await supabaseAdmin
    .from('engine_jobs')
    .update({
      status: 'succeeded',
      finished_at: new Date().toISOString(),
      error_message: null,
      lease_expires_at: null,
    })
    .eq('id', jobId);

  if (error) {
    throw error;
  }
}

export async function markEngineJobFailed(jobId: string, message: string) {
  const { error } = await supabaseAdmin
    .from('engine_jobs')
    .update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      error_message: String(message || 'Unknown engine job failure').slice(0, 2000),
      lease_expires_at: null,
    })
    .eq('id', jobId);

  if (error) {
    throw error;
  }
}

// ── Options-cycle queue helpers ───────────────────────────────────────────────

export const OPTIONS_CYCLE_JOB_NAME = 'options-cycle-trade';

/**
 * Enqueues one job per open trade ID, skipping trades that already have a
 * pending or processing job (idempotent — safe to call every 15 min).
 */
export async function enqueueOptionsCycleJobs(tradeIds: string[]) {
  if (tradeIds.length === 0) return { enqueued: 0, skipped: 0 };

  const deduped = [...new Set(tradeIds.filter(Boolean))];

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('engine_jobs')
    .select('payload')
    .eq('job_name', OPTIONS_CYCLE_JOB_NAME)
    .in('status', ['pending', 'processing']);

  if (existingError) throw existingError;

  const activeTradeIds = new Set(
    (existing ?? [])
      .map((r: any) => r?.payload?.tradeId as string | undefined)
      .filter(Boolean),
  );

  const toEnqueue = deduped.filter((id) => !activeTradeIds.has(id));

  if (toEnqueue.length > 0) {
    const { error: insertError } = await supabaseAdmin
      .from('engine_jobs')
      .insert(
        toEnqueue.map((tradeId) => ({
          job_name: OPTIONS_CYCLE_JOB_NAME,
          status: 'pending',
          payload: { tradeId },
        })),
      );
    if (insertError) throw insertError;
  }

  return { enqueued: toEnqueue.length, skipped: deduped.length - toEnqueue.length };
}

export async function clearPendingMarketCycleJobsForUser(userId: string) {
  const { error } = await supabaseAdmin
    .from('engine_jobs')
    .delete()
    .eq('job_name', MARKET_CYCLE_JOB_NAME)
    .eq('user_id', userId)
    .eq('status', 'pending');

  if (error) {
    throw error;
  }
}