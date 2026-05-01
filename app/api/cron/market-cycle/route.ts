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

export async function GET(req: Request) {
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.ENGINE_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runId = await startCronRun({ jobName: JOB_NAME });
  console.info(`[cron:${JOB_NAME}] started runId=${runId ?? "none"} elapsedMs=${elapsed()}`);

  try {
    console.info(`[cron:${JOB_NAME}] market-check elapsedMs=${elapsed()}`);
    if (!(await isMarketOpenNowLive())) {
      if (runId) {
        await finishCronRun({
          runId,
          status: "skipped",
          skipped: true,
          skipReason: "Market closed",
          startedAt,
          result: {
            reason: "Market closed",
          },
        });
      }

      console.info(`[cron:${JOB_NAME}] skipped market-closed elapsedMs=${elapsed()}`);

      return NextResponse.json({
        skipped: true,
        reason: "Market closed",
      });
    }

    console.info(`[cron:${JOB_NAME}] loading active users elapsedMs=${elapsed()}`);
    const activeUserIds = await getActiveTradeCycleUserIds();

    console.info(`[cron:${JOB_NAME}] active users=${activeUserIds.length} elapsedMs=${elapsed()}`);

    const enqueueResult = await enqueueMarketCycleJobs(activeUserIds);

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

    if (runId) {
      await finishCronRun({
        runId,
        status: "success",
        skipped: false,
        usersProcessed: result.processedUsers ?? 0,
        usersUpdated: result.usersUpdated ?? 0,
        stocksProcessed: result.totalStocksProcessed ?? 0,
        tradesExecuted,
        result,
        startedAt,
      });
    }

    console.info(`[cron:${JOB_NAME}] finish success elapsedMs=${elapsed()} tradesExecuted=${tradesExecuted}`);

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: any) {
    console.error(
      `[cron:${JOB_NAME}] failed elapsedMs=${elapsed()} message=${error?.message || "Cron failed"}`
    );

    if (runId) {
      await finishCronRun({
        runId,
        status: "failed",
        errorMessage: error?.message || "Cron failed",
        startedAt,
        result: {
          error: error?.message || "Cron failed",
        },
      });
    }

    return NextResponse.json(
      { error: error?.message || "Cron failed" },
      { status: 500 }
    );
  }
}