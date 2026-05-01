export type AdvancedMetrics = {
  totalDecisions: number;
  avgConfidence: number;
  avgCts: number;
  winRate: number;
  realizedPnL: number;
  highConfidenceSellWinRate: number;
  strictFilterPnL: number;
  openPositionsCount: number;
  openUnrealized: number;
  openWinners: number;
  openLosers: number;
  buys: number;
  holds: number;
  sells: number;
  sellTradesCount: number;
  symbolScoreboard: { symbol: string; sells: number; realized: number; winRate: number }[];
};

export type AdvancedDiversification = {
  score: number;
  status: string;
  topSymbol: string | null;
  topPercent: number;
};

/**
 * Sends a quantitative diagnostics request about current report metrics to Luckmi chat.
 * Returns the structured plain-text diagnostics string.
 * Throws on network or API errors.
 */
export async function askLuckmiAdvancedDiagnostics(params: {
  question: string;
  range: string;
  metrics: AdvancedMetrics;
  diversification: AdvancedDiversification;
}): Promise<string> {
  const { question, range, metrics, diversification } = params;

  const resolvedQuestion =
    question.trim() ||
    "Give a quantitative diagnostics read: where performance drift is happening, what threshold to tune first, and what to test next 7 days.";

  const prompt = `You are Luckmi AI Advanced Diagnostics Assistant.
You are analyzing existing report metrics only.
Do not provide financial advice. Do not promise outcomes.
Focus on diagnostics, drift detection, and parameter tuning logic.

User request: ${resolvedQuestion}

Advanced context:
${JSON.stringify(
  {
    range,
    metrics: {
      totalDecisions: metrics.totalDecisions,
      avgConfidence: metrics.avgConfidence,
      avgCts: metrics.avgCts,
      winRate: metrics.winRate,
      realizedPnL: metrics.realizedPnL,
      highConfidenceSellWinRate: metrics.highConfidenceSellWinRate,
      strictFilterPnL: metrics.strictFilterPnL,
      openPositionsCount: metrics.openPositionsCount,
      openUnrealized: metrics.openUnrealized,
      openWinners: metrics.openWinners,
      openLosers: metrics.openLosers,
      buys: metrics.buys,
      holds: metrics.holds,
      sells: metrics.sells,
      sellTradesCount: metrics.sellTradesCount,
    },
    diversification: {
      score: diversification.score,
      status: diversification.status,
      topSymbol: diversification.topSymbol,
      topPercent: diversification.topPercent,
    },
    symbolScoreboard: metrics.symbolScoreboard,
  },
  null,
  2
)}

Return exactly these sections in plain text:
1) DIAGNOSTIC SUMMARY (3-5 sentences)
2) ROOT CAUSES (3 concise bullets)
3) PARAMETER TUNING PLAN (3 concise bullets)
4) NEXT 7-DAY TEST PLAN (3 concise bullets)
5) RISK GUARDRAILS (3 concise bullets)

Keep it practical and data-driven.`;

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error || "Failed to get advanced diagnostics");
  }

  return String(data?.content || "No diagnostics available.");
}
