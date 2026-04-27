"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/components/TopNav";
import AddPositionModal from "@/components/portfolio/AddPositionModal";

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

export default function PortfolioPage() {
  const router = useRouter();

  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [loading, setLoading] = useState(true);
  const [showAddPosition, setShowAddPosition] = useState(false);
  const [removingSymbol, setRemovingSymbol] = useState<string | null>(null);
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);

  useEffect(() => {
    loadPortfolio();
  }, []);

  async function loadPortfolio() {
    try {
      const res = await fetch("/api/portfolio", { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Failed to load portfolio");
      }

      const data = await res.json();
      const items = Array.isArray(data) ? data : [];
      setPortfolio(items);

      const symbols = items.map((item) => item.symbol).filter(Boolean);
      if (symbols.length > 0) {
        await fetchQuotes(symbols);
      }
    } catch (err) {
      console.error("Failed to load portfolio", err);
      setPortfolio([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchQuotes(symbols: string[]) {
    try {
      const res = await fetch(`/api/quotes?symbols=${symbols.join(",")}`, {
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(`Quote request failed: ${res.status}`);
      }

      const data = await res.json();
      const rows = Array.isArray(data) ? data : [];

      const map: Record<string, Quote> = {};
      rows.forEach((quote: Quote) => {
        if (quote?.symbol) {
          map[quote.symbol] = quote;
        }
      });

      setQuotes(map);
    } catch (err) {
      console.error("Failed to fetch portfolio quotes", err);
    }
  }

  async function handleRemovePosition(symbol: string) {
    const confirmed = window.confirm(`Remove ${symbol} from portfolio?`);
    if (!confirmed) return;

    try {
      setRemovingSymbol(symbol);

      const res = await fetch("/api/portfolio/remove", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ symbol }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to remove position");
      }

      await loadPortfolio();
    } catch (err) {
      console.error("Failed to remove position", err);
    } finally {
      setRemovingSymbol(null);
    }
  }

  function toggleExpanded(symbol: string) {
    setExpandedSymbol((prev) => (prev === symbol ? null : symbol));
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0f16] p-4 text-white sm:p-6">
        <div className="mx-auto max-w-5xl">
          <div className="text-sm text-gray-400">Loading portfolio...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0f16] p-4 text-white sm:p-6">
      <TopNav activePage="portfolio" />
      <div className="mx-auto max-w-5xl space-y-4 mt-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
            <h1 className="text-2xl font-semibold sm:text-3xl">Portfolio</h1>
            <p className="mt-2 text-sm text-gray-400">
            Tap a holding to see its CTS score, alignment, AI insight, and news.
            </p>
        </div>

        <button
            type="button"
            onClick={() => setShowAddPosition(true)}
            className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
        >
            + Add Position
        </button>
        </div>

        <div className="space-y-3 mt-2">
          {portfolio.length === 0 ? (
            <div className="rounded-3xl border border-gray-800 bg-[#11151c] p-5 text-sm text-gray-400">
              No portfolio holdings found.
            </div>
          ) : (
            portfolio.map((item, index) => {
              const quote = quotes[item.symbol];

              const currentPrice =
                typeof quote?.price === "number"
                  ? quote.price
                  : Number(quote?.price);

              const changePercentRaw =
                quote?.changePercent ?? quote?.percentChange ?? null;

              const changePercent =
                typeof changePercentRaw === "number"
                  ? changePercentRaw
                  : Number(changePercentRaw);

              const shares = Number(item.shares ?? 0);
              const avgPrice = Number(item.avgPrice ?? 0);
              const marketValue =
                Number.isFinite(currentPrice) && shares
                  ? shares * currentPrice
                  : null;
              const pnl =
                Number.isFinite(currentPrice) && shares && avgPrice
                  ? (currentPrice - avgPrice) * shares
                  : null;
              const isExpanded = expandedSymbol === item.symbol;

              return (
                <div
                  key={`${item.symbol}-${index}`}
                  className="w-full rounded-3xl border border-gray-800 bg-[#11151c] p-4 text-left transition hover:bg-[#161b22]"
                >
                  <button
                    type="button"
                    onClick={() => toggleExpanded(item.symbol)}
                    aria-expanded={isExpanded}
                    className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-lg font-semibold text-white">
                          {item.symbol}
                        </div>
                        <div className="mt-1 text-sm text-gray-400">
                          {shares || "—"} shares · Avg {formatMoney(avgPrice || null)}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-base font-semibold text-white">
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
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-end text-xs text-gray-400">
                      {isExpanded ? "Hide details" : "Show details"}
                    </div>
                  </button>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => router.push(`/portfolio/${item.symbol}`)}
                      className="rounded-xl border border-gray-700 bg-[#0f141b] px-3 py-2 text-xs font-medium text-gray-300 transition hover:border-blue-500/50 hover:bg-blue-500/10 hover:text-blue-300"
                    >
                      View analysis
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRemovePosition(item.symbol)}
                      disabled={removingSymbol === item.symbol}
                      className="rounded-xl border border-gray-700 bg-[#0f141b] px-3 py-2 text-xs font-medium text-gray-300 transition hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                    >
                      {removingSymbol === item.symbol ? "Removing..." : "Remove"}
                    </button>
                  </div>

                  {isExpanded ? (
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                      <div className="rounded-2xl bg-[#1a1f2e] p-3">
                        <div className="text-xs text-gray-400">Position Value</div>
                        <div className="mt-1 font-medium text-white">
                          {formatMoney(marketValue)}
                        </div>
                      </div>

                      <div className="rounded-2xl bg-[#1a1f2e] p-3">
                        <div className="text-xs text-gray-400">Unrealized P/L</div>
                        <div
                          className={`mt-1 font-medium ${
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
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
        <AddPositionModal
            isOpen={showAddPosition}
            onClose={() => setShowAddPosition(false)}
            onCreated={async () => {
                await loadPortfolio();
            }}
        />
    </div>
        
  );
}