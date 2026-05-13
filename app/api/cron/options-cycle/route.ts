/**
 * @swagger
 * /api/cron/options-cycle:
 *   get:
 *     summary: Options auto-layer scan cycle
 *     description: |
 *       Scans all open option paper trades, fetches current contract prices,
 *       evaluates hard-loss-stop and trail-profit-stop rules, auto-closes
 *       triggered trades, and queues user notifications.
 *     tags: [Cron]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cycle completed (or skipped because market is closed)
 *       401:
 *         description: Unauthorized — missing or invalid ENGINE_SECRET
 *       500:
 *         description: Cycle failed
 *
 * Trigger frequency: every 5–15 min during market hours via external scheduler
 * (e.g. Vercel Cron, AWS EventBridge).  Set Authorization: Bearer $ENGINE_SECRET.
 */

import { NextResponse } from 'next/server';
import { isMarketOpenNowLive } from '@/app/lib/market/isMarketOpenNow';
import { startCronRun, finishCronRun } from '@/app/lib/cron/logCronRun';
import { fetchAllOpenTradeIds } from '@/app/lib/options/optionsCycleRunner';
import { enqueueOptionsCycleJobs } from '@/app/lib/engine/jobQueue';

const JOB_NAME = 'options-cycle';
export const maxDuration = 60;

function getOrigin(req: Request): string {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost:3000';
  const proto = req.headers.get('x-forwarded-proto') ?? 'http';
  return `${proto}://${host}`;
}

export async function GET(req: Request) {
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;

  // ── Auth ────────────────────────────────────────────────────────────────────
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.ENGINE_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const runId = await startCronRun({ jobName: JOB_NAME });
  console.info(`[cron:${JOB_NAME}] started runId=${runId ?? 'none'} elapsedMs=${elapsed()}`);

  try {
    // ── Market-hours guard ───────────────────────────────────────────────────
    console.info(`[cron:${JOB_NAME}] market-check elapsedMs=${elapsed()}`);
    if (!(await isMarketOpenNowLive())) {
      if (runId) {
        await finishCronRun({
          runId,
          status: 'skipped',
          skipped: true,
          skipReason: 'Market closed',
          startedAt,
          result: { reason: 'Market closed' },
        });
      }
      console.info(`[cron:${JOB_NAME}] skipped market-closed elapsedMs=${elapsed()}`);
      return NextResponse.json({ skipped: true, reason: 'Market closed' });
    }

    // ── Enqueue one job per open trade ───────────────────────────────────────
    console.info(`[cron:${JOB_NAME}] fetching open trades elapsedMs=${elapsed()}`);
    const tradeIds = await fetchAllOpenTradeIds();

    console.info(`[cron:${JOB_NAME}] open trades=${tradeIds.length} elapsedMs=${elapsed()}`);
    const enqueueResult = await enqueueOptionsCycleJobs(tradeIds);

    const result = {
      success: true,
      openTrades: tradeIds.length,
      tradesEnqueued: enqueueResult.enqueued,
      tradesSkippedAlreadyQueued: enqueueResult.skipped,
    };

    console.info(
      `[cron:${JOB_NAME}] enqueue complete elapsedMs=${elapsed()} ` +
        `enqueued=${result.tradesEnqueued} skipped=${result.tradesSkippedAlreadyQueued}`,
    );

    // Best-effort warm of the options opportunities cache so the follow-up
    // auto-entry cron can use a cached live_strict snapshot without depending
    // on a user opening the options page first.
    try {
      await fetch(`${getOrigin(req)}/api/options/opportunities?require_cached=1`, {
        headers: { 'x-internal-cron': 'true' },
        cache: 'no-store',
      });
    } catch (err: any) {
      console.warn(`[cron:${JOB_NAME}] opportunities cache warm failed: ${err?.message ?? err}`);
    }

    if (runId) {
      await finishCronRun({
        runId,
        status: 'success',
        skipped: false,
        tradesExecuted: enqueueResult.enqueued,
        result,
        startedAt,
      });
    }

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    const message = error?.message ?? 'Options cycle failed';
    console.error(`[cron:${JOB_NAME}] failed elapsedMs=${elapsed()} message=${message}`);

    if (runId) {
      await finishCronRun({
        runId,
        status: 'failed',
        errorMessage: message,
        startedAt,
        result: { error: message },
      });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
