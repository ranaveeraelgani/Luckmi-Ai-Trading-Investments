import { getCtsForSymbol } from "@/app/lib/evaluateAi/evaluateHelpers/getCtsForSymbol";
import { getAiRecommendation } from "@/app/lib/AiRecommendation/getAiRecommendation";
import { da } from "zod/v4/locales";

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

export type StockAnalysisResult = {
  symbol: string;
  ctsScore: number | null;
  dailyCTS: number | null;
  intradayCTS: number | null;
  alignment: string | null;
  levels?: {
    support?: number | null;
    resistance?: number | null;
    reclaimLevel?: number | null;
    breakdownLevel?: number | null;
  };
  breakdown?: Record<string, any>;
  rsi?: number | null;
  macd?: string | null;
  signal?: string | null;
  ema200?: number | null;
  recentCloses: number[];
  lastClose?: number | null;
  aiRecommendation: {
    action: "Buy" | "Hold" | "Sell" | "Strong Buy" | null;
    reason: string;
    confidence: number;
    aiScore: number | null;
  } | null;
  stockNews: any[];
};

type LoadStockAnalysisParams = {
  symbol: string;
  timeRange?: string;
  resolution?: string;
  filtersApplied?: Record<string, any>;
};

export async function loadStockAnalysis({
  symbol,
  timeRange,
  resolution,
  filtersApplied,
}: LoadStockAnalysisParams): Promise<StockAnalysisResult> {
  const ctsResult = await getCtsForSymbol(symbol);

  const currentCts = ctsResult.ctsScore;
  const rsi = toNumber(ctsResult.rsi);
  const macd = ctsResult.macd?.toString?.() ?? null;
  const signal = ctsResult.signal?.toString?.() ?? null;
  const ema200 = ctsResult.ema200 ?? null;
  const recentCloses = Array.isArray(ctsResult.recentCloses) ? ctsResult.recentCloses : [];
  const lastClose = Array.isArray(ctsResult.dailyCloses)
    ? ctsResult.dailyCloses.at(-1) ?? null
    : null;

  const aiRecommendation = await getAiRecommendation(
    symbol,
    currentCts,
    undefined,
    rsi,
    macd ?? undefined,
    signal ?? undefined,
    ema200 ?? undefined,
    recentCloses,
    lastClose ?? undefined,
    ctsResult.dailyCTS,
    ctsResult.intradayCTS,
    ctsResult.alignment,
    ctsResult.levels ? ctsResult.levels : undefined
  );

    const res = await fetch(`/api/news?symbol=${symbol}`);
    const stockNews = res.ok ? await res.json() : [];

  return {
    symbol,
    ctsScore: ctsResult.ctsScore ?? null,
    dailyCTS: ctsResult.dailyCTS ?? null,
    intradayCTS: ctsResult.intradayCTS ?? null,
    alignment: ctsResult.alignment ?? null,
    levels: ctsResult.levels ?? undefined,
    breakdown: ctsResult.breakdown || {},
    rsi: rsi ?? null,
    macd,
    signal,
    ema200: toNumber(ema200),
    recentCloses,
    lastClose,
    aiRecommendation: {
      action: (aiRecommendation?.action as "Buy" | "Hold" | "Sell" | "Strong Buy" | null) ?? null,
      reason: aiRecommendation?.reason || "",
      confidence: aiRecommendation?.confidence || 50,
      aiScore: aiRecommendation?.aiScore || null,
    },
    stockNews: Array.isArray(stockNews) ? stockNews : [],
  };
}