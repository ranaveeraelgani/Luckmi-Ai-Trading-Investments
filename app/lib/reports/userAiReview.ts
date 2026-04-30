/**
 * User-facing AI trading review:
 * - ReviewResponse type
 * - buildUserReviewSummary   — aggregates raw DB rows → compact stats object
 * - buildUserAiReviewPrompt  — constructs the OpenAI prompt string
 * - userAiFallbackReview     — deterministic fallback when OpenAI is unavailable
 */

import { toNumber, classifyAction } from "./reportHelpers";

export type ReviewResponse = {
  overview: string;
  strengths: string[];
  risks: string[];
  symbolInsights: { symbol: string; insight: string }[];
  nextFocus: string[];
};

// ─── Summary builder ─────────────────────────────────────────────────────────

export function buildUserReviewSummary(
  trades: any[],
  decisions: any[],
  brokerOrders: any[],
  positions: any[],
  brokerPositions: any[]
) {
  const symbolTradeCounts = new Map<string, number>();
  const symbolRealizedPnl = new Map<string, number>();
  const actionCounts: Record<string, number> = {
    buy: 0,
    buy_more: 0,
    partial_sell: 0,
    sell: 0,
    hold: 0,
    other: 0,
  };

  let wins = 0;
  let losses = 0;
  let realizedPnl = 0;
  let ctsSum = 0;
  let ctsCount = 0;
  let confidenceSum = 0;
  let confidenceCount = 0;
  let highQualitySetups = 0;
  let mixedQualitySetups = 0;

  for (const trade of trades) {
    const symbol = String(trade.symbol || "").toUpperCase();
    if (symbol) {
      symbolTradeCounts.set(symbol, toNumber(symbolTradeCounts.get(symbol)) + 1);
    }

    const action = classifyAction(trade.type);
    if (action in actionCounts) actionCounts[action] += 1;

    if (action === "sell" || action === "partial_sell") {
      const pnl = toNumber(trade.pnl);
      realizedPnl += pnl;
      if (pnl > 0) wins += 1;
      if (pnl < 0) losses += 1;
      if (symbol) {
        symbolRealizedPnl.set(symbol, toNumber(symbolRealizedPnl.get(symbol)) + pnl);
      }
    }

    const cts = Number(trade.cts_score);
    if (Number.isFinite(cts)) { ctsSum += cts; ctsCount += 1; }

    const conf = Number(trade.confidence);
    if (Number.isFinite(conf)) { confidenceSum += conf; confidenceCount += 1; }

    const strongSetup = Number.isFinite(cts) && cts >= 70 && Number.isFinite(conf) && conf >= 75;
    if (strongSetup) highQualitySetups += 1;
    else mixedQualitySetups += 1;
  }

  for (const decision of decisions) {
    const action = classifyAction(decision.action);
    if (action in actionCounts) actionCounts[action] += 1;

    const cts = Number(decision.cts_score);
    if (Number.isFinite(cts)) { ctsSum += cts; ctsCount += 1; }

    const conf = Number(decision.confidence);
    if (Number.isFinite(conf)) { confidenceSum += conf; confidenceCount += 1; }

    const strongSetup = Number.isFinite(cts) && cts >= 70 && Number.isFinite(conf) && conf >= 75;
    if (strongSetup) highQualitySetups += 1;
    else mixedQualitySetups += 1;
  }

  const topTradedSymbols = [...symbolTradeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([symbol]) => symbol);

  const topSymbolCount =
    topTradedSymbols.length > 0
      ? toNumber(symbolTradeCounts.get(topTradedSymbols[0]))
      : 0;
  const totalTradeEvents = trades.length;
  const overtradingSymbol =
    totalTradeEvents >= 8 &&
    topTradedSymbols.length > 0 &&
    topSymbolCount / Math.max(totalTradeEvents, 1) >= 0.4
      ? topTradedSymbols[0]
      : null;

  const symbolPnLRanking = [...symbolRealizedPnl.entries()].sort(
    (a, b) => b[1] - a[1]
  );
  const bestSymbol = symbolPnLRanking[0]?.[0] || null;
  const worstSymbol =
    symbolPnLRanking[symbolPnLRanking.length - 1]?.[0] || null;

  const totalClosed = wins + losses;

  return {
    topTradedSymbols,
    actionCounts,
    winRate: totalClosed > 0 ? (wins / totalClosed) * 100 : 0,
    realizedPnl,
    avgCts: ctsCount > 0 ? ctsSum / ctsCount : 0,
    avgConfidence: confidenceCount > 0 ? confidenceSum / confidenceCount : 0,
    bestSymbol,
    worstSymbol,
    overtradingSymbol,
    highQualitySetupRate:
      highQualitySetups + mixedQualitySetups > 0
        ? (highQualitySetups / (highQualitySetups + mixedQualitySetups)) * 100
        : 0,
    mixedQualitySetupRate:
      highQualitySetups + mixedQualitySetups > 0
        ? (mixedQualitySetups / (highQualitySetups + mixedQualitySetups)) * 100
        : 0,
    openPositions: positions
      .filter((p) => String(p.status || "").toLowerCase() === "in-position")
      .map((p) => ({
        symbol: p.symbol,
        pnl: toNumber(p.pnl),
        peak_pnl_percent: toNumber(p.peak_pnl_percent),
      }))
      .slice(0, 10),
    brokerFilledOrders: brokerOrders
      .filter((o) => String(o.status || "").toLowerCase() === "filled")
      .slice(0, 20)
      .map((o) => ({
        symbol: o.symbol,
        side: o.side,
        qty: toNumber(o.qty),
        filled_avg_price: toNumber(o.filled_avg_price),
      })),
    brokerPositionSnapshot: brokerPositions.slice(0, 10).map((p) => ({
      symbol: p.symbol,
      qty: toNumber(p.qty),
      unrealized_pl: toNumber(p.unrealized_pl),
      unrealized_plpc: toNumber(p.unrealized_plpc),
    })),
  };
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

export function buildUserAiReviewPrompt(
  summaryStats: ReturnType<typeof buildUserReviewSummary>
): string {
  return `You are Luckmi AI Trading Assistant. Review the user's recent paper/live trading history.
Do not give financial advice. Do not promise profits.
Explain what happened, patterns, strengths, risks, and what the user should pay attention to next.
Use plain English for a non-expert.

You are reviewing behavior quality, not predicting the next trade.

Input summary (compact):
${JSON.stringify(summaryStats, null, 2)}

Return STRICT JSON only with this shape:
{
  "overview": "string",
  "strengths": ["string"],
  "risks": ["string"],
  "symbolInsights": [
    { "symbol": "string", "insight": "string" }
  ],
  "nextFocus": ["string"]
}

Rules:
- Keep overview 3-5 sentences.
- strengths: 2-4 bullets.
- risks: 2-4 bullets.
- symbolInsights: up to 4 symbols, each practical.
- nextFocus: 2-4 concrete focus points.
- No trade signals or price targets.
- No financial-advice language.
`;
}

// ─── Deterministic fallback ───────────────────────────────────────────────────

export function userAiFallbackReview(
  summary: ReturnType<typeof buildUserReviewSummary>
): ReviewResponse {
  const strengths: string[] = [];
  const risks: string[] = [];
  const nextFocus: string[] = [];

  if (summary.winRate >= 55) {
    strengths.push(
      "Closed-trade outcomes are positive with a healthy win rate in this window."
    );
  }
  if (summary.highQualitySetupRate >= 50) {
    strengths.push(
      "Most decisions are coming from stronger CTS and confidence setups."
    );
  }
  if (summary.overtradingSymbol) {
    risks.push(
      `Trading activity is concentrated in ${summary.overtradingSymbol}, which may increase single-symbol risk.`
    );
  }
  if (summary.winRate < 45) {
    risks.push(
      "Recent closed-trade win rate is weak, which suggests setup quality or timing drift."
    );
  }
  if (summary.mixedQualitySetupRate > summary.highQualitySetupRate) {
    risks.push(
      "Mixed-score setups are frequent and appear to reduce consistency."
    );
  }

  nextFocus.push(
    "Prioritize entries where CTS and confidence are both above your stronger-performing thresholds."
  );
  nextFocus.push(
    "Reduce repeat entries in the same symbol after weak outcomes."
  );
  nextFocus.push(
    "Review lower-confidence exits to confirm they are driven by clear risk signals."
  );

  const bestSymbol = summary.bestSymbol || "N/A";
  const worstSymbol = summary.worstSymbol || "N/A";

  return {
    overview:
      `Your recent trading activity is centered around ${summary.topTradedSymbols?.slice(0, 2).join(" and ") || "a small set of symbols"}. ` +
      `Closed-trade win rate is ${summary.winRate.toFixed(1)}% with realized P&L of ${summary.realizedPnl.toFixed(2)}. ` +
      `Best symbol is ${bestSymbol} and weakest symbol is ${worstSymbol}. ` +
      "Luckmi should keep focusing on higher-quality setups and avoid forcing mixed-score trades.",
    strengths: strengths.length
      ? strengths
      : ["AI decisions are active and producing a consistent pattern you can optimize."],
    risks: risks.length
      ? risks
      : [
          "No major behavior risk flagged in this window, but continue watching concentration and setup quality drift.",
        ],
    symbolInsights: [
      {
        symbol: bestSymbol,
        insight:
          "This symbol delivered the strongest realized outcomes in the selected window.",
      },
      {
        symbol: worstSymbol,
        insight:
          "This symbol underperformed and should be reviewed for entry quality and timing.",
      },
    ].filter((row) => row.symbol && row.symbol !== "N/A"),
    nextFocus,
  };
}
