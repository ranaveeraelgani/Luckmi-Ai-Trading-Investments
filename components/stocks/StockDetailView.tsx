"use client";

import { useState } from "react";
import LuckmiAiIcon from "@/components/brand/LuckmiAiIcon";
import RefreshAiAnalysisModal from "@/components/stocks/RefreshAiAnalysisModal";

export type StockDetailViewProps = {
  symbol: string;
  quote?: any;
  analysis: any;
  marketNews: any[];
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => Promise<void> | void;
  onRefreshAi?: (instruction?: string) => Promise<void> | void;
  mode?: "watchlist" | "portfolio";
};

function formatMoney(value?: number | string | null) {
  const num = Number(value);
  return Number.isFinite(num)
    ? `$${num.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
    : "—";
}

function formatPercent(value?: number | string | null) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toFixed(2)}%`;
}

function scoreClass(score?: number | string | null) {
  const n = Number(score);
  if (n >= 75) return "text-emerald-300";
  if (n >= 55) return "text-[#F5C76E]";
  return "text-red-300";
}

function scorePillClass(score?: number | string | null) {
  const n = Number(score);
  if (n >= 75) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (n >= 55) return "border-[#F5C76E]/30 bg-[#F5C76E]/10 text-[#F5C76E]";
  return "border-red-500/30 bg-red-500/10 text-red-300";
}

function alignmentClass(alignment?: string | null) {
  if (alignment === "bullish_confirmed") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }
  if (alignment === "bullish_timing_weak") {
    return "border-[#F5C76E]/30 bg-[#F5C76E]/10 text-[#F5C76E]";
  }
  if (alignment === "countertrend_bounce") {
    return "border-blue-500/30 bg-blue-500/10 text-blue-300";
  }
  if (alignment === "bearish_confirmed") {
    return "border-red-500/30 bg-red-500/10 text-red-300";
  }

  return "border-white/10 bg-white/5 text-gray-300";
}

function humanizeAlignment(alignment?: string | null) {
  switch (alignment) {
    case "bullish_confirmed":
      return "Bullish Confirmed";
    case "bullish_timing_weak":
      return "Bullish Timing Weak";
    case "countertrend_bounce":
      return "Countertrend Bounce";
    case "bearish_confirmed":
      return "Bearish Confirmed";
    case "mixed":
      return "Mixed";
    default:
      return "Unclear";
  }
}

function actionClass(action?: string | null) {
  const a = String(action || "").toLowerCase();

  if (a.includes("buy")) {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }

  if (a.includes("sell") || a.includes("avoid")) {
    return "border-red-500/30 bg-red-500/10 text-red-300";
  }

  return "border-[#F5C76E]/30 bg-[#F5C76E]/10 text-[#F5C76E]";
}

function Pill({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${className}`}
    >
      {children}
    </span>
  );
}

function MiniMetric({
  label,
  value,
  valueClassName = "",
}: {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/5 bg-[#1A1F2B] px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className={`mt-1 text-sm font-semibold text-white ${valueClassName}`}>
        {value}
      </div>
    </div>
  );
}

function NewsItem({
  item,
}: {
  item: any;
}) {
  const title = item?.headline || item?.title || "Untitled news";
  const url = item?.url || "#";
  const source = item?.source || item?.category || item?.publisher?.name || "Source";

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="block rounded-2xl border border-white/5 bg-[#1A1F2B] p-3 transition hover:bg-white/[0.06]"
    >
      <div className="line-clamp-2 text-sm font-medium leading-5 text-white">
        {title}
      </div>
      <div className="mt-1 text-xs text-gray-500">{source}</div>
    </a>
  );
}

export default function StockDetailView({
  symbol,
  quote,
  analysis,
  marketNews,
  loading,
  error,
  onRefreshAi,
  mode = "watchlist",
}: StockDetailViewProps) {
  const [newsTab, setNewsTab] = useState<"stock" | "market">("stock");
  const [showAiRefreshModal, setShowAiRefreshModal] = useState(false);
  const [refreshingAi, setRefreshingAi] = useState(false);

  async function handleRefreshAi(instruction?: string) {
    if (!onRefreshAi) return;

    try {
      setRefreshingAi(true);
      await onRefreshAi(instruction);
    } finally {
      setRefreshingAi(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-white/5 bg-[#11151C] p-5 text-sm text-gray-400">
        Loading analysis...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-5 text-sm text-red-200">
        {error}
      </div>
    );
  }

  const stockNews = Array.isArray(analysis?.stockNews) ? analysis.stockNews : [];
  const visibleNews = newsTab === "stock" ? stockNews : marketNews;

  const ai = analysis?.aiRecommendation ?? analysis?.ai ?? null;
  const levels = analysis?.levels ?? {};

  const price = quote?.price;
  const changePercent = quote?.changePercent ?? quote?.percentChange ?? null;

  const finalCts = analysis?.ctsScore ?? analysis?.finalScore ?? null;
  const dailyCts = analysis?.dailyCTS ?? null;
  const intradayCts = analysis?.intradayCTS ?? null;
  const alignment = analysis?.alignment ?? null;

  return (
    <div className="space-y-4">
      <div className="mt-2 rounded-3xl border border-white/5 bg-[#11151C] p-4 shadow-[0_0_40px_rgba(22,199,132,0.04)] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold text-white">{symbol}</h1>

              <Pill className="border-white/10 bg-white/5 text-gray-300">
                {mode === "portfolio" ? "Portfolio" : "Watchlist"}
              </Pill>

              <Pill className={scorePillClass(finalCts)}>
                Luckmi Score {finalCts ?? "—"}
              </Pill>
            </div>

            <p className="mt-2 max-w-2xl text-sm text-gray-400">
              AI-powered trend quality, timing alignment, key levels, and news in one compact view.
            </p>
          </div>

          <div className="lg:text-right">
            <div className="text-3xl font-semibold text-white">
              {formatMoney(price)}
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
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <MiniMetric
            label="Final Score"
            value={finalCts ?? "—"}
            valueClassName={scoreClass(finalCts)}
          />
          <MiniMetric
            label="Daily CTS"
            value={dailyCts ?? "—"}
            valueClassName={scoreClass(dailyCts)}
          />
          <MiniMetric
            label="Intraday CTS"
            value={intradayCts ?? "—"}
            valueClassName={scoreClass(intradayCts)}
          />
        </div>

        <div className={`rounded-2xl border px-3 py-2.5 ${alignmentClass(alignment)}`}>
          <div className="text-[10px] uppercase tracking-wide opacity-70">
            Alignment
          </div>
          <div className="mt-1 text-sm font-semibold">
            {humanizeAlignment(alignment)}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <div className="rounded-3xl border border-[#F5C76E]/15 bg-[#11151C] p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-2">
              <LuckmiAiIcon size={36} />
              <div>
                <h2 className="text-lg font-semibold text-white">AI Analysis</h2>
                <div className="text-xs text-gray-500">
                  Confidence {ai?.confidence ?? "—"}%
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {ai?.action ? (
                <Pill className={actionClass(ai.action)}>
                  {ai.action}
                </Pill>
              ) : null}

              {onRefreshAi ? (
                <button
                  type="button"
                  onClick={() => setShowAiRefreshModal(true)}
                  className="rounded-full border border-[#F5C76E]/30 bg-[#F5C76E]/10 px-3 py-1 text-[11px] font-medium text-[#F5C76E] transition hover:bg-[#F5C76E]/20"
                >
                  ✦ Refresh AI
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-[#1A1F2B] p-4 text-sm leading-6 text-gray-300">
            {ai?.reason || "No AI analysis available yet."}
          </div>
        </div>

        <div className="rounded-3xl border border-white/5 bg-[#11151C] p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-white">Key Levels</h2>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <MiniMetric label="Support" value={formatMoney(levels?.support)} />
            <MiniMetric label="Resistance" value={formatMoney(levels?.resistance)} />
            <MiniMetric label="Reclaim" value={formatMoney(levels?.reclaimLevel)} />
            <MiniMetric label="Breakdown" value={formatMoney(levels?.breakdownLevel)} />
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-white/5 bg-[#11151C] p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-white">News</h2>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setNewsTab("stock")}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                newsTab === "stock"
                  ? "bg-emerald-500 text-black"
                  : "border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"
              }`}
            >
              Stock News
            </button>
            <button
              type="button"
              onClick={() => setNewsTab("market")}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                newsTab === "market"
                  ? "bg-emerald-500 text-black"
                  : "border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"
              }`}
            >
              Market News
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {visibleNews.length === 0 ? (
            <div className="rounded-2xl border border-white/5 bg-[#1A1F2B] p-4 text-sm text-gray-400 md:col-span-2">
              No {newsTab === "stock" ? "stock" : "market"} news available.
            </div>
          ) : (
            visibleNews
              .slice(0, 4)
              .map((item: any, index: number) => (
                <NewsItem key={`${newsTab}-${item?.url || index}`} item={item} />
              ))
          )}
        </div>
      </div>

      <RefreshAiAnalysisModal
        isOpen={showAiRefreshModal}
        symbol={symbol}
        loading={refreshingAi}
        onClose={() => setShowAiRefreshModal(false)}
        onRefresh={handleRefreshAi}
      />
    </div>
  );
}