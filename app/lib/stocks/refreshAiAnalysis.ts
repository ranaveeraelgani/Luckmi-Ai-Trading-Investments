import { getAiRecommendation } from "@/app/lib/AiRecommendation/getAiRecommendation";

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

export async function refreshAiAnalysis(
  symbol: string,
  analysis: any,
  instruction?: string
) {
  const aiRecommendation = await getAiRecommendation(
    symbol,
    analysis?.ctsScore ?? analysis?.finalScore ?? undefined,
    instruction || undefined,
    toNumber(analysis?.rsi),
    analysis?.macd ?? undefined,
    analysis?.signal ?? undefined,
    analysis?.ema200 ?? undefined,
    Array.isArray(analysis?.recentCloses) ? analysis.recentCloses : [],
    analysis?.lastClose ?? undefined,
    analysis?.dailyCTS ?? undefined,
    analysis?.intradayCTS ?? undefined,
    analysis?.alignment ?? undefined,
    analysis?.levels ?? undefined
  );

  return {
    action: aiRecommendation?.action ?? null,
    reason: aiRecommendation?.reason || "",
    confidence: aiRecommendation?.confidence || 50,
    aiScore: aiRecommendation?.aiScore || null,
  };
}