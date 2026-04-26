"use client";

import { useEffect, useMemo, useState } from "react";
import TopNav from "@/components/TopNav";

type AiDecision = {
  id: string;
  symbol: string;
  action: string;
  reason?: string | null;
  confidence?: number | null;
  cts_score?: number | null;
  cts_breakdown?: any;
  created_at?: string;
};

type Trade = {
  id: string;
  symbol: string;
  type: string;
  shares?: number | null;
  price?: number | null;
  amount?: number | null;
  pnl?: number | null;
  reason?: string | null;
  confidence?: number | null;
  cts_score?: number | null;
  created_at?: string;
};

function toNumber(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function formatMoney(value?: number | null) {
  const num = Number(value);
  return Number.isFinite(num)
    ? `$${num.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
    : "—";
}

function formatPercent(value?: number | null) {
  const num = Number(value);
  return Number.isFinite(num) ? `${num.toFixed(1)}%` : "—";
}

function StatCard({
  label,
  value,
  subtext,
  tone = "default",
}: {
  label: string;
  value: string | number;
  subtext?: string;
  tone?: "default" | "green" | "red" | "blue" | "amber";
}) {
  const toneClass =
    tone === "green"
      ? "text-emerald-300"
      : tone === "red"
      ? "text-red-300"
      : tone === "blue"
      ? "text-blue-300"
      : tone === "amber"
      ? "text-amber-300"
      : "text-white";

  return (
    <div className="rounded-3xl border border-gray-800 bg-[#11151c] p-4">
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</div>
      {subtext ? <div className="mt-1 text-sm text-gray-500">{subtext}</div> : null}
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-gray-800 bg-[#11151c]">
      <div className="border-b border-gray-800 px-5 py-4">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-gray-400">{subtitle}</p> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function ReportsPage() {
  const [aiDecisions, setAiDecisions] = useState<AiDecision[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReports();
  }, []);

  async function loadReports() {
    try {
      setLoading(true);

      const [aiRes, tradesRes] = await Promise.allSettled([
        fetch("/api/ai-decisions?limit=100", { cache: "no-store" }),
        fetch("/api/trades?limit=100", { cache: "no-store" }),
      ]);

      if (aiRes.status === "fulfilled" && aiRes.value.ok) {
        const data = await aiRes.value.json();
        setAiDecisions(Array.isArray(data) ? data : data?.decisions || []);
      }

      if (tradesRes.status === "fulfilled" && tradesRes.value.ok) {
        const data = await tradesRes.value.json();
        setTrades(Array.isArray(data) ? data : data?.trades || []);
      }
    } catch (err) {
      console.error("Failed to load reports", err);
    } finally {
      setLoading(false);
    }
  }

  const metrics = useMemo(() => {
    const totalDecisions = aiDecisions.length;
    const buys = aiDecisions.filter((d) => d.action?.toLowerCase().includes("buy")).length;
    const holds = aiDecisions.filter((d) => d.action?.toLowerCase().includes("hold")).length;
    const sells = aiDecisions.filter((d) => d.action?.toLowerCase().includes("sell")).length;

    const avgConfidence =
      totalDecisions > 0
        ? aiDecisions.reduce((sum, d) => sum + toNumber(d.confidence), 0) / totalDecisions
        : 0;

    const decisionsWithCts = aiDecisions.filter((d) => d.cts_score !== null && d.cts_score !== undefined);
    const avgCts =
      decisionsWithCts.length > 0
        ? decisionsWithCts.reduce((sum, d) => sum + toNumber(d.cts_score), 0) /
          decisionsWithCts.length
        : 0;

    const sellTrades = trades.filter((t) => t.type?.toLowerCase().includes("sell"));
    const realizedPnL = sellTrades.reduce((sum, t) => sum + toNumber(t.pnl), 0);
    const wins = sellTrades.filter((t) => toNumber(t.pnl) > 0).length;
    const losses = sellTrades.filter((t) => toNumber(t.pnl) < 0).length;
    const winRate = sellTrades.length > 0 ? (wins / sellTrades.length) * 100 : 0;

    const bestTrade = sellTrades.reduce<Trade | null>((best, trade) => {
      if (!best) return trade;
      return toNumber(trade.pnl) > toNumber(best.pnl) ? trade : best;
    }, null);

    const worstTrade = sellTrades.reduce<Trade | null>((worst, trade) => {
      if (!worst) return trade;
      return toNumber(trade.pnl) < toNumber(worst.pnl) ? trade : worst;
    }, null);

    const symbolCounts = aiDecisions.reduce<Record<string, number>>((acc, d) => {
      if (!d.symbol) return acc;
      acc[d.symbol] = (acc[d.symbol] || 0) + 1;
      return acc;
    }, {});

    const topSymbols = Object.entries(symbolCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      totalDecisions,
      buys,
      holds,
      sells,
      avgConfidence,
      avgCts,
      realizedPnL,
      sellTradesCount: sellTrades.length,
      wins,
      losses,
      winRate,
      bestTrade,
      worstTrade,
      topSymbols,
    };
  }, [aiDecisions, trades]);

  const aiNarrative = useMemo(() => {
    if (metrics.totalDecisions === 0) {
      return "Luckmi has not recorded enough AI decisions yet. Once the engine starts evaluating stocks, this report will explain what the AI is seeing and how decisions are developing.";
    }

    const dominantAction =
      metrics.buys >= metrics.holds && metrics.buys >= metrics.sells
        ? "buy setups"
        : metrics.holds >= metrics.sells
        ? "hold decisions"
        : "sell signals";

    const confidenceTone =
      metrics.avgConfidence >= 75
        ? "high confidence"
        : metrics.avgConfidence >= 55
        ? "moderate confidence"
        : "lower confidence";

    const ctsTone =
      metrics.avgCts >= 75
        ? "strong trend quality"
        : metrics.avgCts >= 55
        ? "mixed but tradable conditions"
        : "weak or uncertain setups";

    return `Luckmi has recently leaned toward ${dominantAction}, with ${confidenceTone} and an average score suggesting ${ctsTone}. This helps show whether the system is finding strong opportunities or mostly waiting for better confirmation.`;
  }, [metrics]);

  return (
    <div className="min-h-screen bg-[#0b0f16] text-white">
      <TopNav activePage="reports" />

      <div className="p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold sm:text-3xl">Reports</h1>
              <p className="mt-2 max-w-2xl text-sm text-gray-400">
                Understand how Luckmi AI is thinking, where trades are coming from, and what the system is learning over time.
              </p>
            </div>

            <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm text-blue-300">
              Advanced Reports soon
            </div>
          </div>

          {loading ? (
            <div className="rounded-3xl border border-gray-800 bg-[#11151c] p-6 text-sm text-gray-400">
              Loading reports...
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="AI Decisions"
                  value={metrics.totalDecisions}
                  subtext={`${metrics.buys} buys · ${metrics.holds} holds · ${metrics.sells} sells`}
                  tone="blue"
                />
                <StatCard
                  label="Avg Confidence"
                  value={formatPercent(metrics.avgConfidence)}
                  subtext="How strongly AI felt about recent calls"
                  tone={metrics.avgConfidence >= 70 ? "green" : "amber"}
                />
                <StatCard
                  label="Avg Luckmi Score"
                  value={metrics.avgCts.toFixed(0)}
                  subtext="Average CTS from recent decisions"
                  tone={metrics.avgCts >= 70 ? "green" : "amber"}
                />
                <StatCard
                  label="Realized P&L"
                  value={formatMoney(metrics.realizedPnL)}
                  subtext={`${metrics.sellTradesCount} closed sell trades`}
                  tone={metrics.realizedPnL >= 0 ? "green" : "red"}
                />
              </div>

              <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
                <Section
                  title="AI Interpretation"
                  subtitle="A plain-English read of recent AI behavior."
                >
                  <div className="rounded-2xl bg-[#1a1f2e] p-4 text-sm leading-6 text-gray-300">
                    {aiNarrative}
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-[#1a1f2e] p-4">
                      <div className="text-xs text-gray-400">Buy Bias</div>
                      <div className="mt-1 text-xl font-semibold text-emerald-300">
                        {metrics.buys}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-[#1a1f2e] p-4">
                      <div className="text-xs text-gray-400">Wait / Hold</div>
                      <div className="mt-1 text-xl font-semibold text-amber-300">
                        {metrics.holds}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-[#1a1f2e] p-4">
                      <div className="text-xs text-gray-400">Sell / Avoid</div>
                      <div className="mt-1 text-xl font-semibold text-red-300">
                        {metrics.sells}
                      </div>
                    </div>
                  </div>
                </Section>

                <Section
                  title="Performance Snapshot"
                  subtitle="Early trading feedback from recorded sell trades."
                >
                  <div className="grid gap-3">
                    <div className="rounded-2xl bg-[#1a1f2e] p-4">
                      <div className="text-xs text-gray-400">Win Rate</div>
                      <div className="mt-1 text-2xl font-semibold text-white">
                        {formatPercent(metrics.winRate)}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {metrics.wins} wins · {metrics.losses} losses
                      </div>
                    </div>

                    <div className="rounded-2xl bg-[#1a1f2e] p-4">
                      <div className="text-xs text-gray-400">Best Trade</div>
                      <div className="mt-1 text-sm font-medium text-emerald-300">
                        {metrics.bestTrade
                          ? `${metrics.bestTrade.symbol} ${formatMoney(toNumber(metrics.bestTrade.pnl))}`
                          : "—"}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-[#1a1f2e] p-4">
                      <div className="text-xs text-gray-400">Worst Trade</div>
                      <div className="mt-1 text-sm font-medium text-red-300">
                        {metrics.worstTrade
                          ? `${metrics.worstTrade.symbol} ${formatMoney(toNumber(metrics.worstTrade.pnl))}`
                          : "—"}
                      </div>
                    </div>
                  </div>
                </Section>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <Section
                  title="Most Analyzed Symbols"
                  subtitle="Where the AI has spent the most attention."
                >
                  {metrics.topSymbols.length === 0 ? (
                    <div className="text-sm text-gray-400">No symbols analyzed yet.</div>
                  ) : (
                    <div className="space-y-3">
                      {metrics.topSymbols.map(([symbol, count]) => (
                        <div
                          key={symbol}
                          className="flex items-center justify-between rounded-2xl bg-[#1a1f2e] p-4"
                        >
                          <div className="font-semibold text-white">{symbol}</div>
                          <div className="text-sm text-gray-400">{count} decisions</div>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>

                <Section
                  title="Future Pro Reports"
                  subtitle="Planned analytics designed to make this worth paying for."
                >
                  <div className="space-y-3 text-sm text-gray-300">
                    <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4">
                      Weekly AI Performance Review
                    </div>
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                      Best Strategy Type by Market Condition
                    </div>
                    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                      Risk & Drawdown Intelligence
                    </div>
                    <div className="rounded-2xl border border-violet-500/20 bg-violet-500/10 p-4">
                      AI Decision Accuracy Over Time
                    </div>
                  </div>
                </Section>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}