"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/components/TopNav";
type WatchlistItem = {
  id: string;
  watchlist_id?: string;
  symbol: string;
};

type Quote = {
  symbol: string;
  price?: number | string | null;
  changePercent?: number | string | null;
  percentChange?: number | string | null;
};

function formatPrice(value?: number | string | null) {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? `$${num.toFixed(2)}` : "--";
}

function formatPercent(value?: number | string | null) {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return "--";
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toFixed(2)}%`;
}

export default function WatchlistPage() {
  const router = useRouter();

  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [loading, setLoading] = useState(true);
  const [removingSymbol, setRemovingSymbol] = useState<string | null>(null);
    const [newSymbol, setNewSymbol] = useState("");
    const [addingSymbol, setAddingSymbol] = useState(false);
  useEffect(() => {
    loadWatchlist();
  }, []);

  async function loadWatchlist() {
    try {
      const res = await fetch("/api/watchlist", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load watchlist");

      const data = await res.json();
      const items = Array.isArray(data) ? data : [];
      setWatchlist(items);

      const symbols = items.map((s) => s.symbol).filter(Boolean);
      if (symbols.length) {
        await fetchQuotes(symbols);
      }
    } catch (err) {
      console.error("Failed to load watchlist", err);
      setWatchlist([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchQuotes(symbols: string[]) {
    try {
      const res = await fetch(`/api/quotes?symbols=${symbols.join(",")}`, {
        cache: "no-store",
      });

      if (!res.ok) throw new Error(`Quote request failed: ${res.status}`);

      const data = await res.json();
      const rows = Array.isArray(data) ? data : [];

      const map: Record<string, Quote> = {};
      rows.forEach((q: Quote) => {
        if (q?.symbol) map[q.symbol] = q;
      });

      setQuotes(map);
    } catch (err) {
      console.error("Quote fetch failed", err);
    }
  }

  async function handleRemove(symbol: string) {
    try {
      setRemovingSymbol(symbol);

      const res = await fetch("/api/watchlist/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to remove symbol");
      }

      await loadWatchlist();
    } catch (err) {
      console.error("Failed to remove watchlist symbol", err);
    } finally {
      setRemovingSymbol(null);
    }
  }

  function handleSelect(symbol: string) {
    router.push(`/watchlist/${symbol}`);
  }

    async function handleAddWatchlistSymbol() {
        const symbol = newSymbol.trim().toUpperCase();
        if (!symbol) return;

        try {
            setAddingSymbol(true);

            const res = await fetch("/api/watchlist/add", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ symbol }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data?.error || "Failed to add symbol");
            }

            setNewSymbol("");
            await loadWatchlist();
        } catch (err) {
            console.error("Failed to add watchlist symbol", err);
          alert(err instanceof Error ? err.message : "Failed to add watchlist symbol");
        } finally {
            setAddingSymbol(false);
        }
    }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0f16] p-4 text-white sm:p-6">
        <div className="mx-auto max-w-5xl text-sm text-gray-400">
          Loading watchlist...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0f16] p-4 text-white sm:p-6">
      <TopNav activePage="watchlist" />
      <div className="mx-auto max-w-5xl space-y-4 mt-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
                <h1 className="text-2xl font-semibold sm:text-3xl">Watchlist</h1>
                <p className="mt-2 text-sm text-gray-400">
                    Tap a stock to see its trend, AI insight, and news.
                </p>
            </div>

            <div className="flex gap-2">
                <input
                    value={newSymbol}
                    onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                    placeholder="Add symbol"
                    className="w-32 rounded-2xl border border-gray-700 bg-[#0f141b] px-4 py-2 text-sm text-white outline-none placeholder:text-gray-500 focus:border-blue-500"
                />
                <button
                    type="button"
                    onClick={handleAddWatchlistSymbol}
                    disabled={addingSymbol}
                    className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
                >
                    {addingSymbol ? "Adding..." : "+ Add"}
                </button>
            </div>
        </div>

        <div className="space-y-2">
          {watchlist.length === 0 ? (
            <div className="rounded-3xl border border-gray-800 bg-[#11151c] p-5 text-sm text-gray-400">
              No watchlist symbols yet.
            </div>
          ) : (
            watchlist.map((item, index) => {
              const quote = quotes[item.symbol];
              const price = quote?.price;
              const changePercent = quote?.changePercent ?? quote?.percentChange;

              return (
                <div
                  key={item.id || `${item.symbol}-${index}`}
                  className="flex items-center gap-2 rounded-2xl border border-gray-800 bg-[#11151c] px-3 py-3 transition hover:bg-[#161b22]"
                >
                  <button
                    onClick={() => handleSelect(item.symbol)}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white sm:text-base">
                        {item.symbol}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-medium text-white">
                        {formatPrice(price)}
                      </div>
                      <div className="text-xs text-gray-400">
                        {formatPercent(changePercent)}
                      </div>
                    </div>

                    <div className="hidden sm:flex">
                      <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-[11px] text-blue-300">
                        CTS
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRemove(item.symbol)}
                    disabled={removingSymbol === item.symbol}
                    className="rounded-xl border border-gray-700 bg-[#0f141b] px-2.5 py-2 text-sm text-gray-300 transition hover:border-red-500/40 hover:text-red-300 disabled:opacity-50"
                    aria-label={`Remove ${item.symbol}`}
                  >
                    {removingSymbol === item.symbol ? "…" : "✕"}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}