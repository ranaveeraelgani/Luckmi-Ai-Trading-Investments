import { runTradingEngine } from '@/app/lib/engine/runTradingEngine';
import { upsertPosition, deletePosition } from '@/app/lib/db/positions';
import { insertAiDecision } from '@/app/lib/db/aiDecisions';
import { insertEngineRun } from '@/app/lib/db/engineRuns';
import { getEntitlements, subscriptionsEnforced } from '@/app/lib/subscriptions/getEntitlements';
import { supabaseAdmin } from '@/app/lib/supabaseAdmin';
import { acquireEngineLock, releaseEngineLock } from "@/app/lib/engine/helpers/engine-locks";
import { getManualCooldownSeconds, getRemainingManualCooldownSeconds} from "@/app/lib/engine/helpers/manual-cooldown";
import { executeBrokerTradesForUser } from "@/app/lib/broker/executeBrokerTradesForUser";
import { getBrokerExecutionMode } from "@/app/lib/broker/getBrokerExecutionMode";

export type TradeCycleRunType = 'manual' | 'cron' | 'admin';

export type RunTradeCycleForUserParams = {
  userId: string;
  runType: TradeCycleRunType;
  supabase: any;
  baseUrl?: string;
  bypassPlanChecks?: boolean;
  bypassCooldown?: boolean;
};

export type RunTradeCycleForUserResult = {
  success: boolean;
  status: 'success' | 'blocked' | 'failed';
  message?: string;
  updated: boolean;
  processed: number;
  tradesExecuted: number;
  brokerMode?: boolean;
};

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
}

async function fetchQuotes(baseUrl: string, symbols: string[]) {
  const res = await fetch(`${baseUrl}/api/quotes?symbols=${symbols.join(',')}`);

  if (!res.ok) {
    throw new Error('Failed to fetch quotes');
  }

  const quotesArr = await res.json();

  const quotes: Record<string, any> = {};
  quotesArr.forEach((q: any) => {
    if (q?.symbol) {
      quotes[q.symbol] = {
        price: Number(q.price) || 0,
        change: Number(q.change) || 0,
        percentChange: Number(q.percentChange) || 0,
      };
    }
  });

  return quotes;
}

async function saveEngineResults({
  supabase,
  userId,
  updatedStocks,
  trades,
}: {
  supabase: any;
  userId: string;
  updatedStocks: any[];
  trades: any[];
}) {
  for (const stock of updatedStocks) {
    await supabase
      .from("auto_stocks")
      .update({
        allocation: stock.allocation,
        status: stock.status,
        last_ai_decision: stock.lastAiDecision ?? null,
        last_sell_time: stock.lastSellTime ?? null,
        last_evaluated_price: stock.lastEvaluatedPrice ?? null,
        repeat_counter: stock.repeat_counter ?? stock.repeatCounter ?? undefined,
      })
      .eq("id", stock.id)
      .eq("user_id", userId);

    if (stock.currentPosition) {
      await supabase.from("positions").upsert(
        {
          user_id: userId,
          auto_stock_id: stock.id,
          entry_price: stock.currentPosition.entryPrice,
          shares: stock.currentPosition.shares,
          peak_price: stock.currentPosition.peakPrice ?? stock.currentPosition.entryPrice,
          peak_pnl_percent: stock.currentPosition.peakPnLPercent ?? 0,
          entry_time:
            stock.currentPosition.entryTime instanceof Date
              ? stock.currentPosition.entryTime.toISOString()
              : stock.currentPosition.entryTime,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "auto_stock_id",
        }
      );
    } else {
      await supabase
        .from("positions")
        .delete()
        .eq("user_id", userId)
        .eq("auto_stock_id", stock.id);
    }

    if (stock.lastAiDecision && stock.lastAiDecision.action !== "Hold") {
      await supabase.from("ai_decisions").insert({
        user_id: userId,
        auto_stock_id: stock.id,
        symbol: stock.symbol,
        action: stock.lastAiDecision.action,
        reason: stock.lastAiDecision.reason,
        confidence: stock.lastAiDecision.confidence ?? null,
        cts_score: stock.lastAiDecision.ctsScore ?? null,
        cts_breakdown: stock.lastAiDecision.ctsBreakdown ?? null,
      });
    }
  }

  if (trades.length > 0) {
    await supabase.from("trades").insert(
      trades.map((trade: any) => ({
        ...trade,
        user_id: userId,
      }))
    );
  }
}

export async function saveEngineStateOnly({
  supabase,
  userId,
  updatedStocks,
}: {
  supabase: any;
  userId: string;
  updatedStocks: any[];
}) {
  for (const stock of updatedStocks) {
    await supabase
      .from("auto_stocks")
      .update({
        status: stock.status,
        last_ai_decision: stock.lastAiDecision ?? null,
        last_evaluated_price: stock.lastEvaluatedPrice ?? null,
        repeat_counter: stock.repeat_counter ?? stock.repeatCounter ?? undefined,
        last_sell_time: stock.lastSellTime ?? null,
      })
      .eq("id", stock.id)
      .eq("user_id", userId);

    if (stock.lastAiDecision) {
      await supabase.from("ai_decisions").insert({
        user_id: userId,
        auto_stock_id: stock.id,
        symbol: stock.symbol,
        action: stock.lastAiDecision.action,
        reason: stock.lastAiDecision.reason,
        confidence: stock.lastAiDecision.confidence ?? null,
        cts_score: stock.lastAiDecision.ctsScore ?? null,
        cts_breakdown: stock.lastAiDecision.ctsBreakdown ?? null,
      });
    }
  }
}

export async function runTradeCycleForUser({
  userId,
  runType,
  supabase,
  baseUrl,
  bypassPlanChecks = false,
  bypassCooldown = false,
}: RunTradeCycleForUserParams): Promise<RunTradeCycleForUserResult> {
  const resolvedBaseUrl = baseUrl || getBaseUrl();
  let lockAcquired = false;

  try {
    const lockOk = await acquireEngineLock(userId, runType);

    if (!lockOk) {
      await insertEngineRun({
        userId,
        runType,
        status: "blocked",
        stocksProcessed: 0,
        tradesExecuted: 0,
        blockedReason: "Engine already running for this user",
      });

      return {
        success: false,
        status: "blocked",
        message: "Engine already running for this user",
        updated: false,
        processed: 0,
        tradesExecuted: 0,
      };
    }

    lockAcquired = true;

    const entitlements = await getEntitlements(userId);

    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("engine_paused")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sub?.engine_paused) {
      await insertEngineRun({
        userId,
        runType,
        status: "blocked",
        blockedReason: "Engine paused by admin",
      });

      return {
        success: false,
        status: "blocked",
        message: "Engine is paused by admin.",
        updated: false,
        processed: 0,
        tradesExecuted: 0,
      };
    }

    if (!bypassPlanChecks && subscriptionsEnforced()) {
      if (runType === "manual" && !entitlements.allowManualCycle) {
        await insertEngineRun({
          userId,
          runType,
          status: "blocked",
          blockedReason: "Manual cycle not allowed for current plan",
        });

        return {
          success: false,
          status: "blocked",
          message: "Manual trade cycle is not available on your current plan.",
          updated: false,
          processed: 0,
          tradesExecuted: 0,
        };
      }

      if (runType === "cron" && (!entitlements.allowCronAutomation || entitlements.engine_paused)) {
        await insertEngineRun({
          userId,
          runType,
          status: "blocked",
          blockedReason: "Cron automation not allowed for current plan",
        });

        return {
          success: false,
          status: "blocked",
          message: "Cron automation not allowed for current plan.",
          updated: false,
          processed: 0,
          tradesExecuted: 0,
        };
      }
    }

    if (runType === "manual" && !bypassCooldown) {
      const remainingSeconds = await getRemainingManualCooldownSeconds(userId);

      if (remainingSeconds > 0) {
        const cooldownSeconds = getManualCooldownSeconds();

        await insertEngineRun({
          userId,
          runType,
          status: "blocked",
          blockedReason: `Manual cooldown active (${remainingSeconds}s remaining of ${cooldownSeconds}s)`,
        });

        return {
          success: false,
          status: "blocked",
          message: `Manual cooldown active. Try again in ${remainingSeconds}s.`,
          updated: false,
          processed: 0,
          tradesExecuted: 0,
        };
      }
    }

    const { data: stocks, error: stocksError } = await supabase
      .from("auto_stocks")
      .select("*")
      .eq("user_id", userId)
      .in("status", ["idle", "monitoring", "in-position"]);

    if (stocksError) {
      throw stocksError;
    }

    if (!stocks || stocks.length === 0) {
      await insertEngineRun({
        userId,
        runType,
        status: "blocked",
        blockedReason: "No active stocks found",
      });

      return {
        success: true,
        status: "blocked",
        message: "No active stocks found",
        updated: false,
        processed: 0,
        tradesExecuted: 0,
      };
    }

    const eligibleStocks = stocks.filter((stock: any) => {
      if (!stock.rinse_repeat) return true;
      return (stock.repeat_counter || 0) < (stock.max_repeats || 0);
    });

    if (eligibleStocks.length === 0) {
      await insertEngineRun({
        userId,
        runType,
        status: "blocked",
        blockedReason: "All stocks are blocked by repeat limits",
      });

      return {
        success: true,
        status: "blocked",
        message: "All stocks are blocked by repeat limits",
        updated: false,
        processed: 0,
        tradesExecuted: 0,
      };
    }

    const quotes = await fetchQuotes(
      resolvedBaseUrl,
      eligibleStocks.map((s: any) => s.symbol)
    );

    const { updatedStocks, trades, hasChanges } = await runTradingEngine(
      eligibleStocks,
      quotes
    );

    const brokerMode = await getBrokerExecutionMode(userId);

      if (!brokerMode.enabled) {
            await insertEngineRun({
                userId,
                runType,
                status: "blocked",
                blockedReason: brokerMode.reason || "Broker execution not enabled",
            });
          return {
              success: false,
              status: "blocked",
              processed: 0,
              tradesExecuted: 0,
              message: brokerMode.reason || "Broker execution not enabled",
              updated: hasChanges,
              brokerMode: false,
          };
      }

    if (brokerMode.enabled && trades.length > 0 && hasChanges) {
       const  brokerExecution = await executeBrokerTradesForUser({
            userId,
            trades: trades,
        });
        console.log("Broker execution:", brokerExecution);
        await saveEngineStateOnly({
            supabase,
            userId,
            updatedStocks: updatedStocks,
        });

        return {
            success: true,
            status: "success",
            updated: hasChanges,
            processed: eligibleStocks.length,
            tradesExecuted: trades.length,
            brokerMode: true,
        };
    }
    if (hasChanges) {
      await saveEngineResults({
        supabase,
        userId,
        updatedStocks,
        trades,
      });
    }

    await insertEngineRun({
      userId,
      runType,
      status: "success",
      stocksProcessed: eligibleStocks.length,
      tradesExecuted: trades.length,
    });

    return {
      success: true,
      status: "success",
      updated: hasChanges,
      processed: eligibleStocks.length,
      tradesExecuted: trades.length,
    };
  } catch (error) {
    await insertEngineRun({
      userId,
      runType,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });

    return {
      success: false,
      status: "failed",
      message: error instanceof Error ? error.message : "Engine run failed",
      updated: false,
      processed: 0,
      tradesExecuted: 0,
    };
  } finally {
    if (lockAcquired) {
      await releaseEngineLock(userId);
    }
  }
}