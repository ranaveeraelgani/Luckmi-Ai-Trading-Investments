/**
 * @swagger
 * /api/cron/options-jobs-drain:
 *   post:
 *     summary: Options scan cycle — drain queued trade jobs
 *     description: |
 *       Claims a batch of pending options-cycle-trade jobs from engine_jobs,
 *       processes each one (fetch price → evaluate trail-stop → close or update
 *       peak_pnl), then marks each job succeeded or failed.
 *     tags: [Cron]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Batch processed (or skipped — market closed / no jobs)
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Drain failed
 *
 * Trigger: fire immediately after options-cycle, then repeat every 1-2 min
 * until the queue drains.  Use the same ENGINE_SECRET bearer token.
 */

import { NextResponse } from 'next/server';
import {
  claimEngineJobs,
  markEngineJobSucceeded,
  markEngineJobFailed,
  OPTIONS_CYCLE_JOB_NAME,
} from '@/app/lib/engine/jobQueue';
import { runOptionsTradeJob } from '@/app/lib/options/optionsCycleRunner';
import { isMarketOpenNowLive } from '@/app/lib/market/isMarketOpenNow';

export const maxDuration = 60;

/** How many trade jobs to claim and process in one drain invocation.
 *  Kept small so 2 Polygon calls per trade (long + short leg) × 5s max timeout each
 *  stays well within the 60s maxDuration even under worst-case Polygon latency.
 */
const CLAIM_BATCH_SIZE = 8;

/** Wall-clock budget in ms — break the drain loop early if we approach maxDuration.
 *  Unleased jobs keep their lease and auto-release after LEASE_SECONDS so the
 *  next invocation picks them up cleanly. */
const DRAIN_BUDGET_MS = 45_000;

/**
 * Lease time in seconds.  Each job is locked for this duration so a second
 * concurrent drain invocation won't pick up the same trade.
 */
const LEASE_SECONDS = 120;

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
      jobName: OPTIONS_CYCLE_JOB_NAME,
      batchSize: CLAIM_BATCH_SIZE,
      leaseSeconds: LEASE_SECONDS,
    });

    if (jobs.length === 0) {
      return NextResponse.json({ success: true, claimedJobs: 0, processed: 0 });
    }

    let closed = 0;
    let closeRequested = 0;
    let peakUpdated = 0;
    let priceUnavailable = 0;
    let skipped = 0;
    let skippedAutoExitDisabled = 0;
    let skippedOther = 0;
    let errors = 0;
    let budgetExceeded = false;

    const drainStartedAt = Date.now();

    for (const job of jobs) {
      // Wall-clock safety: if we are approaching the maxDuration limit, stop
      // processing. Remaining leased jobs auto-release after LEASE_SECONDS so
      // the next drain invocation will pick them up.
      if (Date.now() - drainStartedAt >= DRAIN_BUDGET_MS) {
        budgetExceeded = true;
        console.warn('[options-jobs-drain] wall-clock budget exceeded — stopping early');
        break;
      }
      const tradeId = (job as any).payload?.tradeId as string | undefined;

      if (!tradeId) {
        await markEngineJobFailed(job.id, 'payload.tradeId missing');
        errors++;
        continue;
      }

      try {
        const outcome = await runOptionsTradeJob(tradeId);

        await markEngineJobSucceeded(job.id);

        switch (outcome.action) {
          case 'closed':          closed++;           break;
          case 'close_requested': closeRequested++;   break;
          case 'peak_updated':    peakUpdated++;      break;
          case 'price_unavailable': priceUnavailable++; break;
          case 'skipped': {
            skipped++;
            if (outcome.reason === 'auto exits disabled by user') {
              skippedAutoExitDisabled++;
            } else {
              skippedOther++;
            }
            break;
          }
        }
      } catch (err: any) {
        const message = err?.message ?? 'Unknown error';
        console.error(`[options-jobs-drain] trade=${tradeId} error:`, message);
        await markEngineJobFailed(job.id, message);
        errors++;
      }
    }

    console.info(
      `[options-jobs-drain] batch done claimed=${jobs.length} ` +
        `closed=${closed} closeRequested=${closeRequested} peakUpdated=${peakUpdated} ` +
        `priceUnavailable=${priceUnavailable} skipped=${skipped} ` +
        `skippedAutoExitDisabled=${skippedAutoExitDisabled} skippedOther=${skippedOther} errors=${errors}`,
    );

    return NextResponse.json({
      success: true,
      claimedJobs: jobs.length,
      processed: jobs.length,
      budgetExceeded,
      closed,
      closeRequested,
      peakUpdated,
      priceUnavailable,
      skipped,
      skippedAutoExitDisabled,
      skippedOther,
      errors,
    });
  } catch (err: any) {
    const message = err?.message ?? 'Drain failed';
    console.error('[options-jobs-drain] fatal error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
