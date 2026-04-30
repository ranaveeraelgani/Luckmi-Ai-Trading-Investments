"use client";

import { useEffect, useMemo, useState } from "react";
import TopNav from "@/components/TopNav";
import LuckmiAiIcon from "@/components/brand/LuckmiAiIcon";

// ─── Types ───────────────────────────────────────────────────────────────────

type UserRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  plan_code: string | null;
  open_positions: number;
  unrealized_pnl: number;
  realized_pnl: number;
  net_pnl: number;
  ai_decisions_total: number;
  ai_buy: number;
  ai_hold: number;
  ai_sell: number;
  ai_avg_confidence: number | null;
  ai_avg_cts: number | null;
  engine_runs_total: number;
  engine_success_rate: number | null;
  last_run_at: string | null;
};

type CtsBucketItem = {
  label: string;
  count: number;
  avgPnl: number;
  winRate: number;
};

type OverviewPayload = {
  generated_at: string;
  applied_range?: string;
  summary: {
    total_users: number;
    users_with_positions: number;
    users_in_profit: number;
    users_in_loss: number;
    total_open_positions: number;
    total_unrealized_pnl: number;
    total_realized_pnl: number;
    total_ai_decisions: number;
    buy_decisions: number;
    hold_decisions: number;
    sell_decisions: number;
    avg_ai_confidence: number;
    avg_cts: number;
    engine_success_rate: number;
    engine_failed_runs: number;
    engine_blocked_runs: number;
  };
  users: UserRow[];
  diagnostics: {
    top_loss_symbols: Array<{ symbol: string; pnl: number }>;
    low_confidence_sell_decisions: number;
    decisions_last_7d: number;
    hold_to_sell_ratio: number | null;
    top_plans_by_users?: Array<{ plan_code: string; users_count: number }>;
    users_by_position_bucket?: {
      no_positions: number;
      one_to_three: number;
      four_plus: number;
    };
    symbol_concentration?: Array<{
      symbol: string;
      count: number;
      pct: number;
      pnl: number;
    }>;
    cts_buckets?: {
      high: CtsBucketItem;
      upper: CtsBucketItem;
      mid: CtsBucketItem;
      low: CtsBucketItem;
    };
    execution_funnel?: {
      placed: number;
      filled: number;
      rejected: number;
      cancelled: number;
      pending: number;
    };
  };
};

type AdminTab = "executive" | "risk" | "execution" | "strategy" | "users";
type TimeRange = "7d" | "30d" | "90d" | "all";
type UserSort = "net_pnl" | "unrealized_pnl" | "open_positions" | "engine_success";

type SystemReview = {
  overview: string;
  keyInsights: string[];
  risks: string[];
  edgeAnalysis: string[];
  executionHealth: string[];
  userBehaviorInsights: string[];
  recommendations: string[];
  meta?: { generatedAt?: string; sampleSizes?: Record<string, number> };
  ctsBuckets?: {
    high: CtsBucketItem;
    upper: CtsBucketItem;
    mid: CtsBucketItem;
    low: CtsBucketItem;
  };
  top5Symbols?: Array<{ symbol: string; count: number; pnl: number }>;
  topLossSymbols?: Array<{ symbol: string; pnl: number }>;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toNumber(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function formatMoney(value?: number | null) {
  const num = Number(value);
  return Number.isFinite(num)
    ? `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "—";
}

function formatPercent(value?: number | null) {
  const num = Number(value);
  return Number.isFinite(num) ? `${num.toFixed(1)}%` : "—";
}

function valueTone(v: number) {
  return v > 0 ? "text-emerald-300" : v < 0 ? "text-red-300" : "text-white";
}

// ─── Reusable UI Components ───────────────────────────────────────────────────

function InfoHint({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/20 text-[10px] font-bold text-gray-400">
        i
      </span>
      <span className="pointer-events-none absolute left-1/2 top-6 z-20 hidden w-52 -translate-x-1/2 rounded-lg border border-white/10 bg-[#0B1018] p-2 text-[11px] normal-case leading-4 text-gray-200 shadow-xl group-hover:block">
        {text}
      </span>
    </span>
  );
}

function KpiCard({
  label,
  value,
  sub,
  tone = "text-white",
  hint,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-3xl border border-gray-800 bg-[#11151c] p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-400">
        <span>{label}</span>
        {hint ? <InfoHint text={hint} /> : null}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</div>
      {sub ? <div className="mt-1 text-sm text-gray-500">{sub}</div> : null}
    </div>
  );
}

function AdminDonut({
  slices,
  centerLabel,
  centerValue,
  size = 180,
}: {
  slices: Array<{ label: string; percent: number; color: string }>;
  centerLabel: string;
  centerValue: string;
  size?: number;
}) {
  let start = 0;
  const segments: string[] = [];
  for (const s of slices) {
    const pct = Math.min(100, Math.max(0, s.percent));
    if (pct <= 0) continue;
    const end = Math.min(100, start + pct);
    segments.push(`${s.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`);
    start = end;
  }
  if (start < 100) segments.push(`#1a2233 ${start.toFixed(2)}% 100%`);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="h-full w-full rounded-full"
        style={{ background: `conic-gradient(${segments.join(", ")})` }}
      />
      <div
        className="absolute rounded-full bg-[#0b0f16]"
        style={{ inset: `${size * 0.18}px` }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="text-[10px] uppercase tracking-wide text-gray-500">{centerLabel}</div>
        <div className="mt-1 text-lg font-semibold text-white leading-tight">{centerValue}</div>
      </div>
    </div>
  );
}

function FunnelBar({
  label,
  count,
  total,
  color,
  sublabel,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
  sublabel?: string;
}) {
  const pct = total > 0 ? Math.min(100, (count / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-gray-300">{label}</span>
        <span className="text-white">
          {count.toLocaleString()}
          <span className="ml-1 text-gray-500">({pct.toFixed(1)}%)</span>
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      {sublabel ? <div className="mt-0.5 text-[10px] text-gray-600">{sublabel}</div> : null}
    </div>
  );
}

function CtsBucketBar({
  bucket,
  maxCount,
}: {
  bucket: CtsBucketItem;
  maxCount: number;
}) {
  const barWidth = maxCount > 0 ? (bucket.count / maxCount) * 100 : 0;
  const pnlTone =
    bucket.avgPnl > 0
      ? "text-emerald-300"
      : bucket.avgPnl < 0
      ? "text-red-300"
      : "text-gray-400";
  const barColor =
    bucket.avgPnl > 0 ? "#10b981" : bucket.avgPnl < 0 ? "#ef4444" : "#6b7280";

  return (
    <div className="rounded-2xl bg-[#1a1f2e] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
        <span className="font-medium text-gray-200">{bucket.label}</span>
        <div className="flex gap-4 text-right">
          <span className="text-gray-500">{bucket.count} trades</span>
          <span className={pnlTone}>
            avg {bucket.avgPnl >= 0 ? "+" : ""}${bucket.avgPnl.toFixed(2)}
          </span>
          <span className={pnlTone}>{bucket.winRate.toFixed(0)}% WR</span>
        </div>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full"
          style={{ width: `${barWidth}%`, backgroundColor: barColor }}
        />
      </div>
    </div>
  );
}

function AdminTabHowTo({ tab }: { tab: AdminTab }) {
  const byTab: Record<AdminTab, { purpose: string; watch: string; action: string }> = {
    executive: {
      purpose: "CEO-level snapshot of platform health, edge quality, and operating risk.",
      watch: "Users in profit/loss, realized P&L, engine reliability, and AI system review recommendations.",
      action: "Choose one top action for the next cycle and reassess in the next report window.",
    },
    risk: {
      purpose: "Surface concentration and portfolio-exposure risks across all users.",
      watch: "Symbol concentration, user exposure buckets, top loss symbols, and risk alerts.",
      action: "Apply symbol and exposure controls when concentration or user-risk skew crosses thresholds.",
    },
    execution: {
      purpose: "Validate execution quality and engine reliability before strategy changes.",
      watch: "Order funnel fill/reject/cancel rates, failed or blocked runs, and low-confidence exits.",
      action: "Fix execution bottlenecks first, then tune strategy once reliability is stable.",
    },
    strategy: {
      purpose: "Understand where edge exists by signal quality and decision mix.",
      watch: "CTS bucket win rates, avg P&L by band, hold-to-sell ratio, and AI edge notes.",
      action: "Increase weight for profitable CTS bands and reduce activity in consistently weak bands.",
    },
    users: {
      purpose: "Inspect user-level outcome distribution and operational quality.",
      watch: "Top accounts by selected metric, open positions, confidence, net P&L, and engine success.",
      action: "Use this tab for targeted interventions: coaching, guardrails, and account-level follow-up.",
    },
  };

  const guide = byTab[tab];

  return (
    <section className="rounded-3xl border border-gray-800 bg-[#11151c]">
      <details className="group" open={tab === "executive"}>
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
        </div>
      </details>
    </section>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminReportsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [tab, setTab] = useState<AdminTab>("executive");
  const [range, setRange] = useState<TimeRange>("30d");
  const [sortBy, setSortBy] = useState<UserSort>("net_pnl");

  const [systemReview, setSystemReview] = useState<SystemReview | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [explainPrompt, setExplainPrompt] = useState("");
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [explainResponse, setExplainResponse] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [range]);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/admin/reports/overview?range=${range}`, { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Failed to load admin reports");
      setData(payload);
    } catch (err: any) {
      setError(err?.message || "Failed to load admin reports");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  async function generateSystemReview() {
    try {
      setReviewLoading(true);
      setReviewError(null);
      setExplainResponse(null);
      setExplainError(null);
      const res = await fetch("/api/admin/ai-system-review", { method: "POST", cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Failed to generate system review");
      setSystemReview(payload);
    } catch (err: any) {
      setReviewError(err?.message || "Failed to generate system review");
    } finally {
      setReviewLoading(false);
    }
  }

  async function askSystemAi() {
    if (!explainPrompt.trim() || !systemReview) return;
    try {
      setExplainLoading(true);
      setExplainError(null);
      setExplainResponse(null);

      const context = [
        `Overview: ${systemReview.overview}`,
        systemReview.keyInsights?.length ? `Key Insights: ${systemReview.keyInsights.join("; ")}` : "",
        systemReview.risks?.length ? `Risks: ${systemReview.risks.join("; ")}` : "",
        systemReview.edgeAnalysis?.length ? `Edge: ${systemReview.edgeAnalysis.join("; ")}` : "",
        systemReview.recommendations?.length ? `Recommendations: ${systemReview.recommendations.join("; ")}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: `You are Luckmi AI System Intelligence helping a platform administrator.\n\nContext:\n${context}\n\nQuestion: ${explainPrompt.trim()}\n\nBe direct, analytical, concise. No financial advice.`,
            },
          ],
        }),
      });

      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Failed");
      const text =
        payload?.choices?.[0]?.message?.content ||
        payload?.message?.content ||
        payload?.content ||
        payload?.reply ||
        payload?.text ||
        "";
      if (!text) throw new Error("Empty response from AI");
      setExplainResponse(text);
    } catch (err: any) {
      setExplainError(err?.message || "Could not reach Luckmi AI right now.");
    } finally {
      setExplainLoading(false);
    }
  }

  // ─── Computed ──────────────────────────────────────────────────────────────

  const systemHealth = useMemo(() => {
    if (!data)
      return { status: "Loading", color: "gray", bg: "border-gray-700 bg-gray-500/10", text: "text-gray-300", message: "" };
    const s = data.summary;
    const issues: string[] = [];
    if (s.engine_success_rate < 75) issues.push("engine reliability below 75%");
    if (s.avg_ai_confidence < 60) issues.push("AI confidence low");
    if (s.users_in_loss > s.users_in_profit) issues.push("more users in loss than profit");
    if (s.engine_failed_runs + s.engine_blocked_runs > 5) issues.push("elevated engine failures");
    if (issues.length === 0)
      return { status: "System Healthy", color: "emerald", bg: "border-emerald-500/30 bg-emerald-500/10", text: "text-emerald-300", message: "All core metrics are within normal operating range." };
    if (issues.length === 1)
      return { status: "Attention Required", color: "amber", bg: "border-amber-500/30 bg-amber-500/10", text: "text-amber-300", message: `One concern flagged: ${issues[0]}.` };
    return { status: "Action Required", color: "red", bg: "border-red-500/30 bg-red-500/10", text: "text-red-300", message: `${issues.length} issues active: ${issues.join("; ")}.` };
  }, [data]);

  const sortedUsers = useMemo(() => {
    const rows = [...(data?.users || [])];
    rows.sort((a, b) => {
      if (sortBy === "open_positions") return b.open_positions - a.open_positions;
      if (sortBy === "unrealized_pnl") return toNumber(b.unrealized_pnl) - toNumber(a.unrealized_pnl);
      if (sortBy === "engine_success") return toNumber(b.engine_success_rate, -1) - toNumber(a.engine_success_rate, -1);
      return toNumber(b.net_pnl) - toNumber(a.net_pnl);
    });
    return rows.slice(0, 25);
  }, [data?.users, sortBy]);

  const aiTuningNotes = useMemo(() => {
    if (!data) return [] as string[];
    const notes: string[] = [];
    const s = data.summary;
    const d = data.diagnostics;
    if (s.engine_success_rate < 75) notes.push("Engine reliability is below 75%. Fix run failures before tuning strategy logic.");
    if (s.avg_ai_confidence < 60) notes.push("Average AI confidence is soft. Tighten buy gates to reduce weak entries.");
    if (toNumber(d.hold_to_sell_ratio) > 3) notes.push("Hold-to-sell ratio is elevated. Add exit triggers to resolve positions faster.");
    if (d.low_confidence_sell_decisions > 0) notes.push("Low-confidence sells are present. Require stronger reversal evidence before forced exits.");
    if (d.top_loss_symbols.length > 0 && d.top_loss_symbols[0].pnl < 0)
      notes.push(`Largest loss is concentrated in ${d.top_loss_symbols[0].symbol}. Add symbol-level cooldown or tighter volatility filter.`);
    if (notes.length === 0) notes.push("Core metrics look stable. Focus on risk-adjusted returns per symbol and market regime alignment.");
    return notes;
  }, [data]);

  const topActions = useMemo(() => {
    if (!data) return [] as string[];
    const list: string[] = [];
    const s = data.summary;
    if (s.users_in_loss > s.users_in_profit) list.push("More users net-negative. Tighten entry quality for low-confidence trades.");
    if (s.engine_failed_runs + s.engine_blocked_runs > 0) list.push(`${s.engine_failed_runs + s.engine_blocked_runs} engine failures/blocks. Prioritize reliability over strategy changes.`);
    if (s.avg_ai_confidence < 60) list.push("AI confidence is soft. Raise minimum confidence or CTS gates for auto entries.");
    if (list.length === 0) list.push("Platform metrics are stable. Run controlled policy experiments by symbol cohort.");
    return list.slice(0, 3);
  }, [data]);

  const symbolDonutSlices = useMemo(() => {
    const palette = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#6b7280"];
    return (data?.diagnostics.symbol_concentration || []).map((row, idx) => ({
      label: row.symbol,
      percent: row.pct,
      color: palette[idx % palette.length],
      pnl: row.pnl,
    }));
  }, [data]);

  const userExposureSlices = useMemo(() => {
    const b = data?.diagnostics.users_by_position_bucket;
    if (!b) return [];
    const total = b.no_positions + b.one_to_three + b.four_plus;
    if (total === 0) return [];
    return [
      { label: "No positions", percent: (b.no_positions / total) * 100, color: "#6b7280" },
      { label: "1–3 positions", percent: (b.one_to_three / total) * 100, color: "#3b82f6" },
      { label: "4+ positions", percent: (b.four_plus / total) * 100, color: "#10b981" },
    ];
  }, [data]);

  const ctsBucketList = useMemo((): CtsBucketItem[] => {
    const b = data?.diagnostics.cts_buckets;
    if (!b) return [];
    return [b.high, b.upper, b.mid, b.low];
  }, [data]);

  const maxCtsBucketCount = useMemo(
    () => Math.max(1, ...ctsBucketList.map((b) => b.count)),
    [ctsBucketList]
  );

  const tabs: Array<{ key: AdminTab; label: string; desc: string }> = [
    { key: "executive", label: "Executive", desc: "System verdict + KPIs + AI" },
    { key: "risk", label: "Risk", desc: "Concentration + exposure" },
    { key: "execution", label: "Execution", desc: "Orders + engine" },
    { key: "strategy", label: "Strategy", desc: "CTS edge + tuning" },
    { key: "users", label: "Users", desc: "Accounts + plans" },
  ];

  return (
    <div className="min-h-screen bg-[#0b0f16] text-white">
      <TopNav activePage="admin-reports" />

      <div className="p-4 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-6">

          {/* ─── Header ──────────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold sm:text-3xl">System Dashboard</h1>
              <p className="mt-1 text-sm text-gray-400">
                Platform-wide intelligence for strategy, risk, and execution.
              </p>
              <p className="mt-1 text-xs text-gray-600">
                {data?.generated_at ? new Date(data.generated_at).toLocaleString() : "—"} · {range.toUpperCase()}
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
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-gray-300 transition hover:bg-white/10"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => void generateSystemReview()}
                disabled={reviewLoading}
                className="rounded-2xl border border-violet-500/40 bg-violet-500/15 px-4 py-1.5 text-xs font-semibold text-violet-200 transition hover:bg-violet-500/25 disabled:opacity-50"
              >
                {reviewLoading ? "Analyzing..." : systemReview ? "Refresh AI Review" : "AI System Review"}
              </button>
            </div>
          </div>

          {/* ─── System Health Badge ─────────────────────────────────────────── */}
          {data ? (
            <div className={`rounded-2xl border px-5 py-3 ${systemHealth.bg}`}>
              <div className="flex flex-wrap items-center gap-3">
                <span className={`text-sm font-semibold ${systemHealth.text}`}>
                  {systemHealth.status}
                </span>
                {systemHealth.message ? (
                  <span className="text-sm text-gray-300">{systemHealth.message}</span>
                ) : null}
                <span className="ml-auto text-xs text-gray-500">
                  {data.summary.total_users} users · {data.summary.total_ai_decisions.toLocaleString()} decisions · {range.toUpperCase()} window
                </span>
              </div>
            </div>
          ) : null}

          {/* ─── Tab Selector ────────────────────────────────────────────────── */}
          <section className="rounded-3xl border border-gray-800 bg-[#11151c] p-3">
            <div className="flex flex-wrap items-center gap-2">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`group rounded-2xl border px-4 py-2 text-sm font-medium transition ${
                    tab === t.key
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                      : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </section>

          <AdminTabHowTo tab={tab} />

          {/* ─── Loading / Error ─────────────────────────────────────────────── */}
          {loading ? (
            <div className="rounded-3xl border border-gray-800 bg-[#11151c] p-6 text-sm text-gray-400">
              Loading dashboard...
            </div>
          ) : error ? (
            <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-200">
              {error}
            </div>
          ) : data ? (
            <>
              {/* ══════════════════════════════════════════════════════════════
                  EXECUTIVE TAB
              ══════════════════════════════════════════════════════════════ */}
              {tab === "executive" ? (
                <>
                  <section className="rounded-3xl border border-[#F5C76E]/25 bg-gradient-to-r from-[#F5C76E]/[0.10] to-transparent p-4">
                    <div className="mb-3 flex items-center gap-3">
                      <LuckmiAiIcon size={24} />
                      <div>
                        <div className="text-sm font-semibold text-[#F5C76E]">Luckmi AI Pulse</div>
                        <div className="text-xs text-gray-300">Core AI throughput and quality at a glance.</div>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <KpiCard
                        label="AI Decisions"
                        value={data.summary.total_ai_decisions.toLocaleString()}
                        sub={`${data.summary.buy_decisions} buy · ${data.summary.hold_decisions} hold · ${data.summary.sell_decisions} sell`}
                        tone="text-amber-300"
                        hint="Volume and action mix of AI decisions in this window."
                      />
                      <KpiCard
                        label="Avg AI Confidence"
                        value={formatPercent(data.summary.avg_ai_confidence)}
                        sub="Mean across all decisions"
                        tone={data.summary.avg_ai_confidence >= 70 ? "text-emerald-300" : "text-amber-300"}
                        hint="Lower values indicate weaker setup quality across the platform."
                      />
                    </div>
                  </section>

                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    <KpiCard
                      label="Total Users"
                      value={String(data.summary.total_users)}
                      sub={`${data.summary.users_with_positions} with open positions`}
                      tone="text-blue-300"
                      hint="All users included in this report window."
                    />
                    <KpiCard
                      label="Users in Profit"
                      value={String(data.summary.users_in_profit)}
                      sub={`${data.summary.users_in_loss} in loss · ${data.summary.total_users - data.summary.users_in_profit - data.summary.users_in_loss} neutral`}
                      tone={data.summary.users_in_profit >= data.summary.users_in_loss ? "text-emerald-300" : "text-amber-300"}
                      hint="How many users have a positive net P&L in this window."
                    />
                    <KpiCard
                      label="Realized P&L"
                      value={formatMoney(data.summary.total_realized_pnl)}
                      sub="All closed sell trades"
                      tone={valueTone(toNumber(data.summary.total_realized_pnl))}
                      hint="Total confirmed closed-trade P&L across all users."
                    />
                    <KpiCard
                      label="Engine Reliability"
                      value={formatPercent(data.summary.engine_success_rate)}
                      sub={`${data.summary.engine_failed_runs} failed · ${data.summary.engine_blocked_runs} blocked`}
                      tone={data.summary.engine_success_rate >= 75 ? "text-emerald-300" : "text-red-300"}
                      hint="Share of engine runs that completed successfully."
                    />
                  </div>

                  <section className="rounded-3xl border border-gray-800 bg-[#11151c]">
                    <div className="border-b border-gray-800 px-5 py-4">
                      <h2 className="text-base font-semibold text-white">Top Actions This Period</h2>
                      <p className="mt-1 text-sm text-gray-400">Highest-priority items based on current platform metrics.</p>
                    </div>
                    <div className="space-y-3 p-5">
                      {topActions.map((action, i) => (
                        <div key={i} className="flex items-start gap-3 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4">
                          <span className="mt-0.5 shrink-0 font-bold text-blue-400">{i + 1}.</span>
                          <span className="text-sm text-blue-100">{action}</span>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* AI System Review in Executive tab */}
                  <section className="rounded-3xl border border-violet-500/30 bg-gradient-to-br from-[#110d1f] via-[#0f1525] to-[#0b0f16] p-5">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">🧠</span>
                      <h2 className="text-base font-semibold text-violet-200">Luckmi AI System Intelligence</h2>
                    </div>
                    <p className="text-sm text-gray-400 mb-4">
                      AI-generated executive review: strategy edge, risk exposure, execution quality, growth signals.
                    </p>

                    {reviewError ? (
                      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200 mb-4">
                        {reviewError}
                      </div>
                    ) : null}

                    {!systemReview ? (
                      <div className="rounded-2xl border border-dashed border-white/15 bg-[#0E1420] p-5 text-sm text-gray-400">
                        Click "AI System Review" at the top-right to generate a full platform intelligence brief.
                      </div>
                    ) : (
                      <>
                        <div className="rounded-2xl border border-violet-500/20 bg-violet-500/10 p-4 text-sm leading-6 text-violet-100 mb-4">
                          {systemReview.overview}
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2 mb-4">
                          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4">
                            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-blue-400">Key Insights</div>
                            <ul className="space-y-2">
                              {systemReview.keyInsights.map((item, i) => (
                                <li key={i} className="flex gap-2 text-sm text-blue-100">
                                  <span className="mt-0.5 shrink-0 text-blue-400">→</span>
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
                            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-red-400">Risks</div>
                            <ul className="space-y-2">
                              {systemReview.risks.map((item, i) => (
                                <li key={i} className="flex gap-2 text-sm text-red-100">
                                  <span className="mt-0.5 shrink-0 text-red-400">⚠</span>
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-violet-500/20 bg-violet-500/10 p-4 mb-4">
                          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-violet-400">Recommendations</div>
                          <ol className="space-y-2">
                            {systemReview.recommendations.map((item, i) => (
                              <li key={i} className="flex gap-2 text-sm text-violet-100">
                                <span className="mt-0.5 shrink-0 font-bold text-violet-400">{i + 1}.</span>
                                <span>{item}</span>
                              </li>
                            ))}
                          </ol>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-[#0A101A] p-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                              <h3 className="text-sm font-semibold text-white">Ask System AI</h3>
                              <p className="mt-1 text-xs text-gray-400">Follow-up on strategy, risks, or scale decisions.</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void askSystemAi()}
                              disabled={explainLoading || !explainPrompt.trim()}
                              className="rounded-2xl border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-300 transition hover:bg-violet-500/20 disabled:opacity-50"
                            >
                              {explainLoading ? "Analyzing..." : "Ask System AI"}
                            </button>
                          </div>
                          <textarea
                            value={explainPrompt}
                            onChange={(e) => setExplainPrompt(e.target.value)}
                            placeholder="Example: Why are low-CTS trades still being executed and how do we fix it?"
                            className="mt-3 w-full rounded-xl border border-white/10 bg-[#0E1420] px-3 py-2 text-sm text-gray-200 outline-none transition focus:border-violet-500/40"
                            rows={2}
                          />
                          <div className="mt-2 flex flex-wrap gap-2">
                            {[
                              "Where is our strongest edge?",
                              "What's our biggest system risk right now?",
                              "How can we improve win rate platform-wide?",
                              "Is the system ready to scale to more users?",
                            ].map((chip) => (
                              <button
                                key={chip}
                                type="button"
                                onClick={() => setExplainPrompt(chip)}
                                className="rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-xs text-violet-300 transition hover:bg-violet-500/25 hover:border-violet-500/40"
                              >
                                {chip}
                              </button>
                            ))}
                          </div>
                          {explainError ? (
                            <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{explainError}</div>
                          ) : null}
                          {explainResponse ? (
                            <div className="mt-3 rounded-xl border border-violet-500/25 bg-violet-500/10 p-3 text-sm leading-6 text-violet-100 whitespace-pre-wrap">{explainResponse}</div>
                          ) : null}
                        </div>

                        <div className="mt-3 text-xs text-gray-600">
                          Generated: {systemReview.meta?.generatedAt ? new Date(systemReview.meta.generatedAt).toLocaleString() : "—"}
                          {systemReview.meta?.sampleSizes ? (
                            <span className="ml-3">
                              · {systemReview.meta.sampleSizes.trades ?? 0} trades
                              · {systemReview.meta.sampleSizes.aiDecisions ?? 0} decisions
                              · {systemReview.meta.sampleSizes.engineRuns ?? 0} engine runs
                            </span>
                          ) : null}
                        </div>
                      </>
                    )}
                  </section>
                </>
              ) : null}

              {/* ══════════════════════════════════════════════════════════════
                  RISK TAB
              ══════════════════════════════════════════════════════════════ */}
              {tab === "risk" ? (
                <>
                  <section className="rounded-3xl border border-[#F5C76E]/25 bg-gradient-to-r from-[#F5C76E]/[0.10] to-transparent p-4">
                    <div className="mb-3 flex items-center gap-3">
                      <LuckmiAiIcon size={22} />
                      <div>
                        <div className="text-sm font-semibold text-[#F5C76E]">Luckmi AI Risk Lens</div>
                        <div className="text-xs text-gray-300">AI decision velocity and conviction in current risk conditions.</div>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <KpiCard label="AI Decisions" value={data.summary.total_ai_decisions.toLocaleString()} sub="Across selected range" tone="text-amber-300" />
                      <KpiCard label="Avg AI Confidence" value={formatPercent(data.summary.avg_ai_confidence)} sub="Signal conviction" tone={data.summary.avg_ai_confidence >= 70 ? "text-emerald-300" : "text-amber-300"} />
                    </div>
                  </section>

                  <div className="grid gap-6 xl:grid-cols-2">
                    {/* Symbol Concentration Donut */}
                    <section className="rounded-3xl border border-gray-800 bg-[#11151c]">
                      <div className="border-b border-gray-800 px-5 py-4">
                        <h2 className="text-base font-semibold text-white">Symbol Concentration</h2>
                        <p className="mt-1 text-sm text-gray-400">Share of all trades by symbol across the platform.</p>
                      </div>
                      <div className="p-5">
                        {symbolDonutSlices.length === 0 ? (
                          <div className="text-sm text-gray-500">No trade data for this range.</div>
                        ) : (
                          <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
                            <AdminDonut
                              slices={symbolDonutSlices}
                              centerLabel="Top symbol"
                              centerValue={symbolDonutSlices[0]?.label ?? "—"}
                              size={180}
                            />
                            <div className="flex-1 space-y-2">
                              {symbolDonutSlices.map((row) => (
                                <div key={row.label} className="flex items-center justify-between text-sm">
                                  <div className="flex items-center gap-2">
                                    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                                    <span className="text-white">{row.label}</span>
                                  </div>
                                  <div className="flex gap-4 text-xs">
                                    <span className="text-gray-400">{row.percent.toFixed(1)}%</span>
                                    <span className={row.pnl >= 0 ? "text-emerald-300" : "text-red-300"}>
                                      {row.pnl >= 0 ? "+" : ""}{row.pnl.toFixed(2)}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </section>

                    {/* User Exposure Donut */}
                    <section className="rounded-3xl border border-gray-800 bg-[#11151c]">
                      <div className="border-b border-gray-800 px-5 py-4">
                        <h2 className="text-base font-semibold text-white">User Position Exposure</h2>
                        <p className="mt-1 text-sm text-gray-400">Distribution of users by number of open positions.</p>
                      </div>
                      <div className="p-5">
                        {userExposureSlices.length === 0 ? (
                          <div className="text-sm text-gray-500">No position data available.</div>
                        ) : (
                          <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
                            <AdminDonut
                              slices={userExposureSlices}
                              centerLabel="Total users"
                              centerValue={String(data.summary.total_users)}
                              size={180}
                            />
                            <div className="flex-1 space-y-3">
                              {userExposureSlices.map((row) => (
                                <div key={row.label} className="flex items-center justify-between text-sm">
                                  <div className="flex items-center gap-2">
                                    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                                    <span className="text-white">{row.label}</span>
                                  </div>
                                  <span className="text-gray-300 text-xs">{row.percent.toFixed(1)}%</span>
                                </div>
                              ))}
                              <div className="mt-2 rounded-2xl bg-[#1a1f2e] p-3 text-xs text-gray-400">
                                {data.diagnostics.users_by_position_bucket?.four_plus ?? 0} users holding 4+ positions simultaneously.
                                {(data.diagnostics.users_by_position_bucket?.four_plus ?? 0) > (data.summary.total_users * 0.3)
                                  ? " High-exposure users are above 30% of platform — monitor concentration risk."
                                  : " Exposure distribution looks balanced."}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </section>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-2">
                    {/* Top Loss Symbols */}
                    <section className="rounded-3xl border border-gray-800 bg-[#11151c]">
                      <div className="border-b border-gray-800 px-5 py-4">
                        <h2 className="text-base font-semibold text-white">Top Loss Symbols</h2>
                        <p className="mt-1 text-sm text-gray-400">Symbols with the highest negative realized P&L.</p>
                      </div>
                      <div className="p-5">
                        {data.diagnostics.top_loss_symbols.length === 0 ? (
                          <div className="text-sm text-gray-500">No realized losses in this window.</div>
                        ) : (
                          <div className="space-y-3">
                            {data.diagnostics.top_loss_symbols.map((row) => (
                              <div key={row.symbol} className="flex items-center justify-between rounded-2xl bg-[#1a1f2e] px-4 py-3 text-sm">
                                <span className="font-medium text-white">{row.symbol}</span>
                                <span className={valueTone(toNumber(row.pnl))}>{formatMoney(row.pnl)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </section>

                    {/* Risk Alerts */}
                    <section className="rounded-3xl border border-gray-800 bg-[#11151c]">
                      <div className="border-b border-gray-800 px-5 py-4">
                        <h2 className="text-base font-semibold text-white">Risk Alerts</h2>
                        <p className="mt-1 text-sm text-gray-400">Active platform-level risk signals.</p>
                      </div>
                      <div className="space-y-3 p-5">
                        {symbolDonutSlices[0]?.percent >= 35 ? (
                          <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                            ⚠ {symbolDonutSlices[0].label} accounts for {symbolDonutSlices[0].percent.toFixed(0)}% of all trades. Single-symbol concentration risk is elevated.
                          </div>
                        ) : null}
                        {data.summary.users_in_loss > data.summary.users_in_profit ? (
                          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                            ⚠ More users are net-negative than net-positive in this window. Review entry quality.
                          </div>
                        ) : null}
                        {toNumber(data.diagnostics.hold_to_sell_ratio) > 3 ? (
                          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                            ⚠ Hold-to-sell ratio is {data.diagnostics.hold_to_sell_ratio?.toFixed(1)}×. Positions may be staying open too long.
                          </div>
                        ) : null}
                        {data.summary.users_in_loss <= data.summary.users_in_profit &&
                        (symbolDonutSlices[0]?.percent ?? 0) < 35 &&
                        toNumber(data.diagnostics.hold_to_sell_ratio) <= 3 ? (
                          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                            ✓ No critical risk signals in this window. Continue monitoring concentration drift.
                          </div>
                        ) : null}
                      </div>
                    </section>
                  </div>
                </>
              ) : null}

              {/* ══════════════════════════════════════════════════════════════
                  EXECUTION TAB
              ══════════════════════════════════════════════════════════════ */}
              {tab === "execution" ? (
                <>
                  <section className="rounded-3xl border border-[#F5C76E]/25 bg-gradient-to-r from-[#F5C76E]/[0.10] to-transparent p-4">
                    <div className="mb-3 flex items-center gap-3">
                      <LuckmiAiIcon size={22} />
                      <div>
                        <div className="text-sm font-semibold text-[#F5C76E]">Luckmi AI Execution Pulse</div>
                        <div className="text-xs text-gray-300">AI output quality aligned with execution reliability.</div>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <KpiCard label="AI Decisions" value={data.summary.total_ai_decisions.toLocaleString()} sub="AI calls generated" tone="text-amber-300" />
                      <KpiCard label="Avg AI Confidence" value={formatPercent(data.summary.avg_ai_confidence)} sub="Decision certainty" tone={data.summary.avg_ai_confidence >= 70 ? "text-emerald-300" : "text-amber-300"} />
                    </div>
                  </section>

                  <div className="grid gap-6 xl:grid-cols-2">
                    {/* Execution Funnel */}
                    <section className="rounded-3xl border border-gray-800 bg-[#11151c]">
                      <div className="border-b border-gray-800 px-5 py-4">
                        <h2 className="text-base font-semibold text-white">Order Execution Funnel</h2>
                        <p className="mt-1 text-sm text-gray-400">How broker orders flow from placement to completion.</p>
                      </div>
                      <div className="space-y-4 p-5">
                        {!data.diagnostics.execution_funnel || data.diagnostics.execution_funnel.placed === 0 ? (
                          <div className="text-sm text-gray-500">No broker order data in this window.</div>
                        ) : (
                          <>
                            <FunnelBar
                              label="Orders Placed"
                              count={data.diagnostics.execution_funnel.placed}
                              total={data.diagnostics.execution_funnel.placed}
                              color="#6b7280"
                              sublabel="Total orders submitted to broker"
                            />
                            <FunnelBar
                              label="Filled"
                              count={data.diagnostics.execution_funnel.filled}
                              total={data.diagnostics.execution_funnel.placed}
                              color="#10b981"
                              sublabel="Successfully executed orders"
                            />
                            <FunnelBar
                              label="Rejected"
                              count={data.diagnostics.execution_funnel.rejected}
                              total={data.diagnostics.execution_funnel.placed}
                              color="#ef4444"
                              sublabel="Broker rejections (PDT, funds, limits)"
                            />
                            <FunnelBar
                              label="Cancelled"
                              count={data.diagnostics.execution_funnel.cancelled}
                              total={data.diagnostics.execution_funnel.placed}
                              color="#f59e0b"
                              sublabel="System or user cancellations"
                            />
                            <FunnelBar
                              label="Pending / Other"
                              count={data.diagnostics.execution_funnel.pending}
                              total={data.diagnostics.execution_funnel.placed}
                              color="#3b82f6"
                              sublabel="In-flight or unclassified orders"
                            />

                            <div className="mt-2 rounded-2xl bg-[#1a1f2e] px-4 py-3">
                              <div className="text-xs text-gray-400">Fill Rate</div>
                              <div className={`mt-1 text-2xl font-semibold ${
                                data.diagnostics.execution_funnel.placed > 0 &&
                                (data.diagnostics.execution_funnel.filled / data.diagnostics.execution_funnel.placed) >= 0.85
                                  ? "text-emerald-300" : "text-amber-300"
                              }`}>
                                {data.diagnostics.execution_funnel.placed > 0
                                  ? `${((data.diagnostics.execution_funnel.filled / data.diagnostics.execution_funnel.placed) * 100).toFixed(1)}%`
                                  : "—"}
                              </div>
                              <div className="mt-1 text-xs text-gray-500">
                                {data.diagnostics.execution_funnel.rejected} rejected of {data.diagnostics.execution_funnel.placed} placed
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </section>

                    {/* Engine Health */}
                    <section className="rounded-3xl border border-gray-800 bg-[#11151c]">
                      <div className="border-b border-gray-800 px-5 py-4">
                        <h2 className="text-base font-semibold text-white">Engine Reliability</h2>
                        <p className="mt-1 text-sm text-gray-400">Trading engine run health across all accounts.</p>
                      </div>
                      <div className="space-y-4 p-5">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-2xl bg-[#1a1f2e] p-4">
                            <div className="text-xs text-gray-400">Success Rate</div>
                            <div className={`mt-1 text-2xl font-semibold ${
                              data.summary.engine_success_rate >= 80 ? "text-emerald-300" :
                              data.summary.engine_success_rate >= 60 ? "text-amber-300" : "text-red-300"
                            }`}>
                              {formatPercent(data.summary.engine_success_rate)}
                            </div>
                          </div>
                          <div className="rounded-2xl bg-[#1a1f2e] p-4">
                            <div className="text-xs text-gray-400">Failed Runs</div>
                            <div className={`mt-1 text-2xl font-semibold ${data.summary.engine_failed_runs > 0 ? "text-red-300" : "text-emerald-300"}`}>
                              {data.summary.engine_failed_runs}
                            </div>
                          </div>
                          <div className="rounded-2xl bg-[#1a1f2e] p-4">
                            <div className="text-xs text-gray-400">Blocked Runs</div>
                            <div className={`mt-1 text-2xl font-semibold ${data.summary.engine_blocked_runs > 0 ? "text-amber-300" : "text-emerald-300"}`}>
                              {data.summary.engine_blocked_runs}
                            </div>
                          </div>
                          <div className="rounded-2xl bg-[#1a1f2e] p-4">
                            <div className="text-xs text-gray-400">Decisions (7d)</div>
                            <div className="mt-1 text-2xl font-semibold text-white">
                              {data.diagnostics.decisions_last_7d}
                            </div>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-[#1a1f2e] px-4 py-4">
                          <div className="text-xs text-gray-400 mb-2">Engine Runs by Type</div>
                          <div className="space-y-2">
                            <FunnelBar
                              label="Success"
                              count={Math.round(data.summary.engine_success_rate / 100 * (data.summary.engine_failed_runs + data.summary.engine_blocked_runs + Math.round(data.summary.engine_success_rate)))}
                              total={data.summary.engine_failed_runs + data.summary.engine_blocked_runs + 100}
                              color="#10b981"
                            />
                            <FunnelBar
                              label="Failed"
                              count={data.summary.engine_failed_runs}
                              total={data.summary.engine_failed_runs + data.summary.engine_blocked_runs + 100}
                              color="#ef4444"
                            />
                            <FunnelBar
                              label="Blocked"
                              count={data.summary.engine_blocked_runs}
                              total={data.summary.engine_failed_runs + data.summary.engine_blocked_runs + 100}
                              color="#f59e0b"
                            />
                          </div>
                        </div>

                        {(data.summary.engine_failed_runs + data.summary.engine_blocked_runs) > 0 ? (
                          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                            ⚠ {data.summary.engine_failed_runs + data.summary.engine_blocked_runs} engine issues detected.
                            Investigate run logs before pushing strategy changes.
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                            ✓ No failed or blocked runs in this window. Engine is operating cleanly.
                          </div>
                        )}
                      </div>
                    </section>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <KpiCard
                      label="Unrealized P&L"
                      value={formatMoney(data.summary.total_unrealized_pnl)}
                      sub="Open-position mark-to-market"
                      tone={valueTone(toNumber(data.summary.total_unrealized_pnl))}
                    />
                    <KpiCard
                      label="Open Positions"
                      value={String(data.summary.total_open_positions)}
                      sub={`Across ${data.summary.users_with_positions} accounts`}
                      tone="text-blue-300"
                    />
                    <KpiCard
                      label="Low-Conf Sells"
                      value={String(data.diagnostics.low_confidence_sell_decisions)}
                      sub="Sell decisions below confidence threshold"
                      tone={data.diagnostics.low_confidence_sell_decisions > 0 ? "text-amber-300" : "text-emerald-300"}
                    />
                  </div>
                </>
              ) : null}

              {/* ══════════════════════════════════════════════════════════════
                  STRATEGY TAB
              ══════════════════════════════════════════════════════════════ */}
              {tab === "strategy" ? (
                <>
                  <section className="rounded-3xl border border-[#F5C76E]/25 bg-gradient-to-r from-[#F5C76E]/[0.10] to-transparent p-4">
                    <div className="mb-3 flex items-center gap-3">
                      <LuckmiAiIcon size={22} />
                      <div>
                        <div className="text-sm font-semibold text-[#F5C76E]">Luckmi AI Strategy Pulse</div>
                        <div className="text-xs text-gray-300">Decision volume and confidence before deep strategy analysis.</div>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <KpiCard label="AI Decisions" value={data.summary.total_ai_decisions.toLocaleString()} sub="Strategy-driving calls" tone="text-amber-300" />
                      <KpiCard label="Avg AI Confidence" value={formatPercent(data.summary.avg_ai_confidence)} sub="Confidence baseline" tone={data.summary.avg_ai_confidence >= 70 ? "text-emerald-300" : "text-amber-300"} />
                    </div>
                  </section>

                  <section className="rounded-3xl border border-gray-800 bg-[#11151c]">
                    <div className="border-b border-gray-800 px-5 py-4">
                      <h2 className="text-base font-semibold text-white">CTS Performance Buckets</h2>
                      <p className="mt-1 text-sm text-gray-400">
                        Where the system's edge concentrates by signal quality. Bar width = relative trade volume.
                      </p>
                    </div>
                    <div className="space-y-3 p-5">
                      {ctsBucketList.every((b) => b.count === 0) ? (
                        <div className="text-sm text-gray-500">No CTS-scored trades in this window.</div>
                      ) : (
                        ctsBucketList.map((bucket) => (
                          <CtsBucketBar key={bucket.label} bucket={bucket} maxCount={maxCtsBucketCount} />
                        ))
                      )}
                    </div>
                  </section>

                  <div className="grid gap-6 xl:grid-cols-2">
                    <section className="rounded-3xl border border-gray-800 bg-[#11151c]">
                      <div className="border-b border-gray-800 px-5 py-4">
                        <h2 className="text-base font-semibold text-white">Decision Mix</h2>
                        <p className="mt-1 text-sm text-gray-400">Buy / Hold / Sell split across all AI decisions.</p>
                      </div>
                      <div className="space-y-3 p-5">
                        {(() => {
                          const total = data.summary.buy_decisions + data.summary.hold_decisions + data.summary.sell_decisions;
                          return (
                            <>
                              <FunnelBar label="Buy" count={data.summary.buy_decisions} total={total} color="#10b981" />
                              <FunnelBar label="Hold" count={data.summary.hold_decisions} total={total} color="#f59e0b" />
                              <FunnelBar label="Sell" count={data.summary.sell_decisions} total={total} color="#ef4444" />
                              <div className="mt-2 rounded-2xl bg-[#1a1f2e] px-4 py-3 text-xs text-gray-400">
                                Hold : Sell ratio is{" "}
                                <span className={toNumber(data.diagnostics.hold_to_sell_ratio) > 3 ? "text-amber-300 font-semibold" : "text-white"}>
                                  {data.diagnostics.hold_to_sell_ratio?.toFixed(1) ?? "—"}×
                                </span>
                                {toNumber(data.diagnostics.hold_to_sell_ratio) > 3
                                  ? " — positions are staying open longer than optimal."
                                  : " — exit cadence looks balanced."}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </section>

                    <section className="rounded-3xl border border-gray-800 bg-[#11151c]">
                      <div className="border-b border-gray-800 px-5 py-4">
                        <h2 className="text-base font-semibold text-white">AI Tuning Notes</h2>
                        <p className="mt-1 text-sm text-gray-400">Actionable strategy improvements from current metrics.</p>
                      </div>
                      <div className="space-y-3 p-5">
                        {aiTuningNotes.map((note, i) => (
                          <div key={i} className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">
                            {note}
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>

                  {systemReview?.edgeAnalysis?.length ? (
                    <section className="rounded-3xl border border-gray-800 bg-[#11151c]">
                      <div className="border-b border-gray-800 px-5 py-4">
                        <h2 className="text-base font-semibold text-white">AI Edge Analysis</h2>
                        <p className="mt-1 text-sm text-gray-400">
                          Where Luckmi's strategy wins and where it loses — from the last AI System Review.
                        </p>
                      </div>
                      <div className="space-y-3 p-5">
                        {systemReview.edgeAnalysis.map((item, i) => (
                          <div key={i} className="flex gap-2 rounded-2xl bg-[#1a1f2e] p-4 text-sm text-gray-200">
                            <span className="mt-0.5 shrink-0 text-amber-400">◆</span>
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </>
              ) : null}

              {/* ══════════════════════════════════════════════════════════════
                  USERS TAB
              ══════════════════════════════════════════════════════════════ */}
              {tab === "users" ? (
                <>
                  <section className="rounded-3xl border border-[#F5C76E]/25 bg-gradient-to-r from-[#F5C76E]/[0.10] to-transparent p-4">
                    <div className="mb-3 flex items-center gap-3">
                      <LuckmiAiIcon size={22} />
                      <div>
                        <div className="text-sm font-semibold text-[#F5C76E]">Luckmi AI User Pulse</div>
                        <div className="text-xs text-gray-300">How much AI is being used and with what confidence across users.</div>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <KpiCard label="AI Decisions" value={data.summary.total_ai_decisions.toLocaleString()} sub="User-level AI activity" tone="text-amber-300" />
                      <KpiCard label="Avg AI Confidence" value={formatPercent(data.summary.avg_ai_confidence)} sub="Cross-user average" tone={data.summary.avg_ai_confidence >= 70 ? "text-emerald-300" : "text-amber-300"} />
                    </div>
                  </section>

                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <KpiCard label="Total Users" value={String(data.summary.total_users)} sub="All registered accounts" tone="text-blue-300" />
                    <KpiCard
                      label="In Profit"
                      value={String(data.summary.users_in_profit)}
                      sub={`${data.summary.users_in_loss} in loss`}
                      tone={data.summary.users_in_profit >= data.summary.users_in_loss ? "text-emerald-300" : "text-amber-300"}
                    />
                    <KpiCard label="With Positions" value={String(data.summary.users_with_positions)} sub="Currently holding stocks" tone="text-white" />
                    <KpiCard label="Avg CTS" value={toNumber(data.summary.avg_cts).toFixed(0)} sub="Mean signal quality score" tone={data.summary.avg_cts >= 70 ? "text-emerald-300" : "text-amber-300"} />
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[1.3fr_.7fr]">
                    {/* User Table */}
                    <section className="rounded-3xl border border-gray-800 bg-[#11151c]">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 px-5 py-4">
                        <div>
                          <h2 className="text-base font-semibold text-white">Top Accounts</h2>
                          <p className="mt-1 text-sm text-gray-400">Sorted by selected metric, top 25.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(["net_pnl", "unrealized_pnl", "open_positions", "engine_success"] as UserSort[]).map((key) => {
                            const labels: Record<UserSort, string> = {
                              net_pnl: "Net P&L",
                              unrealized_pnl: "Unrealized",
                              open_positions: "Positions",
                              engine_success: "Engine",
                            };
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => setSortBy(key)}
                                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                                  sortBy === key
                                    ? "border-blue-500/40 bg-blue-500/15 text-blue-300"
                                    : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"
                                }`}
                              >
                                {labels[key]}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="max-h-[540px] overflow-y-auto p-5">
                        <div className="space-y-3">
                          {sortedUsers.map((user) => (
                            <div key={user.user_id} className="rounded-2xl border border-white/5 bg-[#1a1f2e] p-4">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <div className="font-semibold text-white">{user.full_name || "Unnamed"}</div>
                                  <div className="text-xs text-gray-400">{user.email || "—"}</div>
                                </div>
                                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-gray-400">
                                  {user.plan_code || "none"}
                                </span>
                              </div>

                              <div className="mt-3 grid grid-cols-4 gap-2">
                                <div>
                                  <div className="text-[10px] text-gray-500">Positions</div>
                                  <div className="text-sm font-semibold text-white">{user.open_positions}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-gray-500">Unrealized</div>
                                  <div className={`text-sm font-semibold ${valueTone(toNumber(user.unrealized_pnl))}`}>
                                    {formatMoney(user.unrealized_pnl)}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-gray-500">Net P&L</div>
                                  <div className={`text-sm font-semibold ${valueTone(toNumber(user.net_pnl))}`}>
                                    {formatMoney(user.net_pnl)}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-gray-500">Engine</div>
                                  <div className="text-sm font-semibold text-white">
                                    {formatPercent(user.engine_success_rate)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </section>

                    {/* Plan Distribution */}
                    <section className="rounded-3xl border border-gray-800 bg-[#11151c]">
                      <div className="border-b border-gray-800 px-5 py-4">
                        <h2 className="text-base font-semibold text-white">Plan Distribution</h2>
                        <p className="mt-1 text-sm text-gray-400">Users by subscription plan.</p>
                      </div>
                      <div className="p-5">
                        {(() => {
                          const plans = data.diagnostics.top_plans_by_users || [];
                          const total = plans.reduce((s, p) => s + p.users_count, 0);
                          const palette = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#6b7280"];
                          const planSlices = plans.slice(0, 5).map((p, i) => ({
                            label: p.plan_code,
                            percent: total > 0 ? (p.users_count / total) * 100 : 0,
                            color: palette[i % palette.length],
                          }));

                          return (
                            <div className="flex flex-col items-center gap-5">
                              {planSlices.length > 0 ? (
                                <AdminDonut
                                  slices={planSlices}
                                  centerLabel="Plans"
                                  centerValue={String(plans.length)}
                                  size={160}
                                />
                              ) : (
                                <div className="text-sm text-gray-500">No plan data.</div>
                              )}
                              <div className="w-full space-y-2">
                                {plans.slice(0, 5).map((p, i) => (
                                  <div key={p.plan_code} className="flex items-center justify-between text-sm">
                                    <div className="flex items-center gap-2">
                                      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: palette[i % palette.length] }} />
                                      <span className="text-white">{p.plan_code}</span>
                                    </div>
                                    <span className="text-gray-400">{p.users_count} users</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {data.diagnostics.users_by_position_bucket ? (
                        <div className="border-t border-gray-800 p-5">
                          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Position Buckets</div>
                          <div className="grid grid-cols-3 gap-2 text-center text-sm">
                            <div className="rounded-2xl bg-[#1a1f2e] p-3">
                              <div className="text-xs text-gray-500">0 positions</div>
                              <div className="mt-1 font-semibold text-white">{data.diagnostics.users_by_position_bucket.no_positions}</div>
                            </div>
                            <div className="rounded-2xl bg-[#1a1f2e] p-3">
                              <div className="text-xs text-gray-500">1–3</div>
                              <div className="mt-1 font-semibold text-white">{data.diagnostics.users_by_position_bucket.one_to_three}</div>
                            </div>
                            <div className="rounded-2xl bg-[#1a1f2e] p-3">
                              <div className="text-xs text-gray-500">4+</div>
                              <div className="mt-1 font-semibold text-emerald-300">{data.diagnostics.users_by_position_bucket.four_plus}</div>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </section>
                  </div>
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
