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

const CLAIM_BATCH_SIZE = 20;
const USER_BATCH_SIZE = 4;
const LEASE_SECONDS = 240;

function chunk<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

export async function POST(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.ENGINE_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await isMarketOpenNowLive())) {
    return NextResponse.json({ skipped: true, reason: 'Market closed' });
  }

  try {
    const jobs = await claimEngineJobs({
      jobName: MARKET_CYCLE_JOB_NAME,
      batchSize: CLAIM_BATCH_SIZE,
      leaseSeconds: LEASE_SECONDS,
    });

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

    for (const userBatch of userBatches) {
      const batchResult = await runTradeCycleForUserIds(userBatch);

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
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to drain engine jobs' },
      { status: 500 }
    );
  }
}