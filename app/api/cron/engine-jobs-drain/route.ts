import { NextResponse } from 'next/server';
import {
  claimEngineJobs,
  MARKET_CYCLE_JOB_NAME,
  markEngineJobFailed,
  markEngineJobSucceeded,
} from '@/app/lib/engine/jobQueue';
import { runTradeCycleForUserIds } from '@/app/lib/engine/runTradeCycleForAllUsers';
import { isMarketOpenNowLive } from '@/app/lib/market/isMarketOpenNow';

export const maxDuration = 60;

const CLAIM_BATCH_SIZE = 12;
const USER_BATCH_SIZE = 4;
const LEASE_SECONDS = 240;
const CLAIM_TIMEOUT_MS = 10_000;
const BATCH_TIMEOUT_MS = 45_000;
const DRAIN_BUDGET_MS = 50_000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

function chunk<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.ENGINE_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await isMarketOpenNowLive())) {
    return NextResponse.json({ skipped: true, reason: 'Market closed' });
  }

  try {
    const jobs = await withTimeout(
      claimEngineJobs({
        jobName: MARKET_CYCLE_JOB_NAME,
        batchSize: CLAIM_BATCH_SIZE,
        leaseSeconds: LEASE_SECONDS,
      }),
      CLAIM_TIMEOUT_MS,
      'claimEngineJobs',
    );

    if (jobs.length === 0) {
      return NextResponse.json({
        success: true,
        claimedJobs: 0,
        processedUsers: 0,
        usersUpdated: 0,
        totalStocksProcessed: 0,
        totalTradesExecuted: 0,
      });
    }

    const jobsByUserId = new Map(jobs.map((job) => [job.user_id, job]));
    const userIds = [...jobsByUserId.keys()];
    const userBatches = chunk(userIds, USER_BATCH_SIZE);

    let processedUsers = 0;
    let usersUpdated = 0;
    let totalStocksProcessed = 0;
    let totalTradesExecuted = 0;
    let timedOutBatches = 0;
    let budgetExceeded = false;

    for (const userBatch of userBatches) {
      if (Date.now() - startedAt >= DRAIN_BUDGET_MS) {
        budgetExceeded = true;
        console.warn('[engine-jobs-drain] wall-clock budget exceeded, stopping early');
        break;
      }

      let batchResult;
      try {
        batchResult = await withTimeout(
          runTradeCycleForUserIds(userBatch),
          BATCH_TIMEOUT_MS,
          'runTradeCycleForUserIds',
        );
      } catch (err: any) {
        timedOutBatches++;
        const message = err?.message || 'trade-cycle batch timeout';
        console.error(`[engine-jobs-drain] batch timeout users=${userBatch.length} message=${message}`);
        for (const userId of userBatch) {
          const job = jobsByUserId.get(userId);
          if (!job) continue;
          await markEngineJobFailed(job.id, message);
        }
        continue;
      }

      processedUsers += batchResult.processedUsers;
      usersUpdated += batchResult.usersUpdated;
      totalStocksProcessed += batchResult.totalStocksProcessed;

      for (const userResult of batchResult.results || []) {
        const job = jobsByUserId.get(userResult.userId);
        if (!job) continue;

        if (typeof userResult.tradesExecuted === 'number') {
          totalTradesExecuted += userResult.tradesExecuted;
        }

        if (userResult.status === 'failed') {
          await markEngineJobFailed(job.id, userResult.error || userResult.message || 'Engine job failed');
        } else {
          await markEngineJobSucceeded(job.id);
        }
      }
    }

    return NextResponse.json({
      success: true,
      claimedJobs: jobs.length,
      processedUsers,
      usersUpdated,
      totalStocksProcessed,
      totalTradesExecuted,
      timedOutBatches,
      budgetExceeded,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to drain engine jobs' },
      { status: 500 }
    );
  }
}