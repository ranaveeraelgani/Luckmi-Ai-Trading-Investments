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
import { isMarketOpenNow } from "@/app/lib/market/isMarketOpenNow";
import { runTradeCycleForAllUsers } from "@/app/lib/engine/runTradeCycleForAllUsers";
import { startCronRun, finishCronRun } from "@/app/lib/cron/logCronRun";

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
    if (!isMarketOpenNow()) {
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

    console.info(`[cron:${JOB_NAME}] running trade-cycle-all-users elapsedMs=${elapsed()}`);
    const result = await runTradeCycleForAllUsers();
    console.info(
      `[cron:${JOB_NAME}] trade-cycle-all-users complete elapsedMs=${elapsed()} processedUsers=${result.processedUsers ?? 0} usersUpdated=${result.usersUpdated ?? 0} totalStocksProcessed=${result.totalStocksProcessed ?? 0}`
    );

    const tradesExecuted = Array.isArray(result.results)
      ? result.results.reduce((sum, userResult) => {
          if (
            userResult &&
            typeof userResult === "object" &&
            "tradesExecuted" in userResult &&
            typeof userResult.tradesExecuted === "number"
          ) {
            return sum + userResult.tradesExecuted;
          }

          return sum;
        }, 0)
      : 0;

    if (runId) {
      await finishCronRun({
        runId,
        status: "success",
        skipped: false,
        usersProcessed: result.processedUsers ?? result.processedUsers ?? 0,
        usersUpdated: result.usersUpdated ?? result.usersUpdated ?? 0,
        stocksProcessed: result.totalStocksProcessed ?? result.totalStocksProcessed ?? 0,
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