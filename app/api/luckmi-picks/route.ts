import { NextResponse } from "next/server";
import { getAiRecommendation } from "@/app/lib/AiRecommendation/getAiRecommendation";
import { getCtsForSymbol } from "@/app/lib/evaluateAi/evaluateHelpers/getCtsForSymbol";

const CORE_UNIVERSE = [
  "AAPL", "MSFT", "NVDA", "AMZN", "META",
  "GOOGL", "TSLA", "AMD", "AVGO", "NFLX",
  "PLTR", "COIN", "SHOP", "UBER", "CRM",
  "QQQ", "SPY",
];

function isGoodCandidate(stock: any) {
  const symbol = String(stock.symbol || stock.ticker || "").toUpperCase();
  const price = Number(stock.price ?? stock.lastPrice ?? stock.close ?? stock.day?.c);
  const changePercent = Number(stock.changePercent ?? stock.todaysChangePerc);
  const volume = Number(stock.volume ?? stock.day?.v);

  if (!symbol) return false;
  if (symbol.includes(".") || symbol.includes("-")) return false;
  if (!Number.isFinite(price) || price < 5) return false;
  if (Number.isFinite(volume) && volume < 1_000_000) return false;
  if (Number.isFinite(changePercent) && Math.abs(changePercent) > 25) return false;

  return true;
}

function alignmentBoost(alignment?: string | null) {
  if (alignment === "bullish_confirmed") return 10;
  if (alignment === "bullish_timing_weak") return 4;
  if (alignment === "countertrend_bounce") return 1;
  if (alignment === "bearish_confirmed") return -12;
  return 0;
}

function overextendedPenalty(changePercent?: number) {
  if (!Number.isFinite(Number(changePercent))) return 0;
  if (Number(changePercent) > 15) return 10;
  if (Number(changePercent) > 8) return 4;
  return 0;
}

export async function GET() {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

    const trendingRes = await fetch(`${baseUrl}/api/trending`, {
      cache: "no-store",
    });

    const trendingData = trendingRes.ok ? await trendingRes.json() : [];
    const trendingRows = Array.isArray(trendingData)
      ? trendingData
      : trendingData?.stocks || [];

    const trendingSymbols = trendingRows
      .filter(isGoodCandidate)
      .map((s: any) => String(s.symbol || s.ticker).toUpperCase());

    const candidates = Array.from(
      new Set([...CORE_UNIVERSE, ...trendingSymbols])
    ).slice(0, 25);

    const results = await Promise.allSettled(
      candidates.map(async (symbol) => {
        const trendMeta =
          trendingRows.find(
            (row: any) =>
              String(row.symbol || row.ticker).toUpperCase() === symbol
          ) || {};

        const cts = await getCtsForSymbol(symbol);

        const ctsScore = Number(cts?.ctsScore ?? 0);
        const changePercent = Number(
          trendMeta.changePercent ?? trendMeta.todaysChangePerc ?? 0
        );

        const rankScore =
          ctsScore +
          alignmentBoost(cts?.alignment) -
          overextendedPenalty(changePercent);

        const ai = await getAiRecommendation(
          symbol,
          ctsScore,
          "Explain in 2 short sentences why this stock is or is not a good Luckmi pick today. Avoid hype. Mention risk if extended.",
          Number(cts?.rsi),
          cts?.macd?.toString?.(),
          cts?.signal?.toString?.(),
          cts?.ema200,
          Array.isArray(cts?.recentCloses) ? cts.recentCloses : [],
          Array.isArray(cts?.dailyCloses) ? cts.dailyCloses.at(-1) : undefined,
          cts?.dailyCTS,
          cts?.intradayCTS,
          cts?.alignment,
          {
            support: cts?.levels?.support ?? null,
            resistance: cts?.levels?.resistance ?? null,
            reclaimLevel: cts?.levels?.reclaimLevel ?? null,
            breakdownLevel: cts?.levels?.breakdownLevel ?? null,
          }
        );

        return {
          symbol,
          rankScore,
          ctsScore,
          dailyCTS: cts?.dailyCTS ?? null,
          intradayCTS: cts?.intradayCTS ?? null,
          alignment: cts?.alignment ?? null,
          action: ai?.action ?? "Hold",
          confidence: ai?.confidence ?? 50,
          reason: ai?.reason ?? "",
          source: trendingSymbols.includes(symbol) ? "trending" : "core",
        };
      })
    );

    const picks = results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
      .map((r) => r.value)
      .filter((p) => p.ctsScore >= 55)
      .sort((a, b) => b.rankScore - a.rankScore)
      .slice(0, 3);

    return NextResponse.json({ picks });
  } catch (error) {
    console.error("Luckmi picks error:", error);
    return NextResponse.json(
      { error: "Failed to load Luckmi picks" },
      { status: 500 }
    );
  }
}