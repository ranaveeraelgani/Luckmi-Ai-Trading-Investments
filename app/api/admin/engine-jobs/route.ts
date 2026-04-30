import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/auth/admin';
import { supabaseAdmin } from '@/app/lib/supabaseAdmin';
import { MARKET_CYCLE_JOB_NAME } from '@/app/lib/engine/jobQueue';

function countByStatus(rows: Array<{ status: string }> | null | undefined) {
  const counts = {
    pending: 0,
    processing: 0,
    succeeded: 0,
    failed: 0,
  };

  for (const row of rows || []) {
    const status = String(row?.status || '');
    if (status === 'pending') counts.pending += 1;
    if (status === 'processing') counts.processing += 1;
    if (status === 'succeeded') counts.succeeded += 1;
    if (status === 'failed') counts.failed += 1;
  }

  return counts;
}

export async function GET() {
  try {
    await requireAdmin();

    const nowIso = new Date().toISOString();

    const [
      jobsRes,
      oldestPendingRes,
      staleProcessingRes,
      recentFailuresRes,
      recentJobsRes,
    ] = await Promise.all([
      supabaseAdmin
        .from('engine_jobs')
        .select('status')
        .eq('job_name', MARKET_CYCLE_JOB_NAME),

      supabaseAdmin
        .from('engine_jobs')
        .select('id, user_id, created_at')
        .eq('job_name', MARKET_CYCLE_JOB_NAME)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle(),

      supabaseAdmin
        .from('engine_jobs')
        .select('*', { count: 'exact', head: true })
        .eq('job_name', MARKET_CYCLE_JOB_NAME)
        .eq('status', 'processing')
        .lt('lease_expires_at', nowIso),

      supabaseAdmin
        .from('engine_jobs')
        .select('id, user_id, attempts, error_message, finished_at')
        .eq('job_name', MARKET_CYCLE_JOB_NAME)
        .eq('status', 'failed')
        .order('finished_at', { ascending: false })
        .limit(20),

      supabaseAdmin
        .from('engine_jobs')
        .select('id, user_id, status, attempts, created_at, started_at, finished_at, lease_expires_at')
        .eq('job_name', MARKET_CYCLE_JOB_NAME)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    if (jobsRes.error) throw jobsRes.error;
    if (oldestPendingRes.error) throw oldestPendingRes.error;
    if (staleProcessingRes.error) throw staleProcessingRes.error;
    if (recentFailuresRes.error) throw recentFailuresRes.error;
    if (recentJobsRes.error) throw recentJobsRes.error;

    const counts = countByStatus(jobsRes.data as Array<{ status: string }>);

    const oldestPendingAgeSeconds = oldestPendingRes.data?.created_at
      ? Math.max(0, Math.floor((Date.now() - new Date(oldestPendingRes.data.created_at).getTime()) / 1000))
      : null;

    return NextResponse.json({
      success: true,
      queue: {
        jobName: MARKET_CYCLE_JOB_NAME,
        total: (jobsRes.data || []).length,
        pending: counts.pending,
        processing: counts.processing,
        succeeded: counts.succeeded,
        failed: counts.failed,
        staleProcessing: staleProcessingRes.count || 0,
        oldestPendingAgeSeconds,
      },
      recentFailures: recentFailuresRes.data || [],
      recentJobs: recentJobsRes.data || [],
    });
  } catch (error: any) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(
      { error: error?.message || 'Failed to load engine jobs health' },
      { status: 500 }
    );
  }
}
