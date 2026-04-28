"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useStockAnalysis } from "@/app/hooks/useStockAnalysis";
import StockDetailView from "@/components/stocks/StockDetailView";
import { refreshAiAnalysis } from "@/app/lib/stocks/refreshAiAnalysis";

type Quote = {
  symbol: string;
  price?: number;
  change?: number;
  percentChange?: number;
  changePercent?: number;
};

type NewsItem = {
  title: string;
  url?: string;
  source?: string;
  publishedAt?: string;
};

export default function WatchlistSymbolPage() {
  const params = useParams();
  const rawSymbol = params?.symbol;

  const symbol = useMemo(() => {
    const value = Array.isArray(rawSymbol) ? rawSymbol[0] : rawSymbol;
    return (value || "").toUpperCase();
  }, [rawSymbol]);

  const [quote, setQuote] = useState<Quote | null>(null);
  const [marketNews, setMarketNews] = useState<NewsItem[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [analysisOverride, setAnalysisOverride] = useState<any>(null);
  const {
    data: analysis,
    loading: analysisLoading,
    error: analysisError,
    reload,
  } = useStockAnalysis({
    symbol,
  });

useEffect(() => {
  if (!symbol) return;

  let active = true;

  async function loadPageData() {
    try {
      setPageLoading(true);
      setPageError(null);

      const [quoteRes, marketNewsRes] = await Promise.allSettled([
        fetch(`/api/quotes?symbols=${symbol}`, { cache: "no-store" }),
        fetch(`/api/market-news`, { cache: "no-store" }),
      ]);

      if (!active) return;

      if (quoteRes.status === "fulfilled") {
        if (!quoteRes.value.ok) {
          throw new Error("Failed to load quote");
        }

        const quoteData = await quoteRes.value.json();
        const firstQuote = Array.isArray(quoteData) ? quoteData[0] : quoteData;
        setQuote(firstQuote || null);
      }

      if (marketNewsRes.status === "fulfilled") {
        if (!marketNewsRes.value.ok) {
          throw new Error("Failed to load market news");
        }

        const marketNewsData = await marketNewsRes.value.json();
        setMarketNews(
          Array.isArray(marketNewsData)
            ? marketNewsData
            : Array.isArray(marketNewsData?.articles)
            ? marketNewsData.articles
            : []
        );
      }
      //console.log("Page data loaded:", { quote: quoteRes, marketNews: marketNewsRes });
    } catch (err: any) {
      if (active) {
        setPageError(err?.message || "Failed to load stock detail");
      }
    } finally {
      if (active) {
        setPageLoading(false);
      }
    }
  }

  loadPageData();

  return () => {
    active = false;
  };
}, [symbol]);

  const error = analysisError || pageError;
  const loading = analysisLoading || pageLoading;

  if (!symbol) {
    return (
      <div className="min-h-screen bg-[#0b0f16] p-4 text-white sm:p-6">
        <div className="mx-auto max-w-5xl">
          <Link
            href="/watchlist"
            className="text-sm text-gray-400 transition hover:text-white"
          >
            ← Back to watchlist
          </Link>
          <div className="mt-4 rounded-3xl border border-red-500/20 bg-red-500/10 p-4 text-red-200">
            Missing symbol.
          </div>
        </div>
      </div>
    );
  }

    async function handleRefreshAi(instruction?: string) {
        if (!analysis) return;

        const refreshedAi = await refreshAiAnalysis(symbol, analysis, instruction);

        setAnalysisOverride({
            ...analysis,
            aiRecommendation: refreshedAi,
        });
    }

  return (
    <div className="min-h-screen bg-[#0b0f16] p-4 text-white sm:p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <Link
          href="/watchlist"
          className="text-sm text-gray-400 transition hover:text-white"
        >
          ← Back to watchlist
        </Link>

        <StockDetailView
        symbol={symbol}
        quote={quote}
        analysis={analysisOverride || analysis}
        marketNews={marketNews}
        loading={loading}
        error={error}
        onRefresh={reload}
        onRefreshAi={handleRefreshAi}
        mode="watchlist"
        />
      </div>
    </div>
  );
}