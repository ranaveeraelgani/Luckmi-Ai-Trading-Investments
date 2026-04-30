import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth/admin";
import {
  buildSystemReviewStats,
  buildSystemReviewPrompt,
  systemFallbackReview,
  SystemReviewResponse,
} from "@/app/lib/reports/systemReview";
import { callOpenAiReview } from "@/app/lib/reports/callOpenAiReview";
import { loadAdminSystemReviewData } from "@/app/lib/reports/adminDataLoaders";

export async function POST(_req: NextRequest) {
  try {
    await requireAdmin();

    const {
      profiles,
      trades,
      decisions,
      runs,
      positions,
      brokerOrders,
      subscriptions,
    } = await loadAdminSystemReviewData();

    const summaryStats = buildSystemReviewStats(
      profiles,
      trades,
      decisions,
      runs,
      positions,
      brokerOrders,
      subscriptions
    );

    const prompt = buildSystemReviewPrompt(summaryStats);
    const review =
      (await callOpenAiReview<SystemReviewResponse>(prompt, 1200)) ??
      systemFallbackReview(summaryStats);

    return NextResponse.json({
      ...review,
      meta: {
        generatedAt: new Date().toISOString(),
        sampleSizes: {
          totalUsers: summaryStats.totalUsers,
          trades: trades.length,
          aiDecisions: decisions.length,
          engineRuns: runs.length,
          brokerOrders: brokerOrders.length,
        },
      },
      ctsBuckets: summaryStats.ctsBuckets,
      top5Symbols: summaryStats.top5Symbols,
      topLossSymbols: summaryStats.topLossSymbols,
    });
  } catch (error: any) {
    console.error("Admin AI system review error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to generate system review" },
      { status: 500 }
    );
  }
}
