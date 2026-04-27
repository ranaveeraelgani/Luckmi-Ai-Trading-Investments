"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import TopNav from "@/components/TopNav";

type Pick = {
  symbol: string;
  ctsScore: number;
  dailyCTS?: number;
  intradayCTS?: number;
  alignment?: string;
  action?: string;
  confidence?: number;
  reason?: string;
  source?: string;
};

function humanizeAlignment(value?: string) {
  return value?.replaceAll("_", " ") || "Unclear";
}

export default function LuckmiPicksPage() {
  const [picks, setPicks] = useState<Pick[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPicks();
  }, []);

  async function loadPicks() {
    try {
      setLoading(true);
      const res = await fetch("/api/luckmi-picks", { cache: "no-store" });
      const data = await res.json();
      setPicks(data?.picks || []);
    } catch (err) {
      console.error("Failed to load picks", err);
      setPicks([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0f16] text-white">
      <TopNav activePage="dashboard" />

      <div className="p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold sm:text-3xl">
                Luckmi AI Picks of the Day
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-gray-400">
                Filtered daily setups using trend quality, timeframe alignment, liquidity,
                and AI interpretation.
              </p>
            </div>

            <button
              onClick={loadPicks}
              className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Refresh Picks
            </button>
          </div>

          {loading ? (
            <div className="rounded-3xl border border-gray-800 bg-[#11151c] p-6 text-gray-400">
              Finding today’s best setups...
            </div>
          ) : picks.length === 0 ? (
            <div className="rounded-3xl border border-gray-800 bg-[#11151c] p-6 text-gray-400">
              No strong Luckmi picks right now. That is okay — sometimes waiting is the best setup.
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              {picks.map((pick, index) => (
                <Link
                  key={pick.symbol}
                  href={`/watchlist/${pick.symbol}`}
                  className="rounded-3xl border border-gray-800 bg-[#11151c] p-5 transition hover:bg-[#161b22]"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm text-gray-400">Pick #{index + 1}</div>
                      <div className="mt-1 text-2xl font-semibold">{pick.symbol}</div>
                    </div>

                    <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-center">
                      <div className="text-xs text-blue-300">CTS</div>
                      <div className="text-lg font-semibold text-white">
                        {pick.ctsScore}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-2xl bg-[#1a1f2e] p-3">
                      <div className="text-xs text-gray-400">Daily</div>
                      <div className="mt-1 font-semibold">{pick.dailyCTS ?? "—"}</div>
                    </div>
                    <div className="rounded-2xl bg-[#1a1f2e] p-3">
                      <div className="text-xs text-gray-400">Intraday</div>
                      <div className="mt-1 font-semibold">{pick.intradayCTS ?? "—"}</div>
                    </div>
                  </div>

                  <div className="mt-3 rounded-2xl bg-[#1a1f2e] p-3 text-sm text-gray-300">
                    <div className="mb-1 text-xs text-gray-500">
                      {humanizeAlignment(pick.alignment)} · {pick.confidence ?? "—"}% confidence
                    </div>
                    <div className="line-clamp-4">{pick.reason || "No reason available."}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}