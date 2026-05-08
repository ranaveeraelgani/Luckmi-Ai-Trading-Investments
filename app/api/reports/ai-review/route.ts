import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabaseServer";
import {
  buildUserReviewSummary,
  buildUserAiReviewPrompt,
  userAiFallbackReview,
  ReviewResponse,
} from "@/app/lib/reports/userAiReview";
import { callOpenAiReview } from "@/app/lib/reports/callOpenAiReview";

export async function POST(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [
      tradesRes,
      optionTradesRes,
      decisionsRes,
      brokerOrdersRes,
      positionsRes,
      brokerPositionsRes,
    ] = await Promise.all([
      supabase
        .from("trades")
        .select("symbol, type, pnl, confidence, cts_score, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("option_paper_trades")
        .select("symbol, status, pnl, entry_score, entry_at, exit_at, notes")
        .eq("user_id", user.id)
        .order("entry_at", { ascending: false })
        .limit(100),
      supabase
        .from("ai_decisions")
        .select("symbol, action, confidence, cts_score, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("broker_orders")
        .select(
          "symbol, side, status, qty, filled_avg_price, filled_at, created_at"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("positions")
        .select("symbol, status, pnl, peak_pnl_percent, shares, entry_price")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(100),
      supabase
        .from("broker_positions")
        .select("symbol, qty, unrealized_pl, unrealized_plpc, last_synced_at")
        .eq("user_id", user.id)
        .order("last_synced_at", { ascending: false })
        .limit(100),
    ]);

    if (
      tradesRes.error ||
      optionTradesRes.error ||
      decisionsRes.error ||
      brokerOrdersRes.error ||
      positionsRes.error ||
      brokerPositionsRes.error
    ) {
      return NextResponse.json(
        {
          error:
            tradesRes.error?.message ||
            optionTradesRes.error?.message ||
            decisionsRes.error?.message ||
            brokerOrdersRes.error?.message ||
            positionsRes.error?.message ||
            brokerPositionsRes.error?.message ||
            "Failed to load review data",
        },
        { status: 500 }
      );
    }

    const optionTrades = optionTradesRes.data || [];
    const optionTradesAsGeneralTrades = optionTrades.map((t: any) => ({
      symbol: t.symbol,
      type: String(t.status || '').toLowerCase() === 'closed' ? 'option_sell' : 'option_buy',
      pnl: t.pnl,
      confidence: null,
      cts_score: t.entry_score,
      created_at: t.exit_at || t.entry_at,
    }));

    const mergedPositions = [
      ...(positionsRes.data || []),
      ...optionTrades
        .filter((t: any) => String(t.status || '').toLowerCase() === 'open')
        .map((t: any) => ({
          symbol: t.symbol,
          status: 'in-position',
          pnl: t.pnl,
          peak_pnl_percent: null,
          shares: 1,
          entry_price: null,
        })),
    ];

    const summaryStats = buildUserReviewSummary(
      [...(tradesRes.data || []), ...optionTradesAsGeneralTrades],
      decisionsRes.data || [],
      brokerOrdersRes.data || [],
      mergedPositions,
      brokerPositionsRes.data || []
    );

    const prompt = buildUserAiReviewPrompt(summaryStats);
    const review =
      (await callOpenAiReview<ReviewResponse>(prompt, 900)) ??
      userAiFallbackReview(summaryStats);

    return NextResponse.json({
      ...review,
      meta: {
        generatedAt: new Date().toISOString(),
        sampleSizes: {
          trades: tradesRes.data?.length ?? 0,
          optionTrades: optionTrades.length,
          aiDecisions: decisionsRes.data?.length ?? 0,
          brokerOrders: brokerOrdersRes.data?.length ?? 0,
          positions: positionsRes.data?.length ?? 0,
          brokerPositions: brokerPositionsRes.data?.length ?? 0,
        },
      },
    });
  } catch (error: any) {
    console.error("AI review route error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to generate AI review" },
      { status: 500 }
    );
  }
}
