/**
 * Admin-level AI system review:
 * - SystemReviewResponse type
 * - buildSystemReviewStats   — aggregates multi-user DB rows → compact stats object
 * - buildSystemReviewPrompt  — constructs the OpenAI prompt string
 * - systemFallbackReview     — deterministic fallback when OpenAI is unavailable
 */

import { toNumber } from "./reportHelpers";
import { computeCtsBuckets } from "./ctsBuckets";

export type SystemReviewResponse = {
  overview: string;
  keyInsights: string[];
  risks: string[];
  edgeAnalysis: string[];
  executionHealth: string[];
  userBehaviorInsights: string[];
  recommendations: string[];
};

// ─── Stats builder ────────────────────────────────────────────────────────────

export function buildSystemReviewStats(
  profiles: any[],
  trades: any[],
  decisions: any[],
  runs: any[],
  positions: any[],
  brokerOrders: any[],
  subscriptions: any[]
) {
  const totalUsers = profiles.length;

  const ctsBuckets = computeCtsBuckets(trades);

  const symbolTradeCounts = new Map<string, number>();
  const symbolPnl = new Map<string, number>();
  let totalRealizedPnl = 0;
  let platformWins = 0;
  let platformLosses = 0;
  let confidenceSum = 0;
  let confidenceCount = 0;
  const activeUserIds = new Set<string>();

  for (const trade of trades) {
    const cts = toNumber(trade.cts_score);
    const pnl = toNumber(trade.pnl);
    const isSell = String(trade.type || "").toLowerCase().includes("sell");
    const conf = toNumber(trade.confidence);
    const symbol = String(trade.symbol || "").toUpperCase();

    if (symbol) {
      symbolTradeCounts.set(symbol, toNumber(symbolTradeCounts.get(symbol)) + 1);
    }
    if (conf > 0) {
      confidenceSum += conf;
      confidenceCount += 1;
    }
    if (isSell) {
      totalRealizedPnl += pnl;
      if (pnl > 0) platformWins += 1;
      if (pnl < 0) platformLosses += 1;
      if (symbol) {
        symbolPnl.set(symbol, toNumber(symbolPnl.get(symbol)) + pnl);
      }
    }
    if (trade.user_id) activeUserIds.add(trade.user_id);
  }

  for (const d of decisions) {
    if (d.user_id) activeUserIds.add(d.user_id);
    const conf = toNumber(d.confidence);
    if (conf > 0) {
      confidenceSum += conf;
      confidenceCount += 1;
    }
  }

  // Engine health
  let engineTotal = runs.length;
  let engineSuccess = 0;
  let engineFailed = 0;
  let engineBlocked = 0;
  let engineTradesExecuted = 0;
  const usersWithEngineActivity = new Set<string>();

  for (const run of runs) {
    const s = String(run.status || "").toLowerCase();
    if (s === "success") engineSuccess += 1;
    else if (s === "failed") engineFailed += 1;
    else if (s === "blocked") engineBlocked += 1;
    engineTradesExecuted += toNumber(run.trades_executed);
    if (run.user_id) usersWithEngineActivity.add(run.user_id);
  }

  // Broker orders
  let ordersTotal = brokerOrders.length;
  let ordersFilled = 0;
  let ordersRejected = 0;
  let ordersCancelled = 0;
  for (const order of brokerOrders) {
    const s = String(order.status || "").toLowerCase();
    if (s === "filled") ordersFilled += 1;
    else if (s === "rejected") ordersRejected += 1;
    else if (s === "cancelled" || s === "canceled") ordersCancelled += 1;
  }

  // Open positions
  let openPositionsCount = 0;
  let totalUnrealizedPnl = 0;
  const usersWithPositions = new Set<string>();
  for (const p of positions) {
    if (String(p.status || "").toLowerCase() === "in-position") {
      openPositionsCount += 1;
      totalUnrealizedPnl += toNumber(p.pnl);
      if (p.user_id) usersWithPositions.add(p.user_id);
    }
  }

  // Symbol concentration
  const sortedSymbols = [...symbolTradeCounts.entries()].sort(
    (a, b) => b[1] - a[1]
  );
  const topSymbol = sortedSymbols[0]?.[0] || null;
  const topSymbolCount = sortedSymbols[0]?.[1] || 0;
  const topSymbolConcentration =
    trades.length > 0 ? (topSymbolCount / trades.length) * 100 : 0;
  const top5Symbols = sortedSymbols.slice(0, 5).map(([symbol, count]) => ({
    symbol,
    count,
    pnl: toNumber(symbolPnl.get(symbol)),
  }));
  const topLossSymbols = [...symbolPnl.entries()]
    .filter(([, pnl]) => pnl < 0)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 3)
    .map(([symbol, pnl]) => ({ symbol, pnl }));

  // Plan distribution
  const planCounts = new Map<string, number>();
  for (const sub of subscriptions) {
    const plan = sub.plan_code || "none";
    planCounts.set(plan, toNumber(planCounts.get(plan)) + 1);
  }
  const planDistribution = [...planCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([plan_code, users]) => ({ plan_code, users }));

  const totalClosed = platformWins + platformLosses;

  return {
    totalUsers,
    usersWithActivity: activeUserIds.size,
    usersWithPositions: usersWithPositions.size,
    totalTrades: trades.length,
    totalRealizedPnl,
    totalUnrealizedPnl,
    winRate: totalClosed > 0 ? (platformWins / totalClosed) * 100 : 0,
    avgConfidence: confidenceCount > 0 ? confidenceSum / confidenceCount : 0,
    openPositionsCount,
    engineTotal,
    engineSuccessRate:
      engineTotal > 0 ? (engineSuccess / engineTotal) * 100 : 0,
    engineFailedRuns: engineFailed,
    engineBlockedRuns: engineBlocked,
    engineTradesExecuted,
    usersWithEngineActivity: usersWithEngineActivity.size,
    ordersTotal,
    ordersFilled,
    ordersRejected,
    ordersCancelled,
    ordersFilledRate:
      ordersTotal > 0 ? (ordersFilled / ordersTotal) * 100 : 0,
    ctsBuckets,
    topSymbol,
    topSymbolConcentration,
    top5Symbols,
    topLossSymbols,
    planDistribution,
    aiDecisionsTotal: decisions.length,
    buySellHoldCounts: {
      buy: decisions.filter((d) =>
        String(d.action || "").toLowerCase().includes("buy")
      ).length,
      sell: decisions.filter((d) =>
        String(d.action || "").toLowerCase().includes("sell")
      ).length,
      hold: decisions.filter((d) =>
        String(d.action || "").toLowerCase().includes("hold")
      ).length,
    },
  };
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

export function buildSystemReviewPrompt(
  summaryStats: ReturnType<typeof buildSystemReviewStats>
): string {
  return `You are Luckmi AI System Intelligence.

Your role is to evaluate the performance, risk, and effectiveness of the entire Luckmi trading platform across all users.
You are NOT a trader giving stock advice. You are a system-level analyst helping a CEO or Head of Trading understand platform health.

Do not give financial advice. Do not promise returns.
Be analytical, direct, and action-oriented. Use an operator mindset — calm, slightly critical, focused on system optimization.

Analyze the following platform-wide statistics and produce a structured review:

${JSON.stringify(summaryStats, null, 2)}

Return STRICT JSON only with this shape:
{
  "overview": "string (3-5 sentence executive summary of platform state)",
  "keyInsights": ["string"],
  "risks": ["string"],
  "edgeAnalysis": ["string"],
  "executionHealth": ["string"],
  "userBehaviorInsights": ["string"],
  "recommendations": ["string"]
}

Rules:
- overview: 3-5 sentences. Focus on is the system working, where is the edge, and key health signal.
- keyInsights: 3-5 bullet points on what is actually happening across the platform.
- risks: 2-4 real risks (concentration, low confidence, engine failures, weak CTS bands, etc.).
- edgeAnalysis: 2-4 bullets on where Luckmi's strategy is actually winning vs losing.
- executionHealth: 2-3 bullets on engine reliability, broker order fill rates, blocked/failed runs.
- userBehaviorInsights: 2-3 bullets on user engagement, activity distribution, plan usage patterns.
- recommendations: 3-5 concrete, system-level improvements (CTS gates, risk limits, execution improvements).
- No financial advice or stock picks.
- Focus on strategy, risk, execution, and scale — not individual user trades.
`;
}

// ─── Deterministic fallback ───────────────────────────────────────────────────

export function systemFallbackReview(
  stats: ReturnType<typeof buildSystemReviewStats>
): SystemReviewResponse {
  const keyInsights: string[] = [];
  const risks: string[] = [];
  const edgeAnalysis: string[] = [];
  const executionHealth: string[] = [];
  const userBehaviorInsights: string[] = [];
  const recommendations: string[] = [];

  if (stats.engineSuccessRate >= 80) {
    executionHealth.push("Engine reliability is high. System is executing consistently.");
  } else {
    executionHealth.push(
      `Engine success rate is ${stats.engineSuccessRate.toFixed(1)}%. Reliability should be addressed before strategy tuning.`
    );
  }

  if (stats.ctsBuckets.high.count > 0 && stats.ctsBuckets.high.avgPnl > 0) {
    edgeAnalysis.push(
      `High-CTS trades (80+) are profitable with avg return ${stats.ctsBuckets.high.avgPnl.toFixed(2)}. This is the system's strongest edge.`
    );
  }
  if (stats.ctsBuckets.low.count > 0 && stats.ctsBuckets.low.avgPnl < 0) {
    edgeAnalysis.push(
      `Low-CTS trades (<60) have negative average return. Restricting entries below CTS 60 would remove drag on overall performance.`
    );
  }

  if (stats.avgConfidence >= 70) {
    keyInsights.push(
      "Average AI confidence is healthy, suggesting decisions are well-supported by signal data."
    );
  } else {
    risks.push(
      "Average AI confidence is low. Decision quality gates should be tightened to reduce weak entries."
    );
  }

  if (stats.topSymbolConcentration > 35) {
    risks.push(
      `Top symbol (${stats.topSymbol}) accounts for ${stats.topSymbolConcentration.toFixed(0)}% of trades — high concentration risk. Consider per-symbol trade limits.`
    );
  }

  userBehaviorInsights.push(
    `${stats.usersWithActivity} of ${stats.totalUsers} users had engine activity in this window.`
  );

  if (stats.winRate >= 55) {
    keyInsights.push(
      `Platform win rate of ${stats.winRate.toFixed(1)}% is above breakeven threshold.`
    );
  } else {
    risks.push(
      `Platform win rate of ${stats.winRate.toFixed(1)}% is below 55%. Review entry criteria.`
    );
  }

  recommendations.push(
    "Focus strategy improvements on CTS >70 trades where the system demonstrates clear edge."
  );
  recommendations.push(
    "Reduce or gate entries below CTS 60 to improve overall platform P&L."
  );
  if (stats.engineFailedRuns > 0) {
    recommendations.push(
      `Investigate ${stats.engineFailedRuns} failed engine runs to prevent escalation.`
    );
  }

  return {
    overview:
      `Luckmi platform processed ${stats.totalTrades} trades from ${stats.usersWithActivity} active users in this window. ` +
      `Win rate is ${stats.winRate.toFixed(1)}% with realized P&L of ${stats.totalRealizedPnl.toFixed(2)}. ` +
      `System edge is most concentrated in high-CTS setups. Engine reliability is ${stats.engineSuccessRate.toFixed(1)}%.`,
    keyInsights: keyInsights.length
      ? keyInsights
      : ["System is active and producing measurable data for analysis."],
    risks: risks.length
      ? risks
      : ["No critical risks flagged in this window."],
    edgeAnalysis: edgeAnalysis.length
      ? edgeAnalysis
      : [
          "CTS performance segmentation needs more trade volume for statistically significant conclusions.",
        ],
    executionHealth,
    userBehaviorInsights,
    recommendations,
  };
}
