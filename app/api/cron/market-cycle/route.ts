/**
 * @swagger
 * /api/cron/market-cycle:
 *   get:
 *     summary: Execute trading engine cycle
 *     tags: [Cron]
 *     responses:
 *       200:
 *         description: Trading cycle executed
 */

import { NextResponse } from "next/server";
import { isMarketOpenNowLive } from "@/app/lib/market/isMarketOpenNow";
import { getActiveTradeCycleUserIds } from "@/app/lib/engine/runTradeCycleForAllUsers";
import { startCronRun, finishCronRun } from "@/app/lib/cron/logCronRun";
import { enqueueMarketCycleJobs } from "@/app/lib/engine/jobQueue";

const JOB_NAME = "market-cycle";
export const maxDuration = 60;

const START_LOG_TIMEOUT_MS = 2500;
const MARKET_CHECK_TIMEOUT_MS = 7000;
const ACTIVE_USERS_TIMEOUT_MS = 12000;
const ENQUEUE_TIMEOUT_MS = 12000;
const FINISH_LOG_TIMEOUT_MS = 2500;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

function fireAndForgetFinish(
  runId: string | null,
  payload: Omit<Parameters<typeof finishCronRun>[0], 'runId'>,
) {
  if (!runId) return;
  void withTimeout(finishCronRun({ ...payload, runId }), FINISH_LOG_TIMEOUT_MS, "finishCronRun")
    .catch((err) => {
      console.warn(`[cron:${JOB_NAME}] finish log skipped: ${err?.message ?? err}`);
    });
}

export async function GET(req: Request) {
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.ENGINE_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runId = await withTimeout(startCronRun({ jobName: JOB_NAME }), START_LOG_TIMEOUT_MS, "startCronRun")
    .catch((err) => {
      console.warn(`[cron:${JOB_NAME}] start log skipped: ${err?.message ?? err}`);
      return null;
    });
  console.info(`[cron:${JOB_NAME}] started runId=${runId ?? "none"} elapsedMs=${elapsed()}`);

  try {
    console.info(`[cron:${JOB_NAME}] market-check elapsedMs=${elapsed()}`);
    const marketOpen = await withTimeout(isMarketOpenNowLive(), MARKET_CHECK_TIMEOUT_MS, "isMarketOpenNowLive")
      .catch((err) => {
        console.warn(`[cron:${JOB_NAME}] market-check fallback: ${err?.message ?? err}`);
        return false;
      });

    if (!marketOpen) {
      fireAndForgetFinish(runId, {
        status: "skipped",
        skipped: true,
        skipReason: "Market closed or market check timeout",
        startedAt,
        result: {
          reason: "Market closed or market check timeout",
        },
      });

      console.info(`[cron:${JOB_NAME}] skipped market-closed elapsedMs=${elapsed()}`);

      return NextResponse.json({
        skipped: true,
        reason: "Market closed or market check timeout",
      });
    }

    console.info(`[cron:${JOB_NAME}] loading active users elapsedMs=${elapsed()}`);
    const activeUserIds = await withTimeout(
      getActiveTradeCycleUserIds(),
      ACTIVE_USERS_TIMEOUT_MS,
      "getActiveTradeCycleUserIds",
    );

    console.info(`[cron:${JOB_NAME}] active users=${activeUserIds.length} elapsedMs=${elapsed()}`);

    const enqueueResult = await withTimeout(
      enqueueMarketCycleJobs(activeUserIds),
      ENQUEUE_TIMEOUT_MS,
      "enqueueMarketCycleJobs",
    );

    const result = {
      success: true,
      processedUsers: activeUserIds.length,
      usersEnqueued: enqueueResult.enqueued,
      usersSkippedAlreadyQueued: enqueueResult.skipped,
      totalStocksProcessed: 0,
      usersUpdated: 0,
      results: [],
    };

    console.info(
      `[cron:${JOB_NAME}] enqueue complete elapsedMs=${elapsed()} processedUsers=${result.processedUsers ?? 0} enqueued=${result.usersEnqueued ?? 0} skipped=${result.usersSkippedAlreadyQueued ?? 0}`
    );

    const tradesExecuted = 0;

    fireAndForgetFinish(runId, {
      status: "success",
      skipped: false,
      usersProcessed: result.processedUsers ?? 0,
      usersUpdated: result.usersUpdated ?? 0,
      stocksProcessed: result.totalStocksProcessed ?? 0,
      tradesExecuted,
      result,
      startedAt,
    });

    console.info(`[cron:${JOB_NAME}] finish success elapsedMs=${elapsed()} tradesExecuted=${tradesExecuted}`);

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: any) {
    console.error(
      `[cron:${JOB_NAME}] failed elapsedMs=${elapsed()} message=${error?.message || "Cron failed"}`
    );

    fireAndForgetFinish(runId, {
      status: "failed",
      errorMessage: error?.message || "Cron failed",
      startedAt,
      result: {
        error: error?.message || "Cron failed",
      },
    });

    return NextResponse.json(
      { error: error?.message || "Cron failed" },
      { status: 500 }
    );
  }
}