"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useStockAnalysis } from "@/app/hooks/useStockAnalysis";
import StockDetailView from "@/components/stocks/StockDetailView";
import { refreshAiAnalysis } from "@/app/lib/stocks/refreshAiAnalysis";

type PortfolioItem = {
  symbol: string;
  shares?: number;
  avgPrice?: number;
};

type Quote = {
  symbol: string;
  price?: number | string | null;
  changePercent?: number | string | null;
  percentChange?: number | string | null;
};

type NewsItem = {
  title?: string;
  headline?: string;
  url?: string;
  source?: string;
  publishedAt?: string;
  datetime?: number | string;
};

function formatMoney(value?: number | string | null) {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num)
    ? `$${num.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
    : "--";
}

function formatPercent(value?: number | string | null) {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return "--";
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toFixed(2)}%`;
}

export default function PortfolioSymbolPage() {
  const params = useParams();
  const rawSymbol = params?.symbol;

  const symbol = useMemo(() => {
    const value = Array.isArray(rawSymbol) ? rawSymbol[0] : rawSymbol;
    return (value || "").toUpperCase();
  }, [rawSymbol]);

  const [holding, setHolding] = useState<PortfolioItem | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [marketNews, setMarketNews] = useState<NewsItem[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
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

        const [portfolioRes, quoteRes, marketNewsRes] = await Promise.allSettled([
          fetch("/api/portfolio", { cache: "no-store" }),
          fetch(`/api/quotes?symbols=${symbol}`, { cache: "no-store" }),
          fetch("/api/market-news", { cache: "no-store" }),
        ]);

        if (!active) return;

        if (portfolioRes.status === "fulfilled" && portfolioRes.value.ok) {
          const portfolioData = await portfolioRes.value.json();
          const items = Array.isArray(portfolioData)
            ? portfolioData
            : Array.isArray(portfolioData?.positions)
            ? portfolioData.positions
            : [];
          const matched = items.find(
            (item: PortfolioItem) => item.symbol?.toUpperCase() === symbol
          );
          setHolding(matched || null);
        }

        if (quoteRes.status === "fulfilled" && quoteRes.value.ok) {
          const quoteData = await quoteRes.value.json();
          const firstQuote = Array.isArray(quoteData) ? quoteData[0] : quoteData;
          setQuote(firstQuote || null);
        }

        if (marketNewsRes.status === "fulfilled" && marketNewsRes.value.ok) {
          const marketNewsData = await marketNewsRes.value.json();
          setMarketNews(
            Array.isArray(marketNewsData)
              ? marketNewsData
              : Array.isArray(marketNewsData?.articles)
              ? marketNewsData.articles
              : []
          );
        }
      } catch (err: any) {
        if (active) {
          setPageError(err?.message || "Failed to load portfolio detail");
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

  const shares = Number(holding?.shares ?? 0);
  const avgPrice = Number(holding?.avgPrice ?? 0);

  const currentPrice =
    typeof quote?.price === "number" ? quote.price : Number(quote?.price);

    const changePercent = quote?.changePercent ?? quote?.percentChange ?? null;

  const positionValue =
    Number.isFinite(currentPrice) && shares ? shares * currentPrice : null;

  const pnl =
    Number.isFinite(currentPrice) && shares && avgPrice
      ? (currentPrice - avgPrice) * shares
      : null;

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
          href="/portfolio"
          className="text-sm text-gray-400 transition hover:text-white"
        >
          ← Back to portfolio
        </Link>

        <div className="rounded-3xl border border-gray-800 bg-[#11151c] p-3 sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold sm:text-2xl">{symbol}</h1>
              <p className="mt-1 hidden text-xs text-gray-400 sm:block">
                Your position summary before the trend analysis below.
              </p>
            </div>

            <div className="text-left sm:text-right">
              <div className="text-lg font-semibold text-white sm:text-xl">
                {formatMoney(currentPrice)}
              </div>
              <div
                className={`mt-1 text-sm ${
                  Number(changePercent) > 0
                    ? "text-emerald-300"
                    : Number(changePercent) < 0
                    ? "text-red-300"
                    : "text-gray-400"
                }`}
              >
                {formatPercent(changePercent)}
              </div>
              <div className="text-xs text-gray-400">Current Price</div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-[#1a1f2e] p-3">
              <div className="text-xs text-gray-400">Shares</div>
              <div className="mt-1 text-base font-semibold text-white sm:text-lg">
                {shares || "—"}
              </div>
            </div>

            <div className="rounded-2xl bg-[#1a1f2e] p-3">
              <div className="text-xs text-gray-400">Avg Entry</div>
              <div className="mt-1 text-base font-semibold text-white sm:text-lg">
                {formatMoney(avgPrice)}
              </div>
            </div>

            <div className="rounded-2xl bg-[#1a1f2e] p-3">
              <div className="text-xs text-gray-400">Position Value</div>
              <div className="mt-1 text-base font-semibold text-white sm:text-lg">
                {formatMoney(positionValue)}
              </div>
            </div>

            <div className="rounded-2xl bg-[#1a1f2e] p-3">
              <div className="text-xs text-gray-400">Unrealized P/L</div>
              <div
                className={`mt-1 text-base font-semibold sm:text-lg ${
                  (pnl ?? 0) > 0
                    ? "text-emerald-300"
                    : (pnl ?? 0) < 0
                    ? "text-red-300"
                    : "text-white"
                }`}
              >
                {formatMoney(pnl)}
              </div>
            </div>
          </div>
        </div>

        <StockDetailView
        symbol={symbol}
        quote={quote}
        analysis={analysisOverride || analysis}
        marketNews={marketNews}
        loading={loading}
        error={error}
        onRefresh={reload}
        onRefreshAi={handleRefreshAi}
        mode="portfolio"
        />
      </div>
    </div>
  );
}