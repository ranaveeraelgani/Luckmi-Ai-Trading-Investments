import { isMarketOpenNow } from "@/app/lib/market/isMarketOpenNow";
import { runTradeCycleForAllUsers } from "@/app/lib/engine/runTradeCycleForAllUsers";
import { startCronRun, finishCronRun } from "@/app/lib/cron/logCronRun";
import { NextResponse } from "next/server";

const JOB_NAME = "market-cycle";
export async function GET(req: Request) {
    const startedAt = Date.now();

    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${process.env.ENGINE_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const runId = await startCronRun({ jobName: JOB_NAME });
    try {

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

            return NextResponse.json({
                skipped: true,
                reason: "Market closed",
            });
        }
        const result = await runTradeCycleForAllUsers();
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

    return NextResponse.json({
      success: true,
      result,
    });
    } catch (error: any) {
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