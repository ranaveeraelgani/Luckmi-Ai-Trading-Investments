"use client";

import { useEffect, useMemo, useState } from "react";
import TopNav from "@/components/TopNav";
import LuckmiAiIcon from "@/components/brand/LuckmiAiIcon";

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

type Position = {
  id: string;
  symbol: string;
  pnl?: number | null;
  pnlPercent?: number | null;
  marketValue?: number | null;
  status?: string | null;
};

type TimeRange = "7d" | "30d" | "90d" | "all";
type ReportTab = "overview" | "risk" | "coach" | "advanced";

type AiReview = {
  overview: string;
  strengths: string[];
  risks: string[];
  symbolInsights: { symbol: string; insight: string }[];
  nextFocus: string[];
  meta?: {
    generatedAt?: string;
    sampleSizes?: {
      trades?: number;
      aiDecisions?: number;
      brokerOrders?: number;
      positions?: number;
      brokerPositions?: number;
    };
  };
};

type SubscriptionState = {
  enabled: boolean;
  allowAdvancedAnalytics: boolean;
  planCode: string;
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
    : "-";
}

function formatPercent(value?: number | null) {
  const num = Number(value);
  return Number.isFinite(num) ? `${num.toFixed(1)}%` : "-";
}

function InfoHint({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <span
        aria-label="What this means"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/20 text-[10px] font-bold text-gray-400"
      >
        i
      </span>
      <span className="pointer-events-none absolute left-1/2 top-6 z-20 hidden w-52 -translate-x-1/2 rounded-lg border border-white/10 bg-[#0B1018] p-2 text-[11px] normal-case leading-4 text-gray-200 shadow-xl group-hover:block">
        {text}
      </span>
    </span>
  );
}

function StatCard({
  label,
  value,
  subtext,
  tone = "default",
  hint,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  tone?: "default" | "green" | "red" | "blue" | "amber";
  hint?: string;
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
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-400">
        <span>{label}</span>
        {hint ? <InfoHint text={hint} /> : null}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</div>
      {subtext ? <div className="mt-1 text-sm text-gray-500">{subtext}</div> : null}
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
  icon,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-gray-800 bg-[#11151c]">
      <div className="border-b border-gray-800 px-5 py-4">
        <div className="flex items-center gap-2">
          {icon ? icon : null}
          <h2 className="text-lg font-semibold text-white">{title}</h2>
        </div>
        {subtitle ? <p className="mt-1 text-sm text-gray-400">{subtitle}</p> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function LockGate({ planCode }: { planCode: string }) {
  return (
    <section className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-6">
      <h3 className="text-lg font-semibold text-amber-200">Upgrade Required</h3>
      <p className="mt-2 text-sm text-amber-100">
        This tab is available on paid plans. You are currently on {planCode || "free"}. Upgrade to unlock AI Coach and Advanced Diagnostics.
      </p>
      <p className="mt-3 text-xs text-amber-200/80">
        You can continue using Overview and Risk for free.
      </p>
    </section>
  );
}

function DiversificationDonut({
  slices,
}: {
  slices: Array<{ label: string; percent: number; color: string }>;
}) {
  let start = 0;
  const segments: string[] = [];
  for (const s of slices) {
    const end = Math.min(100, start + s.percent);
    segments.push(`${s.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`);
    start = end;
  }
  if (start < 100) {
    segments.push(`#1a2233 ${start.toFixed(2)}% 100%`);
  }

  return (
    <div className="relative h-56 w-56">
      <div
        className="h-full w-full rounded-full"
        style={{ background: `conic-gradient(${segments.join(", ")})` }}
      />
      <div className="absolute inset-[18%] rounded-full bg-[#0b0f16]" />
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="text-[11px] uppercase tracking-wide text-gray-500">Diversification</div>
        <div className="mt-1 text-2xl font-semibold text-white">{Math.min(100, slices.length * 20)}%</div>
        <div className="text-[11px] text-gray-500">by symbol spread</div>
      </div>
    </div>
  );
}

function ReportTabHowTo({
  tab,
  hasPaidAccess,
}: {
  tab: ReportTab;
  hasPaidAccess: boolean;
}) {
  const byTab: Record<ReportTab, { purpose: string; watch: string; action: string }> = {
    overview: {
      purpose: "Quick quality and outcome check for your recent decision window.",
      watch: "AI Decisions, Avg Confidence, Avg CTS, Realized P&L, and AI Interpretation narrative.",
      action: "If confidence and CTS are both soft, slow down new entries and prioritize only strongest setups.",
    },
    risk: {
      purpose: "Track concentration and open exposure before adding more risk.",
      watch: "Top symbol share, open winners vs losers, diversification score, and Risk Alerts.",
      action: "If top symbol concentration is high, rebalance exposure and avoid stacking one ticker.",
    },
    coach: {
      purpose: "Get plain-English feedback on behavior quality from Luckmi AI.",
      watch: "Strengths, Risks, Symbol Insights, and Watch Next priorities.",
      action: "Pick one coaching recommendation and follow it for one full report window before changing strategy again.",
    },
    advanced: {
      purpose: "Use deeper diagnostics to detect pattern-level drift early.",
      watch: "Symbol Scoreboard, AI Performance Coach scenarios, and Adaptive Alerts.",
      action: "Use the scenario outputs to refine thresholds, then compare against the next 7d/30d window.",
    },
  };

  const guide = byTab[tab];
  const isLocked = (tab === "coach" || tab === "advanced") && !hasPaidAccess;

  return (
    <section className="rounded-3xl border border-gray-800 bg-[#11151c]">
      <details className="group" open={tab === "overview"}>
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-gray-200">
          <div className="flex items-center justify-between">
            <span>How to read this tab</span>
            <span className="text-xs text-gray-500 transition group-open:rotate-180">⌄</span>
          </div>
        </summary>
        <div className="border-t border-gray-800 px-5 py-4 text-sm text-gray-300">
          <p>
            <span className="font-semibold text-white">Purpose:</span> {guide.purpose}
          </p>
          <p className="mt-2">
            <span className="font-semibold text-white">What to watch:</span> {guide.watch}
          </p>
          <p className="mt-2">
            <span className="font-semibold text-white">Action:</span> {guide.action}
          </p>
          {isLocked ? (
            <div className="mt-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              This tab is part of paid analytics. Unlock it to use this workflow directly in-app.
            </div>
          ) : null}
        </div>
      </details>
    </section>
  );
}

export default function ReportsPage() {
  const [aiDecisions, setAiDecisions] = useState<AiDecision[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  const [subscription, setSubscription] = useState<SubscriptionState>({
    enabled: false,
    allowAdvancedAnalytics: true,
    planCode: "test",
  });

  const [tab, setTab] = useState<ReportTab>("overview");
  const [range, setRange] = useState<TimeRange>("30d");

  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [aiReview, setAiReview] = useState<AiReview | null>(null);
  const [explainPrompt, setExplainPrompt] = useState("");
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [explainResponse, setExplainResponse] = useState<string | null>(null);
  const [advancedPrompt, setAdvancedPrompt] = useState("");
  const [advancedLoading, setAdvancedLoading] = useState(false);
  const [advancedError, setAdvancedError] = useState<string | null>(null);
  const [advancedResponse, setAdvancedResponse] = useState<string | null>(null);

  useEffect(() => {
    void loadReports();
  }, []);

  const hasPaidAccess = !subscription.enabled || subscription.allowAdvancedAnalytics;

  useEffect(() => {
    if ((tab === "coach" || tab === "advanced") && !hasPaidAccess) {
      setTab("overview");
    }
  }, [tab, hasPaidAccess]);

  async function loadReports() {
    try {
      setLoading(true);

      const [aiRes, tradesRes, portfolioRes, subscriptionRes] = await Promise.allSettled([
        fetch("/api/ai-decisions?limit=500", { cache: "no-store" }),
        fetch("/api/trades?limit=500", { cache: "no-store" }),
        fetch("/api/portfolio/auto", { cache: "no-store" }),
        fetch("/api/subscription/me", { cache: "no-store" }),
      ]);

      if (aiRes.status === "fulfilled" && aiRes.value.ok) {
        const data = await aiRes.value.json();
        setAiDecisions(Array.isArray(data) ? data : data?.decisions || []);
      }

      if (tradesRes.status === "fulfilled" && tradesRes.value.ok) {
        const data = await tradesRes.value.json();
        setTrades(Array.isArray(data) ? data : data?.trades || []);
      }

      if (portfolioRes.status === "fulfilled" && portfolioRes.value.ok) {
        const data = await portfolioRes.value.json();
        setPositions(Array.isArray(data?.positions) ? data.positions : []);
      }

      if (subscriptionRes.status === "fulfilled" && subscriptionRes.value.ok) {
        const data = await subscriptionRes.value.json();
        const enabled =
          data?.subscription_enabled === true ||
          data?.enforced === true;

        setSubscription({
          enabled,
          allowAdvancedAnalytics: Boolean(data?.allowAdvancedAnalytics),
          planCode: String(data?.planCode || "free"),
        });
      }
    } catch (err) {
      console.error("Failed to load reports", err);
    } finally {
      setLoading(false);
    }
  }

  async function generateAiReview() {
    try {
      setReviewLoading(true);
      setReviewError(null);
      setExplainResponse(null);
      setExplainError(null);

      const res = await fetch("/api/reports/ai-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to generate AI review");
      }

      setAiReview(data);
    } catch (err: any) {
      setReviewError(err?.message || "Failed to generate AI review");
    } finally {
      setReviewLoading(false);
    }
  }

  async function askLuckmiToExplain() {
    if (!aiReview) return;

    const question =
      explainPrompt.trim() ||
      "Explain the most important risk in simple terms and what I should change first.";

    try {
      setExplainLoading(true);
      setExplainError(null);

      const prompt = `You are Luckmi AI Trading Assistant.
You are explaining an existing trading review, not giving fresh trade signals.
Do not provide financial advice and do not promise profits.
Use plain English and keep it concise.

User question: ${question}

Current review context:
${JSON.stringify(
  {
    overview: aiReview.overview,
    strengths: aiReview.strengths,
    risks: aiReview.risks,
    symbolInsights: aiReview.symbolInsights,
    nextFocus: aiReview.nextFocus,
  },
  null,
  2
)}

Answer in 4-8 sentences with:
1) direct answer,
2) what it means,
3) what user should focus on next.
`;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to get explanation");
      }

      setExplainResponse(String(data?.content || "No explanation available."));
    } catch (err: any) {
      setExplainError(err?.message || "Failed to get explanation");
    } finally {
      setExplainLoading(false);
    }
  }

  async function askLuckmiAdvanced() {
    const question =
      advancedPrompt.trim() ||
      "Give a quantitative diagnostics read: where performance drift is happening, what threshold to tune first, and what to test next 7 days.";

    try {
      setAdvancedLoading(true);
      setAdvancedError(null);

      const prompt = `You are Luckmi AI Advanced Diagnostics Assistant.
You are analyzing existing report metrics only.
Do not provide financial advice. Do not promise outcomes.
Focus on diagnostics, drift detection, and parameter tuning logic.

User request: ${question}

Advanced context:
${JSON.stringify(
  {
    range,
    metrics: {
      totalDecisions: metrics.totalDecisions,
      avgConfidence: metrics.avgConfidence,
      avgCts: metrics.avgCts,
      winRate: metrics.winRate,
      realizedPnL: metrics.realizedPnL,
      highConfidenceSellWinRate: metrics.highConfidenceSellWinRate,
      strictFilterPnL: metrics.strictFilterPnL,
      openPositionsCount: metrics.openPositionsCount,
      openUnrealized: metrics.openUnrealized,
      openWinners: metrics.openWinners,
      openLosers: metrics.openLosers,
      buys: metrics.buys,
      holds: metrics.holds,
      sells: metrics.sells,
      sellTradesCount: metrics.sellTradesCount,
    },
    diversification: {
      score: diversification.score,
      status: diversification.status,
      topSymbol: diversification.topSymbol,
      topPercent: diversification.topPercent,
    },
    symbolScoreboard: metrics.symbolScoreboard,
  },
  null,
  2
)}

Return exactly these sections in plain text:
1) DIAGNOSTIC SUMMARY (3-5 sentences)
2) ROOT CAUSES (3 concise bullets)
3) PARAMETER TUNING PLAN (3 concise bullets)
4) NEXT 7-DAY TEST PLAN (3 concise bullets)
5) RISK GUARDRAILS (3 concise bullets)

Keep it practical and data-driven.`;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to get advanced diagnostics");
      }

      setAdvancedResponse(String(data?.content || "No diagnostics available."));
    } catch (err: any) {
      setAdvancedError(err?.message || "Failed to get advanced diagnostics");
    } finally {
      setAdvancedLoading(false);
    }
  }

  const filteredDecisions = useMemo(() => {
    if (range === "all") return aiDecisions;
    const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return aiDecisions.filter((d) => {
      const ts = new Date(String(d.created_at || "")).getTime();
      return Number.isFinite(ts) && ts >= cutoff;
    });
  }, [aiDecisions, range]);

  const filteredTrades = useMemo(() => {
    if (range === "all") return trades;
    const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return trades.filter((t) => {
      const ts = new Date(String(t.created_at || "")).getTime();
      return Number.isFinite(ts) && ts >= cutoff;
    });
  }, [range, trades]);

  const metrics = useMemo(() => {
    const totalDecisions = filteredDecisions.length;
    const buys = filteredDecisions.filter((d) => d.action?.toLowerCase().includes("buy")).length;
    const holds = filteredDecisions.filter((d) => d.action?.toLowerCase().includes("hold")).length;
    const sells = filteredDecisions.filter((d) => d.action?.toLowerCase().includes("sell")).length;

    const avgConfidence =
      totalDecisions > 0
        ? filteredDecisions.reduce((sum, d) => sum + toNumber(d.confidence), 0) / totalDecisions
        : 0;

    const decisionsWithCts = filteredDecisions.filter(
      (d) => d.cts_score !== null && d.cts_score !== undefined
    );
    const avgCts =
      decisionsWithCts.length > 0
        ? decisionsWithCts.reduce((sum, d) => sum + toNumber(d.cts_score), 0) /
          decisionsWithCts.length
        : 0;

    const sellTrades = filteredTrades.filter((t) => t.type?.toLowerCase().includes("sell"));
    const buyTrades = filteredTrades.filter((t) => t.type?.toLowerCase().includes("buy"));
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

    const symbolCounts = filteredDecisions.reduce<Record<string, number>>((acc, d) => {
      const symbol = String(d.symbol || "").toUpperCase();
      if (!symbol) return acc;
      acc[symbol] = (acc[symbol] || 0) + 1;
      return acc;
    }, {});

    const topSymbols = Object.entries(symbolCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const symbolStats = filteredTrades.reduce<
      Record<string, { sells: number; realized: number; wins: number; losses: number }>
    >((acc, t) => {
      const symbol = String(t.symbol || "").toUpperCase();
      if (!symbol) return acc;
      if (!acc[symbol]) {
        acc[symbol] = { sells: 0, realized: 0, wins: 0, losses: 0 };
      }
      if (String(t.type || "").toLowerCase().includes("sell")) {
        acc[symbol].sells += 1;
        acc[symbol].realized += toNumber(t.pnl);
        if (toNumber(t.pnl) > 0) acc[symbol].wins += 1;
        if (toNumber(t.pnl) < 0) acc[symbol].losses += 1;
      }
      return acc;
    }, {});

    const symbolScoreboard = Object.entries(symbolStats)
      .map(([symbol, stat]) => ({
        symbol,
        sells: stat.sells,
        realized: stat.realized,
        winRate: stat.sells > 0 ? (stat.wins / stat.sells) * 100 : 0,
      }))
      .sort((a, b) => b.realized - a.realized)
      .slice(0, 8);

    const openUnrealized = positions.reduce((sum, p) => sum + toNumber(p.pnl), 0);
    const openWinners = positions.filter((p) => toNumber(p.pnl) > 0).length;
    const openLosers = positions.filter((p) => toNumber(p.pnl) < 0).length;

    const highConfidenceSellCount = sellTrades.filter((t) => toNumber(t.confidence) >= 70).length;
    const highConfidenceSellWinRate =
      highConfidenceSellCount > 0
        ? (sellTrades.filter((t) => toNumber(t.confidence) >= 70 && toNumber(t.pnl) > 0).length /
            highConfidenceSellCount) *
          100
        : 0;

    const strictFilterSellTrades = sellTrades.filter((t) => toNumber(t.confidence) >= 60);
    const strictFilterPnL = strictFilterSellTrades.reduce((sum, t) => sum + toNumber(t.pnl), 0);

    return {
      totalDecisions,
      buys,
      holds,
      sells,
      buyTradesCount: buyTrades.length,
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
      symbolScoreboard,
      openUnrealized,
      openWinners,
      openLosers,
      openPositionsCount: positions.length,
      highConfidenceSellWinRate,
      strictFilterPnL,
    };
  }, [filteredDecisions, filteredTrades, positions]);

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

  const userActions = useMemo(() => {
    const actions: string[] = [];

    if (metrics.avgConfidence < 60) {
      actions.push("Keep position size smaller until average confidence improves.");
    }
    if (metrics.openLosers > metrics.openWinners) {
      actions.push("Open positions are skewing negative. Review weakest symbols before adding new exposure.");
    }
    if (metrics.winRate < 50 && metrics.sellTradesCount >= 5) {
      actions.push("Recent win rate is below 50%. Tighten entries and avoid marginal setups.");
    }

    if (actions.length === 0) {
      actions.push("Current behavior is stable. Keep risk steady and monitor confidence drift.");
    }

    return actions.slice(0, 3);
  }, [metrics]);

  const diversification = useMemo(() => {
    const bySymbol = new Map<string, number>();

    for (const p of positions) {
      const symbol = String(p.symbol || "").toUpperCase();
      if (!symbol) continue;

      const marketValue = toNumber(p.marketValue);
      const fallbackWeight = Math.max(1, Math.abs(toNumber(p.pnl)));
      const weight = marketValue > 0 ? marketValue : fallbackWeight;

      bySymbol.set(symbol, toNumber(bySymbol.get(symbol)) + weight);
    }

    const rows = [...bySymbol.entries()]
      .map(([symbol, value]) => ({ symbol, value }))
      .sort((a, b) => b.value - a.value);

    const total = rows.reduce((sum, r) => sum + r.value, 0);
    if (total <= 0 || rows.length === 0) {
      return {
        slices: [] as Array<{ label: string; percent: number; color: string; value: number }>,
        score: 0,
        status: "No data",
        topSymbol: null as string | null,
        topPercent: 0,
        message: "Not enough position data to calculate diversification yet.",
      };
    }

    const palette = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
    const top = rows.slice(0, 4);
    const rest = rows.slice(4);

    const baseSlices = top.map((r, idx) => ({
      label: r.symbol,
      value: r.value,
      percent: (r.value / total) * 100,
      color: palette[idx % palette.length],
    }));

    if (rest.length > 0) {
      const otherValue = rest.reduce((sum, r) => sum + r.value, 0);
      baseSlices.push({
        label: "Other",
        value: otherValue,
        percent: (otherValue / total) * 100,
        color: "#6b7280",
      });
    }

    const hhi = rows.reduce((sum, r) => {
      const w = r.value / total;
      return sum + w * w;
    }, 0);
    const effectiveHoldings = hhi > 0 ? 1 / hhi : 0;
    const maxEffective = Math.max(1, Math.min(rows.length, 8));
    const score = Math.max(0, Math.min(100, (effectiveHoldings / maxEffective) * 100));

    const status = score >= 70 ? "Balanced" : score >= 45 ? "Moderate" : "Concentrated";
    const topSymbol = rows[0]?.symbol || null;
    const topPercent = rows[0] ? (rows[0].value / total) * 100 : 0;

    const message =
      status === "Balanced"
        ? "Exposure looks spread across symbols. Keep monitoring concentration drift as new entries are added."
        : status === "Moderate"
        ? `Exposure is moderately concentrated in ${topSymbol} (${topPercent.toFixed(0)}%). Add diversification gradually.`
        : `Portfolio is concentrated in ${topSymbol} (${topPercent.toFixed(0)}%). Consider reducing single-symbol dependency.`;

    return {
      slices: baseSlices,
      score,
      status,
      topSymbol,
      topPercent,
      message,
    };
  }, [positions]);

  const tabConfig: Array<{ key: ReportTab; label: string; free: boolean }> = [
    { key: "overview", label: "Overview", free: true },
    { key: "risk", label: "Risk", free: true },
    { key: "coach", label: "AI Coach", free: false },
    { key: "advanced", label: "Advanced", free: false },
  ];

  return (
    <div className="min-h-screen bg-[#0b0f16] text-white">
      <TopNav activePage="reports" />

      <div className="p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold sm:text-3xl">Reports</h1>
              <p className="mt-2 max-w-2xl text-sm text-gray-400">
                Segmented reporting for quick outcomes, risk visibility, and premium coaching diagnostics.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(["7d", "30d", "90d", "all"] as TimeRange[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setRange(item)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    range === item
                      ? "border-blue-500/40 bg-blue-500/15 text-blue-300"
                      : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"
                  }`}
                >
                  {item.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <section className="rounded-3xl border border-gray-800 bg-[#11151c] p-3">
            <div className="flex flex-wrap items-center gap-2">
              {tabConfig.map((item) => {
                const locked = !item.free && !hasPaidAccess;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      if (!locked) setTab(item.key);
                    }}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                      tab === item.key
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                        : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"
                    } ${locked ? "opacity-60" : ""}`}
                  >
                    {item.label}
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-gray-500">
                      {item.free ? "Free" : locked ? "Locked" : "Pro"}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <ReportTabHowTo tab={tab} hasPaidAccess={hasPaidAccess} />

          {loading ? (
            <div className="rounded-3xl border border-gray-800 bg-[#11151c] p-6 text-sm text-gray-400">
              Loading reports...
            </div>
          ) : null}

          {!loading && tab === "overview" ? (
            <>
              {/* Luckmi AI Pulse — always visible at the forefront */}
              <div className="flex flex-wrap items-center gap-4 rounded-3xl border border-[#F5C76E]/25 bg-gradient-to-r from-[#F5C76E]/[0.07] via-[#11151c] to-[#11151c] px-5 py-4">
                <LuckmiAiIcon size={32} />
                <div className="flex-1 min-w-0">
                  <div className="mb-2 text-[10px] uppercase tracking-widest text-[#F5C76E]/60">Luckmi AI Pulse</div>
                  <div className="flex flex-wrap gap-x-8 gap-y-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-semibold text-white">{metrics.totalDecisions}</span>
                      <span className="text-sm text-gray-400">decisions · <span className="text-emerald-400">{metrics.buys}B</span> <span className="text-amber-400">{metrics.holds}H</span> <span className="text-red-400">{metrics.sells}S</span></span>
                    </div>
                    <div className="flex items-baseline gap-2 border-l border-white/10 pl-6">
                      <span className={`text-2xl font-semibold ${metrics.avgConfidence >= 70 ? "text-emerald-300" : "text-amber-300"}`}>{formatPercent(metrics.avgConfidence)}</span>
                      <span className="text-sm text-gray-400">avg confidence</span>
                    </div>
                    <div className="flex items-baseline gap-2 border-l border-white/10 pl-6">
                      <span className={`text-2xl font-semibold ${metrics.avgCts >= 70 ? "text-emerald-300" : "text-amber-300"}`}>{metrics.avgCts.toFixed(0)}</span>
                      <span className="text-sm text-gray-400">avg CTS</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="AI Decisions"
                  value={metrics.totalDecisions}
                  subtext={`${metrics.buys} buys · ${metrics.holds} holds · ${metrics.sells} sells`}
                  tone="blue"
                  hint="Count of AI calls in the selected timeframe."
                />
                <StatCard
                  label="Avg Confidence"
                  value={formatPercent(metrics.avgConfidence)}
                  subtext="How strongly AI felt about recent calls"
                  tone={metrics.avgConfidence >= 70 ? "green" : "amber"}
                  hint="Average confidence for AI decisions."
                />
                <StatCard
                  label="Avg Luckmi Score"
                  value={metrics.avgCts.toFixed(0)}
                  subtext="Average CTS from recent decisions"
                  tone={metrics.avgCts >= 70 ? "green" : "amber"}
                  hint="Composite trend score quality."
                />
                <StatCard
                  label="Realized P&L"
                  value={formatMoney(metrics.realizedPnL)}
                  subtext={`${metrics.sellTradesCount} closed sell trades`}
                  tone={metrics.realizedPnL >= 0 ? "green" : "red"}
                  hint="Profit or loss from closed trades only."
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="Open Risk"
                  value={formatMoney(metrics.openUnrealized)}
                  subtext={`${metrics.openPositionsCount} open positions now`}
                  tone={metrics.openUnrealized >= 0 ? "green" : "red"}
                  hint="Unrealized P&L across open positions."
                />
                <StatCard
                  label="Open Winners"
                  value={metrics.openWinners}
                  subtext={`${metrics.openLosers} open losers`}
                  tone="green"
                  hint="How many open positions are currently positive vs negative."
                />
                <StatCard
                  label="Buy Trades"
                  value={metrics.buyTradesCount}
                  subtext="Recorded entries in selected range"
                  tone="blue"
                  hint="Number of entry trades placed."
                />
                <StatCard
                  label="High-Conf Sell Win Rate"
                  value={formatPercent(metrics.highConfidenceSellWinRate)}
                  subtext="Sells with confidence >= 70"
                  tone={metrics.highConfidenceSellWinRate >= 55 ? "green" : "amber"}
                  hint="Win rate for high-confidence exits."
                />
              </div>

              <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
                <Section title="AI Interpretation" subtitle="A plain-English read of recent AI behavior." icon={<LuckmiAiIcon size={20} />}>
                  <div className="rounded-2xl bg-[#1a1f2e] p-4 text-sm leading-6 text-gray-300">
                    {aiNarrative}
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-[#1a1f2e] p-4">
                      <div className="text-xs text-gray-400">Buy Bias</div>
                      <div className="mt-1 text-xl font-semibold text-emerald-300">{metrics.buys}</div>
                    </div>
                    <div className="rounded-2xl bg-[#1a1f2e] p-4">
                      <div className="text-xs text-gray-400">Wait / Hold</div>
                      <div className="mt-1 text-xl font-semibold text-amber-300">{metrics.holds}</div>
                    </div>
                    <div className="rounded-2xl bg-[#1a1f2e] p-4">
                      <div className="text-xs text-gray-400">Sell / Avoid</div>
                      <div className="mt-1 text-xl font-semibold text-red-300">{metrics.sells}</div>
                    </div>
                  </div>
                </Section>

                <Section title="Performance Snapshot" subtitle="Early feedback from recorded sell trades.">
                  <div className="grid gap-3">
                    <div className="rounded-2xl bg-[#1a1f2e] p-4">
                      <div className="text-xs text-gray-400">Win Rate</div>
                      <div className="mt-1 text-2xl font-semibold text-white">{formatPercent(metrics.winRate)}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        {metrics.wins} wins · {metrics.losses} losses
                      </div>
                    </div>

                    <div className="rounded-2xl bg-[#1a1f2e] p-4">
                      <div className="text-xs text-gray-400">Best Trade</div>
                      <div className="mt-1 text-sm font-medium text-emerald-300">
                        {metrics.bestTrade
                          ? `${metrics.bestTrade.symbol} ${formatMoney(toNumber(metrics.bestTrade.pnl))}`
                          : "-"}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-[#1a1f2e] p-4">
                      <div className="text-xs text-gray-400">Worst Trade</div>
                      <div className="mt-1 text-sm font-medium text-red-300">
                        {metrics.worstTrade
                          ? `${metrics.worstTrade.symbol} ${formatMoney(toNumber(metrics.worstTrade.pnl))}`
                          : "-"}
                      </div>
                    </div>
                  </div>
                </Section>
              </div>

              <Section title="Next Actions" subtitle="What to do now based on your latest report window.">
                <div className="space-y-3">
                  {userActions.map((action, idx) => (
                    <div
                      key={`${action}-${idx}`}
                      className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-blue-100"
                    >
                      {action}
                    </div>
                  ))}
                </div>
              </Section>
            </>
          ) : null}

          {!loading && tab === "risk" ? (
            <>
              {/* Luckmi AI Pulse — Risk view */}
              <div className="flex flex-wrap items-center gap-4 rounded-3xl border border-[#F5C76E]/25 bg-gradient-to-r from-[#F5C76E]/[0.07] via-[#11151c] to-[#11151c] px-5 py-4">
                <LuckmiAiIcon size={32} />
                <div className="flex-1 min-w-0">
                  <div className="mb-2 text-[10px] uppercase tracking-widest text-[#F5C76E]/60">Luckmi AI Risk Pulse</div>
                  <div className="flex flex-wrap gap-x-8 gap-y-2">
                    <div className="flex items-baseline gap-2">
                      <span className={`text-2xl font-semibold ${metrics.openUnrealized >= 0 ? "text-emerald-300" : "text-red-300"}`}>{formatMoney(metrics.openUnrealized)}</span>
                      <span className="text-sm text-gray-400">open exposure</span>
                    </div>
                    <div className="flex items-baseline gap-2 border-l border-white/10 pl-6">
                      <span className="text-2xl font-semibold text-white">{metrics.openPositionsCount}</span>
                      <span className="text-sm text-gray-400">positions · <span className="text-emerald-400">{metrics.openWinners}W</span> <span className="text-red-400">{metrics.openLosers}L</span></span>
                    </div>
                    <div className="flex items-baseline gap-2 border-l border-white/10 pl-6">
                      <span className={`text-2xl font-semibold ${diversification.topPercent < 35 ? "text-emerald-300" : "text-amber-300"}`}>{diversification.topPercent.toFixed(0)}%</span>
                      <span className="text-sm text-gray-400">top symbol share</span>
                    </div>
                  </div>
                </div>
              </div>

              <Section
                title="Diversification & Exposure"
                subtitle="Symbol concentration view to keep single-stock risk under control."
              >
                {diversification.slices.length === 0 ? (
                  <div className="rounded-2xl bg-[#1a1f2e] p-4 text-sm text-gray-400">
                    Not enough open position data for diversification analysis yet.
                  </div>
                ) : (
                  <div className="grid gap-6 lg:grid-cols-[auto_1fr] lg:items-center">
                    <div className="mx-auto">
                      <DiversificationDonut
                        slices={diversification.slices.map((s) => ({
                          label: s.label,
                          percent: s.percent,
                          color: s.color,
                        }))}
                      />
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-2xl bg-[#1a1f2e] p-4">
                        <div className="text-xs uppercase tracking-wide text-gray-400">Diversification Score</div>
                        <div className="mt-1 text-2xl font-semibold text-white">
                          {diversification.score.toFixed(0)}
                          <span className="ml-2 text-sm font-normal text-gray-400">{diversification.status}</span>
                        </div>
                        <p className="mt-2 text-sm text-gray-300">{diversification.message}</p>
                      </div>

                      <div className="rounded-2xl bg-[#1a1f2e] p-4">
                        <div className="text-xs uppercase tracking-wide text-gray-400">Allocation by Symbol</div>
                        <div className="mt-3 space-y-2">
                          {diversification.slices.map((row) => (
                            <div key={row.label} className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <span
                                  className="inline-block h-2.5 w-2.5 rounded-full"
                                  style={{ backgroundColor: row.color }}
                                />
                                <span className="text-white">{row.label}</span>
                              </div>
                              <span className="text-gray-300">{row.percent.toFixed(1)}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </Section>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="Open Positions"
                  value={metrics.openPositionsCount}
                  subtext="Current active positions"
                  tone="blue"
                />
                <StatCard
                  label="Open Unrealized"
                  value={formatMoney(metrics.openUnrealized)}
                  subtext="Mark-to-market exposure"
                  tone={metrics.openUnrealized >= 0 ? "green" : "red"}
                />
                <StatCard
                  label="Top Symbol Share"
                  value={`${diversification.topPercent.toFixed(1)}%`}
                  subtext={diversification.topSymbol ? `${diversification.topSymbol} concentration` : "No symbol concentration"}
                  tone={diversification.topPercent >= 35 ? "amber" : "green"}
                />
                <StatCard
                  label="Open Winners Ratio"
                  value={
                    metrics.openPositionsCount > 0
                      ? `${((metrics.openWinners / metrics.openPositionsCount) * 100).toFixed(1)}%`
                      : "-"
                  }
                  subtext={`${metrics.openWinners} winners / ${metrics.openLosers} losers`}
                  tone={metrics.openWinners >= metrics.openLosers ? "green" : "amber"}
                />
              </div>

              <Section title="Risk Alerts" subtitle="Actionable portfolio risk checks." icon={<LuckmiAiIcon size={20} />}>
                <div className="space-y-3 text-sm text-gray-300">
                  {diversification.topPercent >= 40 ? (
                    <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
                      Alert: single-symbol concentration is above 40%. Consider reducing dependency on one ticker.
                    </div>
                  ) : null}
                  {metrics.openLosers > metrics.openWinners ? (
                    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                      Alert: open losers currently outnumber winners. Tighten risk before adding new entries.
                    </div>
                  ) : null}
                  {metrics.openPositionsCount === 0 ? (
                    <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4">
                      No open exposure currently. Diversification and concentration alerts activate once positions open.
                    </div>
                  ) : null}
                  {diversification.topPercent < 40 && metrics.openLosers <= metrics.openWinners && metrics.openPositionsCount > 0 ? (
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                      Risk posture looks controlled in this window. Continue monitoring concentration drift.
                    </div>
                  ) : null}
                </div>
              </Section>
            </>
          ) : null}

          {!loading && tab === "coach" ? (
            hasPaidAccess ? (
              <section className="rounded-3xl border border-[#F5C76E]/25 bg-gradient-to-b from-[#F5C76E]/[0.08] to-[#11151c]">
                <div className="flex flex-col gap-4 border-b border-[#F5C76E]/20 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-3">
                    <LuckmiAiIcon size={30} />
                    <div>
                      <h2 className="text-lg font-semibold text-white">Luckmi AI Trading Review</h2>
                      <p className="mt-1 text-sm text-gray-300">
                        Coaching insights for behavior quality, strengths, risks, and next focus.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void generateAiReview()}
                      disabled={reviewLoading}
                      className="rounded-2xl border border-[#F5C76E]/30 bg-[#F5C76E]/15 px-4 py-2 text-sm font-medium text-[#F5C76E] transition hover:bg-[#F5C76E]/25 disabled:opacity-50"
                    >
                      {reviewLoading ? "Generating..." : aiReview ? "Refresh" : "Generate Review"}
                    </button>
                  </div>
                </div>

                <div className="space-y-4 px-5 py-5">
                  {reviewError ? (
                    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                      {reviewError}
                    </div>
                  ) : null}

                  {!aiReview ? (
                    <div className="rounded-2xl border border-dashed border-white/15 bg-[#0E1420] p-5 text-sm text-gray-300">
                      Generate your AI Trading Review to get a coaching-style summary of your recent trades and behavior.
                    </div>
                  ) : (
                    <>
                      <div className="rounded-2xl bg-[#0E1420] p-4 text-sm leading-6 text-gray-200">{aiReview.overview}</div>

                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                          <h3 className="text-sm font-semibold text-emerald-200">Strengths</h3>
                          <div className="mt-3 space-y-2 text-sm text-emerald-100">
                            {(aiReview.strengths || []).map((item, idx) => (
                              <div key={`${item}-${idx}`}>- {item}</div>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
                          <h3 className="text-sm font-semibold text-red-200">Risks</h3>
                          <div className="mt-3 space-y-2 text-sm text-red-100">
                            {(aiReview.risks || []).map((item, idx) => (
                              <div key={`${item}-${idx}`}>- {item}</div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl bg-[#0E1420] p-4">
                        <h3 className="text-sm font-semibold text-white">Symbol Insights</h3>
                        <div className="mt-3 space-y-2">
                          {(aiReview.symbolInsights || []).length === 0 ? (
                            <div className="text-sm text-gray-400">No symbol-level insights yet.</div>
                          ) : (
                            (aiReview.symbolInsights || []).map((row) => (
                              <div
                                key={`${row.symbol}-${row.insight}`}
                                className="rounded-xl bg-white/5 p-3 text-sm text-gray-200"
                              >
                                <span className="font-semibold text-white">{row.symbol}</span>: {row.insight}
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4">
                        <h3 className="text-sm font-semibold text-blue-200">Watch Next</h3>
                        <div className="mt-3 space-y-2 text-sm text-blue-100">
                          {(aiReview.nextFocus || []).map((item, idx) => (
                            <div key={`${item}-${idx}`}>- {item}</div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-[#0A101A] p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <h3 className="text-sm font-semibold text-white">Ask Luckmi to explain this</h3>
                            <p className="mt-1 text-xs text-gray-400">
                              Ask a follow-up about risks, symbols, or what to change next.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void askLuckmiToExplain()}
                            disabled={explainLoading}
                            className="rounded-2xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-300 transition hover:bg-blue-500/20 disabled:opacity-50"
                          >
                            {explainLoading ? "Explaining..." : "Ask Luckmi to explain this"}
                          </button>
                        </div>

                        <textarea
                          value={explainPrompt}
                          onChange={(event) => setExplainPrompt(event.target.value)}
                          placeholder="Example: Why is TSLA listed as a risk and what behavior should I change first?"
                          className="mt-3 w-full rounded-xl border border-white/10 bg-[#0E1420] px-3 py-2 text-sm text-gray-200 outline-none transition focus:border-blue-500/40"
                          rows={3}
                        />

                        <div className="mt-2 flex flex-wrap gap-2">
                          {[
                            "Explain my biggest risk",
                            "Why is my worst symbol underperforming?",
                            "What should I change next week?",
                            "How can I improve my win rate?",
                          ].map((chip) => (
                            <button
                              key={chip}
                              type="button"
                              onClick={() => setExplainPrompt(chip)}
                              className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs text-blue-300 transition hover:bg-blue-500/25 hover:border-blue-500/40"
                            >
                              {chip}
                            </button>
                          ))}
                        </div>

                        {explainError ? (
                          <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                            {explainError}
                          </div>
                        ) : null}

                        {explainResponse ? (
                          <div className="mt-3 rounded-xl border border-blue-500/25 bg-blue-500/10 p-3 text-sm leading-6 text-blue-100 whitespace-pre-wrap">
                            {explainResponse}
                          </div>
                        ) : null}
                      </div>

                      <div className="text-xs text-gray-500">
                        Generated: {aiReview.meta?.generatedAt ? new Date(aiReview.meta.generatedAt).toLocaleString() : "-"}
                      </div>
                    </>
                  )}
                </div>
              </section>
            ) : (
              <LockGate planCode={subscription.planCode} />
            )
          ) : null}

          {!loading && tab === "advanced" ? (
            hasPaidAccess ? (
              <>
                <Section
                  title="Luckmi Advanced Lab"
                  subtitle="Interactive diagnostics for drift detection, threshold tuning, and test planning."
                  icon={<LuckmiAiIcon size={20} />}
                >
                  <div className="rounded-2xl border border-[#F5C76E]/20 bg-[#F5C76E]/10 p-4 text-sm text-[#F5C76E]">
                    This interaction is different from AI Coach. Coach focuses on behavior guidance. Advanced Lab focuses on quantitative diagnostics, parameter tuning, and test plans.
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-[#0A101A] p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-white">Ask Luckmi Advanced</h3>
                        <p className="mt-1 text-xs text-gray-400">
                          Request root-cause analysis, threshold tuning ideas, and experiment design from your current report data.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void askLuckmiAdvanced()}
                        disabled={advancedLoading}
                        className="rounded-2xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-300 transition hover:bg-blue-500/20 disabled:opacity-50"
                      >
                        {advancedLoading ? "Running diagnostics..." : "Run Advanced Diagnostics"}
                      </button>
                    </div>

                    <textarea
                      value={advancedPrompt}
                      onChange={(event) => setAdvancedPrompt(event.target.value)}
                      placeholder="Example: Which metric drift matters most right now, and what exact threshold should I adjust first?"
                      className="mt-3 w-full rounded-xl border border-white/10 bg-[#0E1420] px-3 py-2 text-sm text-gray-200 outline-none transition focus:border-blue-500/40"
                      rows={3}
                    />

                    <div className="mt-2 flex flex-wrap gap-2">
                      {[
                        "Find the biggest performance drift driver",
                        "Recommend one threshold change with rationale",
                        "Design a 7-day A/B test for exits",
                        "Show risk guardrails for concentration and confidence",
                      ].map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => setAdvancedPrompt(chip)}
                          className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs text-blue-300 transition hover:border-blue-500/40 hover:bg-blue-500/25"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>

                    {advancedError ? (
                      <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                        {advancedError}
                      </div>
                    ) : null}

                    {advancedResponse ? (
                      <div className="mt-3 rounded-xl border border-blue-500/25 bg-blue-500/10 p-3 text-sm leading-6 text-blue-100 whitespace-pre-wrap">
                        {advancedResponse}
                      </div>
                    ) : null}
                  </div>
                </Section>

                <div className="grid gap-6 xl:grid-cols-2">
                  <Section
                    title="Symbol Scoreboard"
                    subtitle="Where outcomes are strongest or weakest by symbol."
                  >
                    {metrics.symbolScoreboard.length === 0 ? (
                      <div className="text-sm text-gray-400">No symbol performance yet.</div>
                    ) : (
                      <div className="space-y-3">
                        {metrics.symbolScoreboard.map((row) => (
                          <div key={row.symbol} className="grid grid-cols-4 gap-3 rounded-2xl bg-[#1a1f2e] p-4 text-sm">
                            <div>
                              <div className="text-[11px] text-gray-500">Symbol</div>
                              <div className="font-semibold text-white">{row.symbol}</div>
                            </div>
                            <div>
                              <div className="text-[11px] text-gray-500">Sells</div>
                              <div className="font-semibold text-white">{row.sells}</div>
                            </div>
                            <div>
                              <div className="text-[11px] text-gray-500">Win Rate</div>
                              <div className="font-semibold text-white">{formatPercent(row.winRate)}</div>
                            </div>
                            <div>
                              <div className="text-[11px] text-gray-500">Realized</div>
                              <div className={`font-semibold ${row.realized >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                                {formatMoney(row.realized)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Section>

                  <Section title="AI Performance Coach" subtitle="What-if analysis to fine tune behavior." icon={<LuckmiAiIcon size={20} />}>
                    <div className="space-y-3">
                      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                        Scenario: keep only sells with confidence {">"}= 60. Simulated realized P&L would be {formatMoney(metrics.strictFilterPnL)}.
                      </div>
                      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">
                        If high-confidence sell win rate stays above 60%, consider raising default exit quality thresholds.
                      </div>
                      <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-blue-100">
                        Weekly brief trigger: confidence trend + symbol concentration + open-risk skew.
                      </div>
                    </div>
                  </Section>
                </div>

                <Section title="Adaptive Alerts" subtitle="Future-facing controls that surface behavior drift early.">
                  <div className="space-y-3 text-sm text-gray-300">
                    <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
                      Alert: hold-heavy drift when hold/sell ratio remains elevated for 2+ windows.
                    </div>
                    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                      Alert: symbol risk concentration when top loss symbol exceeds threshold contribution.
                    </div>
                    <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4">
                      Alert: confidence deterioration when avg confidence drops by more than 8 points window-over-window.
                    </div>
                  </div>
                </Section>
              </>
            ) : (
              <LockGate planCode={subscription.planCode} />
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
