"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/components/TopNav";
import AddPositionModal from "@/components/portfolio/AddPositionModal";

type Mode = "personal" | "auto";

type PortfolioItem = {
  id?: string;
  source?: "personal" | "auto";
  symbol: string;
  shares?: number;
  avgPrice?: number;
  entryPrice?: number | null;
  currentPrice?: number | null;
  marketValue?: number | null;
  pnl?: number | null;
  pnlPercent?: number | null;
  status?: string | null;
  lastAiDecision?: {
    action?: string;
    confidence?: number;
    reason?: string;
  } | null;
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

  const [mode, setMode] = useState<Mode>("personal");
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [loading, setLoading] = useState(true);
  const [showAddPosition, setShowAddPosition] = useState(false);
  const [removingSymbol, setRemovingSymbol] = useState<string | null>(null);
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const [hasAutoAccess, setHasAutoAccess] = useState(false);

  useEffect(() => {
    loadSubscription();
  }, []);

  useEffect(() => {
    loadPortfolio();
  }, [mode]);

  async function loadSubscription() {
    try {
      const res = await fetch("/api/subscription/me", { cache: "no-store" });
      if (!res.ok) {
        return;
      }

      const data = await res.json();      
      setHasAutoAccess(Boolean(data?.allowCronAutomation));
      //For Testing purpose setting setHasAutoAccess ture, remove when subscription is implemented
      setHasAutoAccess(true);
    } catch (err) {
      console.error("Failed to load subscription", err);
      setHasAutoAccess(false);
    }
  }

  async function loadPortfolio() {
    try {
      setLoading(true);

      const endpoint = mode === "auto" ? "/api/portfolio/auto" : "/api/portfolio";
      const res = await fetch(endpoint, { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Failed to load portfolio");
      }

      const data = await res.json();
      const items = Array.isArray(data)
        ? data
        : Array.isArray(data?.positions)
        ? data.positions
        : [];

      setPortfolio(items);

      const symbols = items
        .filter((item: PortfolioItem) => item.currentPrice == null)
        .map((item: PortfolioItem) => item.symbol)
        .filter(Boolean);

      if (symbols.length > 0) {
        await fetchQuotes(symbols);
      } else {
        setQuotes({});
      }
    } catch (err) {
      console.error("Failed to load portfolio", err);
      setPortfolio([]);
      setQuotes({});
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
            {mode === "auto"
              ? "Review AI-managed positions with price, P&L, and latest decision context."
              : "Tap a holding to see its CTS score, alignment, AI insight, and news."}
            </p>
        </div>

        <div className="flex flex-col gap-3 sm:items-end">
          {hasAutoAccess ? (
            <div className="flex rounded-2xl border border-white/10 bg-[#1A1F2B] p-1">
              <button
                type="button"
                onClick={() => setMode("personal")}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  mode === "personal"
                    ? "bg-emerald-500 text-black"
                    : "text-gray-300 hover:text-white"
                }`}
              >
                Personal
              </button>

              <button
                type="button"
                onClick={() => setMode("auto")}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  mode === "auto"
                    ? "bg-emerald-500 text-black"
                    : "text-gray-300 hover:text-white"
                }`}
              >
                Auto Positions
              </button>
            </div>
          ) : null}

          {mode === "personal" ? (
            <button
              type="button"
              onClick={() => setShowAddPosition(true)}
              className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              + Add Position
            </button>
          ) : null}
        </div>
        </div>

        {mode === "auto" && hasAutoAccess ? (
          <div className="rounded-2xl border border-[#F5C76E]/15 bg-[#F5C76E]/[0.04] px-4 py-3 text-sm text-[#F5C76E]">
            AI-managed positions from Auto Trading.
          </div>
        ) : null}

        <div className="space-y-3 mt-2">
          {portfolio.length === 0 ? (
            <div className="rounded-3xl border border-gray-800 bg-[#11151c] p-5 text-sm text-gray-400">
              {mode === "auto"
                ? "No active auto positions yet. Positions appear here only after the engine enters a trade."
                : "No portfolio holdings found."}
            </div>
          ) : (
            portfolio.map((item, index) => {
              const quote = quotes[item.symbol];

              const currentPrice =
                item.currentPrice != null
                  ? Number(item.currentPrice)
                  : typeof quote?.price === "number"
                  ? quote.price
                  : Number(quote?.price);

              const changePercentRaw =
                item.pnlPercent ?? quote?.changePercent ?? quote?.percentChange ?? null;

              const changePercent =
                typeof changePercentRaw === "number"
                  ? changePercentRaw
                  : Number(changePercentRaw);

              const shares = Number(item.shares ?? 0);
              const avgPrice = Number(item.avgPrice ?? item.entryPrice ?? 0);
              const marketValue =
                item.marketValue != null
                  ? Number(item.marketValue)
                  : Number.isFinite(currentPrice) && shares
                  ? shares * currentPrice
                  : null;
              const pnl =
                item.pnl != null
                  ? Number(item.pnl)
                  : Number.isFinite(currentPrice) && shares && avgPrice
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

                    {mode === "personal" ? (
                      <button
                        type="button"
                        onClick={() => handleRemovePosition(item.symbol)}
                        disabled={removingSymbol === item.symbol}
                        className="rounded-xl border border-gray-700 bg-[#0f141b] px-3 py-2 text-xs font-medium text-gray-300 transition hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                      >
                        {removingSymbol === item.symbol ? "Removing..." : "Remove"}
                      </button>
                    ) : (
                      <div className="rounded-xl border border-[#F5C76E]/15 bg-[#F5C76E]/[0.04] px-3 py-2 text-xs font-medium text-[#F5C76E]">
                        AI Managed
                      </div>
                    )}
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

                      {mode === "auto" ? (
                        <div className="rounded-2xl bg-[#1a1f2e] p-3">
                          <div className="text-xs text-gray-400">AI Decision</div>
                          <div className="mt-1 font-medium text-white">
                            {item.lastAiDecision?.action || "—"}
                          </div>
                          <div className="mt-1 text-xs text-gray-500">
                            Confidence {item.lastAiDecision?.confidence ?? "—"}%
                          </div>
                        </div>
                      ) : null}

                      {mode === "auto" && item.lastAiDecision?.reason ? (
                        <div className="rounded-2xl bg-[#1a1f2e] p-3 sm:col-span-3">
                          <div className="text-xs text-gray-400">Last AI Analysis</div>
                          <div className="mt-1 text-sm text-gray-300">
                            {item.lastAiDecision.reason}
                          </div>
                        </div>
                      ) : null}

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