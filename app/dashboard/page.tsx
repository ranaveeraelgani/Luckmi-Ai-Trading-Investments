"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import LuckmiScoreModal from "@/components/shared/LuckmiScoreModal";
import  LuckmiAiIcon  from "@/components/brand/LuckmiAiIcon";
type TrendingStock = {
  symbol: string;
  price?: number | string | null;
  changePercent?: number | string | null;
};

function formatMoney(value?: number | string | null) {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? `$${num.toFixed(2)}` : "--";
}

function formatPercent(value?: number | string | null) {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return "--";
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toFixed(2)}%`;
}

function Card({
  title,
  subtitle,
  href,
}: {
  title: ReactNode;
  subtitle: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-3xl border border-gray-800 bg-[#11151c] p-5 transition hover:bg-[#161b22]"
    >
      <div className="text-lg font-semibold text-white">{title}</div>
      <div className="mt-2 text-sm text-gray-400">{subtitle}</div>
    </Link>
  );
}

export default function DashboardPage() {
  const [trendingStocks, setTrendingStocks] = useState<TrendingStock[]>([]);
  const [showCtsModal, setShowCtsModal] = useState(false);

  useEffect(() => {
    fetchTrending();
  }, []);

  async function fetchTrending() {
    try {
      const res = await fetch("/api/trending", { cache: "no-store" });
      if (!res.ok) {
        setTrendingStocks([]);
        return;
      }

      const data = await res.json();
      setTrendingStocks(Array.isArray(data) ? data : data?.stocks || []);
    } catch (err) {
      console.error("Failed to load trending stocks", err);
      setTrendingStocks([]);
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0f16] text-white">
      <TopNav activePage="dashboard" />

      <div className="p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold sm:text-3xl">Dashboard</h1>
              <p className="mt-2 max-w-2xl text-sm text-gray-400">
                A market command center for people who want fast clarity, not clutter.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowCtsModal(true)}
              className="rounded-2xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-300 transition hover:bg-blue-500/20"
            >
              How Luckmi Score Works
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card
              title="Watchlist"
              subtitle="Track ideas with CTS scores, alignment, AI analysis, and news."
              href="/watchlist"
            />
            <Card
              title="Portfolio"
              subtitle="Review your holdings with the same score-based trend insight."
              href="/portfolio"
            />
            <Card
              title="Auto Trading"
              subtitle="Manage your automated trade cycle workflow and AI-driven entries."
              href="/auto"
            />
            <Card
              title="Reports"
              subtitle="Deeper analytics and summaries as the platform grows."
              href="/reports"
            />
            <Card
              title="Alpaca Broker"
              subtitle="Connect your Alpaca account for paper trading and live trading."
              href="/alpaca"
            />
            <Card
              title={
                <span className="inline-flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded">
                    <LuckmiAiIcon />
                  </span>
                  <span>Luckmi AI Picks</span>
                </span>
              }
              subtitle="See today’s top 3 filtered setups."
              href="/picks"
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
            <section className="rounded-3xl border border-gray-800 bg-[#11151c] p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-orange-400">🔥</span>
                  <h3 className="font-semibold text-white">Top 10 Trending</h3>
                </div>
                <button
                  onClick={fetchTrending}
                  className="text-xs text-blue-400 transition hover:text-blue-300"
                >
                  Refresh
                </button>
              </div>

              <div className="max-h-80 space-y-2 overflow-y-auto lg:max-h-96">
                {trendingStocks.length > 0 ? (
                  trendingStocks.map((stock, index) => {
                    const change = Number(stock.changePercent);
                    const isPositive = Number.isFinite(change) ? change >= 0 : false;

                    return (
                      <Link
                        key={`${stock.symbol}-${index}`}
                        href={`/watchlist/${stock.symbol}`}
                        className="flex items-center justify-between rounded-2xl bg-[#1a1f2e] p-4 transition-colors hover:bg-[#242a3a]"
                      >
                        <div className="font-semibold text-white">{stock.symbol}</div>
                        <div className="text-right">
                          <div className="font-medium text-white">
                            {formatMoney(stock.price)}
                          </div>
                          <span
                            className={`rounded-full px-3 py-0.5 text-xs ${
                              isPositive
                                ? "bg-green-900/50 text-green-300"
                                : "bg-red-900/50 text-red-300"
                            }`}
                          >
                            {formatPercent(stock.changePercent)}
                          </span>
                        </div>
                      </Link>
                    );
                  })
                ) : (
                  <p className="text-sm text-gray-500">
                    Trending data will appear here during market hours.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-gray-800 bg-[#11151c] p-5">
              <h2 className="text-lg font-semibold text-white">How to use the app</h2>
              <div className="mt-4 space-y-3 text-sm text-gray-300">
                <p>1. Start with Watchlist to see what looks strong or weak right now.</p>
                <p>2. Use Portfolio to review what you already own using the same scoring model.</p>
                <p>3. Move into Auto Trading when you want the system to monitor and act more actively.</p>
              </div>

              <div className="mt-6 rounded-2xl bg-[#1a1f2e] p-4">
                <div className="text-sm font-medium text-white">Why this feels simpler</div>
                <div className="mt-2 text-sm leading-6 text-gray-400">
                  Luckmi Score reduces many indicators into one clear view, then AI explains
                  what matters in plain language.
                </div>
              </div>
            </section>
          </div>

          <LuckmiScoreModal
            isOpen={showCtsModal}
            onClose={() => setShowCtsModal(false)}
          />
        </div>
      </div>
    </div>
  );
}