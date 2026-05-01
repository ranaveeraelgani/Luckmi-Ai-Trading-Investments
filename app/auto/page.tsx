"use client";

import { useEffect, useMemo, useState } from "react";
import TopNav from "@/components/TopNav";
import LuckmiAiIcon from "@/components/brand/LuckmiAiIcon";
import AddAutoStockModal from "@/components/auto/AddAutoStockModal";
import BuyMoreModal from "@/components/auto/BuyMoreModal";
import RunTradeCycleButton from "@/components/RunTradeCycleButton";
import BrokerStatusCard from "@/components/broker/BrokerStatusCard";
import AutoTradingGuideModal from "@/components/shared/AutoTradingGuideModal";

type AutoStock = {
  id: string;
  user_id?: string;
  symbol: string;
  allocation?: number;
  compound_profits?: boolean;
  rinse_repeat?: boolean;
  max_repeats?: number;
  repeat_counter?: number;
  status?: string;
  last_sell_time?: string | null;
  last_evaluated_price?: number | null;
  created_at?: string;
  has_open_position?: boolean;
  open_position?: {
    id: string;
    entry_price?: number;
    shares?: number;
    peak_price?: number | null;
    peak_pnl_percent?: number | null;
    entry_time?: string;
    updated_at?: string;
  } | null;
  last_ai_decision?: {
    action?: string;
    reason?: string;
    confidence?: number;
    ctsScore?: number;
    cts_score?: number;
    timestamp?: string;
    ctsBreakdown?: any;
    cts_breakdown?: any;
  } | null;
};

type EngineRun = {
  id?: string;
  status?: string;
  trades_executed?: number;
  error_message?: string | null;
  broker_mode?: string | null;
  created_at?: string;
};

type Quote = {
  symbol: string;
  price?: number | string | null;
  change?: number | string | null;
  changePercent?: number | string | null;
  percentChange?: number | string | null;
};

type Trade = {
  id?: string;
  symbol: string;
  type: string;
  shares?: number;
  price?: number;
  amount?: number;
  pnl?: number | null;
  reason?: string | null;
  confidence?: number | null;
  cts_score?: number | null;
  sell_score?: number | null;
  broker_mode?: string | null;
  created_at?: string;
};

type DetailTab = "overview" | "trades";
type StockFilter = "all" | "in-position" | "sell" | "idle";
type StockSort = "allocation" | "pnl" | "symbol";

type ConfirmAction = {
  kind: "sell" | "remove";
  stock: AutoStock;
} | null;

function toNumber(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function formatMoney(value?: number | string | null) {
  const num = Number(value);
  return Number.isFinite(num)
    ? `$${num.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
    : "—";
}

function formatCompactMoney(value?: number | string | null) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  if (Math.abs(num) >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (Math.abs(num) >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
  return `$${num.toFixed(0)}`;
}

function formatPercent(value?: number | string | null) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toFixed(2)}%`;
}

function parseRunTimestamp(value?: string | number | null): number | null {
  if (value === undefined || value === null) return null;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return null;
    return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
  }

  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDate(value?: string | null) {
  const timestamp = parseRunTimestamp(value);
  if (timestamp === null) return "—";
  return new Date(timestamp).toLocaleString();
}

function pnlClass(value: number) {
  if (value > 0) return "text-emerald-300";
  if (value < 0) return "text-red-300";
  return "text-white";
}

function statusClass(status?: string | null) {
  if (status === "in-position" || status === "success") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }

  if (status === "monitoring" || status === "idle") {
    return "border-blue-500/30 bg-blue-500/10 text-blue-300";
  }

  if (status === "blocked") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  }

  if (status === "failed") {
    return "border-red-500/30 bg-red-500/10 text-red-300";
  }

  return "border-white/10 bg-white/5 text-gray-300";
}

function scorePillClass(score?: number | string | null) {
  const n = Number(score);
  if (n >= 75) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (n >= 55) return "border-[#F5C76E]/30 bg-[#F5C76E]/10 text-[#F5C76E]";
  return "border-red-500/30 bg-red-500/10 text-red-300";
}

function normalizeTradeType(type?: string) {
  const t = String(type || "").toLowerCase();
  if (t === "buymore" || t === "buy_more") return "Buy More";
  if (t === "partial_sell" || t === "partialsell") return "Partial Sell";
  if (t === "buy") return "Buy";
  if (t === "sell") return "Sell";
  return type || "Trade";
}

function Card({
  title,
  subtitle,
  right,
  children,
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/5 bg-[#11151C] shadow-[0_0_40px_rgba(22,199,132,0.04)]">
      {(title || right) && (
        <div className="flex flex-col gap-3 border-b border-white/5 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
          <div>
            {title ? <h2 className="text-lg font-semibold text-white">{title}</h2> : null}
            {subtitle ? <p className="mt-1 text-sm text-gray-400">{subtitle}</p> : null}
          </div>
          {right}
        </div>
      )}

      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function Pill({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${className}`}>
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
    <div className="rounded-2xl border border-white/5 bg-[#1A1F2B] px-3 py-3">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-1 text-sm font-semibold text-white sm:text-base ${valueClassName}`}>
        {value}
      </div>
    </div>
  );
}

export default function AutoTradingPage() {
  const [autoStocks, setAutoStocks] = useState<AutoStock[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [lastRun, setLastRun] = useState<EngineRun | null>(null);
  const [tradeHistory, setTradeHistory] = useState<Record<string, Trade[]>>({});
  const [autoLogs, setAutoLogs] = useState<string[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBuyMoreModal, setShowBuyMoreModal] = useState(false);
  const [selectedAutoStock, setSelectedAutoStock] = useState<AutoStock | null>(null);
  const [selectedStockId, setSelectedStockId] = useState<string | null>(null);
  const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [engineExpanded, setEngineExpanded] = useState(false);
  const [portfolioCollapsed, setPortfolioCollapsed] = useState(false);
  const [engineCollapsed, setEngineCollapsed] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<StockFilter>("all");
  const [activeSort, setActiveSort] = useState<StockSort>("allocation");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [expandedTradeKeys, setExpandedTradeKeys] = useState<Record<string, boolean>>({});
  const [countdownNowMs, setCountdownNowMs] = useState(() => Date.now());
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [showGuideHighlight, setShowGuideHighlight] = useState(false);

  async function refreshDashboardData() {
    await Promise.all([fetchAutoStocks(), fetchLastRun(), fetchTrades()]);
    setLastUpdatedAt(new Date().toISOString());
  }

  useEffect(() => {
    void refreshDashboardData();
  }, []);

  useEffect(() => {
    const key = "auto_trading_guide_seen_v1";

    try {
      const seen = window.localStorage.getItem(key) === "1";
      if (!seen) {
        setShowGuideModal(true);
        setShowGuideHighlight(true);
      }
    } catch {
      // Ignore storage errors and continue without persistence.
    }
  }, []);

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshDashboardData();
      }
    };

    const intervalId = window.setInterval(refreshIfVisible, 30_000);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCountdownNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  async function fetchAutoStocks() {
    try {
      const res = await fetch("/api/auto-stocks", { cache: "no-store" });
      const data = await res.json();

      const stocks = Array.isArray(data) ? data : data?.stocks || [];
      setAutoStocks(stocks);

      const symbols = stocks.map((s: AutoStock) => s.symbol).filter(Boolean);
      if (symbols.length > 0) await fetchQuotes(symbols);
    } catch (err) {
      console.error("Failed to load auto stocks", err);
      setAutoStocks([]);
    }
  }

  async function fetchQuotes(symbols: string[]) {
    try {
      const res = await fetch(`/api/quotes?symbols=${symbols.join(",")}`, {
        cache: "no-store",
      });

      if (!res.ok) return;

      const data = await res.json();
      const rows = Array.isArray(data) ? data : [];

      const map: Record<string, Quote> = {};
      rows.forEach((q: Quote) => {
        if (q?.symbol) map[q.symbol] = q;
      });

      setQuotes(map);
    } catch (err) {
      console.error("Failed to load quotes", err);
    }
  }

  async function fetchLastRun() {
    try {
      const res = await fetch("/api/engine/last-run", { cache: "no-store" });
      const data = await res.json();
      setLastRun(data || null);
    } catch (err) {
      console.error("Failed to load last run", err);
      setLastRun(null);
    }
  }

  async function fetchTrades() {
    try {
      const res = await fetch("/api/trades?limit=100", { cache: "no-store" });
      if (!res.ok) return;

      const data = await res.json();
      const trades = Array.isArray(data) ? data : data?.trades || [];

      const grouped = trades.reduce((acc: Record<string, Trade[]>, trade: Trade) => {
        const symbol = trade.symbol || "UNKNOWN";
        if (!acc[symbol]) acc[symbol] = [];
        acc[symbol].push(trade);
        return acc;
      }, {});

      setTradeHistory(grouped);
    } catch (err) {
      console.error("Failed to load trades", err);
    }
  }

  function addToAutoLog(message: string) {
    setAutoLogs((prev) => [`${new Date().toLocaleTimeString()} • ${message}`, ...prev].slice(0, 12));
  }

  async function handleBuyMore(stock: AutoStock, amount: number) {
    try {
      setActionLoadingId(stock.id);

      const res = await fetch("/api/auto-stocks/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: stock.id,
          allocation: toNumber(stock.allocation) + amount,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to add capital");
      }

      await fetchAutoStocks();
      addToAutoLog(`${stock.symbol} allocation increased by ${formatMoney(amount)}`);
      setLastUpdatedAt(new Date().toISOString());
    } finally {
      setActionLoadingId(null);
    }
  }

  async function deleteAutoStock(stock: AutoStock) {
    if (stock.has_open_position) {
      addToAutoLog(`Cannot remove ${stock.symbol} while position is open`);
      return;
    }

    try {
      setActionLoadingId(stock.id);

      const res = await fetch("/api/auto-stocks/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: stock.id }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to remove stock");
      }

      await fetchAutoStocks();
      addToAutoLog(`${stock.symbol} removed from Auto Trading`);
      setLastUpdatedAt(new Date().toISOString());
    } catch (err: any) {
      addToAutoLog(err?.message || `Failed to remove ${stock.symbol}`);
    } finally {
      setActionLoadingId(null);
    }
  }

  async function sellNow(stock: AutoStock) {
    if (!stock.has_open_position) {
      addToAutoLog(`${stock.symbol} has no open position`);
      return;
    }

    try {
      setActionLoadingId(stock.id);

      const res = await fetch("/api/auto-stocks/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: stock.id }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to sell position");
      }

      await fetchAutoStocks();
      await fetchLastRun();
      await fetchTrades();
      setLastUpdatedAt(new Date().toISOString());

      addToAutoLog(`${stock.symbol} sell submitted`);
    } catch (err: any) {
      addToAutoLog(err?.message || `Failed to sell ${stock.symbol}`);
    } finally {
      setActionLoadingId(null);
    }
  }

  const totalAllocation = useMemo(
    () => autoStocks.reduce((sum, s) => sum + toNumber(s.allocation), 0),
    [autoStocks]
  );

  const openPositions = useMemo(
    () => autoStocks.filter((s) => s.has_open_position),
    [autoStocks]
  );

  const totalUnrealized = useMemo(() => {
    return autoStocks.reduce((sum, stock) => {
      if (!stock.has_open_position || !stock.open_position) return sum;

      const quote = quotes[stock.symbol];
      const currentPrice = toNumber(quote?.price);
      const entry = toNumber(stock.open_position.entry_price);
      const shares = toNumber(stock.open_position.shares);

      return sum + (currentPrice - entry) * shares;
    }, 0);
  }, [autoStocks, quotes]);

  const totalTrades = useMemo(
    () => Object.values(tradeHistory).reduce((sum, arr) => sum + arr.length, 0),
    [tradeHistory]
  );

  const visibleStocks = useMemo(() => {
    const filtered = autoStocks.filter((stock) => {
      if (activeFilter === "in-position") return Boolean(stock.has_open_position);
      if (activeFilter === "idle") {
        const status = String(stock.status || "").toLowerCase();
        return !stock.has_open_position || status === "idle";
      }
      if (activeFilter === "sell") {
        return String(stock.last_ai_decision?.action || "").toLowerCase().includes("sell");
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (activeSort === "symbol") return a.symbol.localeCompare(b.symbol);

      if (activeSort === "allocation") {
        return toNumber(b.allocation) - toNumber(a.allocation);
      }

      const pnlFor = (stock: AutoStock) => {
        if (!stock.has_open_position || !stock.open_position) return -Infinity;
        const price = toNumber(quotes[stock.symbol]?.price);
        const entry = toNumber(stock.open_position.entry_price);
        const shares = toNumber(stock.open_position.shares);
        return (price - entry) * shares;
      };

      return pnlFor(b) - pnlFor(a);
    });
  }, [activeFilter, activeSort, autoStocks, quotes]);

  const selectedStock = useMemo(
    () => autoStocks.find((stock) => stock.id === selectedStockId) || null,
    [autoStocks, selectedStockId]
  );

  const selectedStockTrades = useMemo(() => {
    if (!selectedStock?.symbol) return [];
    return tradeHistory[selectedStock.symbol] || [];
  }, [selectedStock, tradeHistory]);

  useEffect(() => {
    if (!selectedStockId) return;

    const exists = autoStocks.some((stock) => stock.id === selectedStockId);
    if (!exists) {
      setSelectedStockId(null);
      setIsDetailSheetOpen(false);
    }
  }, [autoStocks, selectedStockId]);

  useEffect(() => {
    setExpandedTradeKeys({});
  }, [selectedStockId]);

  useEffect(() => {
    if (!isDetailSheetOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsDetailSheetOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isDetailSheetOpen]);

  const shouldScrollAutoStocks = visibleStocks.length > 3;

  const filterChips: { key: StockFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "in-position", label: "In Position" },
    { key: "sell", label: "Sell" },
    { key: "idle", label: "Idle" },
  ];

  const sortChips: { key: StockSort; label: string }[] = [
    { key: "allocation", label: "Sort: Allocation" },
    { key: "pnl", label: "Sort: P&L" },
    { key: "symbol", label: "Sort: Symbol" },
  ];

  const confirmActionLabel =
    confirmAction?.kind === "sell" ? "Sell Position" : "Remove Stock";

  function getNextRunCountdown(lastRunAt?: string | null): string {
    const lastRunMs = parseRunTimestamp(lastRunAt);
    if (lastRunMs === null) return "--:--";

    const nextRunMs = lastRunMs + 20 * 60 * 1000;
    const remainingMs = nextRunMs - countdownNowMs;

    if (remainingMs <= 0) return "Ready now";

    const minutes = Math.floor(remainingMs / 60000);
    const seconds = Math.floor((remainingMs % 60000) / 1000);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  async function runConfirmAction() {
    if (!confirmAction) return;

    if (confirmAction.kind === "sell") {
      await sellNow(confirmAction.stock);
    } else {
      await deleteAutoStock(confirmAction.stock);
    }

    setConfirmAction(null);
  }

  function closeGuideModal() {
    const key = "auto_trading_guide_seen_v1";
    setShowGuideModal(false);
    setShowGuideHighlight(false);

    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // Ignore storage errors and continue.
    }
  }

  return (
    <div className="min-h-screen bg-[#0F1117] text-white">
      <TopNav activePage="auto" />

      <main className="p-4 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold sm:text-3xl">Auto Trading</h1>
                <Pill className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                  Paper Trading
                </Pill>
              </div>

              <p className="mt-2 max-w-3xl text-sm text-gray-400">
                Your AI-managed paper trading workspace. Review positions, AI analysis, broker status, and trade timelines in one place.
              </p>
              <p className="mt-1 text-xs text-gray-500">Last updated: {formatDate(lastUpdatedAt)}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowGuideModal(true)}
                className={`relative rounded-2xl border px-4 py-2.5 text-sm font-medium transition ${
                  showGuideHighlight
                    ? "animate-pulse border-[#F5C76E]/50 bg-[#F5C76E]/15 text-[#F5C76E]"
                    : "border-[#F5C76E]/30 bg-[#F5C76E]/10 text-[#F5C76E] hover:bg-[#F5C76E]/20"
                }`}
              >
                How Auto Trading Works
                {showGuideHighlight ? (
                  <span className="absolute -right-1.5 -top-1.5 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-semibold text-black">
                    New
                  </span>
                ) : null}
              </button>

              <button
                onClick={() => setShowAddModal(true)}
                className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-emerald-400"
              >
                + Add Auto Stock
              </button>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.35fr_.9fr]">
            <section className="rounded-3xl border border-white/5 bg-[#11151C] shadow-[0_0_40px_rgba(22,199,132,0.04)]">
              <button
                type="button"
                onClick={() => setPortfolioCollapsed((p) => !p)}
                className="flex w-full items-center justify-between gap-3 px-4 py-4 sm:px-5"
                aria-expanded={!portfolioCollapsed}
              >
                <div className="text-left">
                  <h2 className="text-lg font-semibold text-white">Auto Portfolio Summary</h2>
                  {portfolioCollapsed ? (
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      <span className="text-sm font-semibold text-white">{formatMoney(totalAllocation)}</span>
                      <span className="text-xs text-gray-500">allocation</span>
                      <span className={`text-sm font-semibold ${pnlClass(totalUnrealized)}`}>
                        {totalUnrealized >= 0 ? "+" : ""}{formatMoney(totalUnrealized)}
                      </span>
                      <span className="text-xs text-gray-500">P&L</span>
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-gray-400">Allocation health and unrealized performance at a glance.</p>
                  )}
                </div>
                <span className="text-xs text-gray-500">{portfolioCollapsed ? "▼" : "▲"}</span>
              </button>

              {!portfolioCollapsed && (
                <div className="border-t border-white/5 p-4 sm:p-5">
                  <div className="space-y-5">
                    <div className="flex flex-row gap-4 justify-between">
                      <div>
                        <div className="text-sm text-gray-400">Total Allocation</div>
                        <div className="mt-1 text-2xl font-semibold text-white">{formatMoney(totalAllocation)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-400">Unrealized P&L</div>
                        <div className={`mt-1 text-2xl font-semibold ${pnlClass(totalUnrealized)}`}>
                          {totalUnrealized >= 0 ? "+" : ""}{formatMoney(totalUnrealized)}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                      <MiniMetric label="Tracked" value={autoStocks.length} />
                      <MiniMetric label="Open Positions" value={openPositions.length} valueClassName="text-emerald-300" />
                      <MiniMetric label="Last Run" value={lastRun?.status || "never"} />
                      <MiniMetric label="Trades" value={lastRun?.trades_executed ?? 0} />
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-white/5 bg-[#11151C] shadow-[0_0_40px_rgba(22,199,132,0.04)]">
              <div className="flex items-start justify-between gap-3 px-4 py-4 sm:px-5">
                <button
                  type="button"
                  onClick={() => setEngineCollapsed((p) => !p)}
                  className="min-w-0 flex-1 text-left"
                  aria-expanded={!engineCollapsed}
                >
                  <h2 className="text-lg font-semibold text-white">Engine Control</h2>
                  <div className="mt-1 text-xs text-gray-500">
                    Last run: {formatDate(lastRun?.created_at)} • Next run: {getNextRunCountdown(lastRun?.created_at)}
                  </div>
                  {engineCollapsed ? (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Pill className={statusClass(lastRun?.status)}>{lastRun?.status || "never"}</Pill>
                      <Pill className="border-white/10 bg-white/5 text-gray-300">AI {isAiThinking ? "Running" : "Idle"}</Pill>
                      <span className="text-xs text-gray-500">{engineCollapsed ? "▼" : "▲"}</span>
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-gray-400">Run a manual cycle anytime, then open details only when you need them.</p>
                  )}
                </button>
                <div className="flex items-center gap-2">
                  {!engineCollapsed && (
                    <span className="text-xs text-gray-500">▲</span>
                  )}
                  <RunTradeCycleButton
                    fetchAutoStocks={fetchAutoStocks}
                    fetchLastRun={fetchLastRun}
                    addToAutoLog={addToAutoLog}
                    setIsAiThinking={setIsAiThinking}
                    className="px-4 py-2 text-sm"
                  />
                </div>
              </div>

              {!engineCollapsed && (
                <div className="border-t border-white/5 p-4 sm:p-5">
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <Pill className={statusClass(lastRun?.status)}>{lastRun?.status || "never"}</Pill>
                      <Pill className="border-white/10 bg-white/5 text-gray-300">AI {isAiThinking ? "Running" : "Idle"}</Pill>
                      {lastRun?.broker_mode ? (
                        <Pill className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">{lastRun.broker_mode}</Pill>
                      ) : null}
                    </div>
                    <button
                      onClick={() => setEngineExpanded((prev) => !prev)}
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-gray-300 transition hover:bg-white/10"
                    >
                      {engineExpanded ? "Hide engine state" : "Show engine state"}
                    </button>
                    {engineExpanded && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <MiniMetric label="Status" value={lastRun?.status || "—"} />
                        <MiniMetric label="Trades" value={lastRun?.trades_executed ?? 0} />
                        <MiniMetric label="Mode" value={lastRun?.broker_mode || "paper"} />
                        <MiniMetric label="Error" value={lastRun?.error_message || "—"} />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>

          <BrokerStatusCard />

          <Card
            title="Auto Stock List"
            subtitle="Filter by position state or sell signal. Tap a stock for overview and AI analysis."
            right={
              <Pill className="border-white/10 bg-white/5 text-gray-300">
                {totalTrades} trades
              </Pill>
            }
          >
            {autoStocks.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/10 bg-[#1A1F2B] p-10 text-center">
                <div className="text-lg font-medium text-white">No auto stocks yet</div>
                <p className="mt-2 text-sm text-gray-400">Add your first stock and let Luckmi AI monitor paper trades for you.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2 rounded-2xl bg-[#0D121A]/70 p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {filterChips.map((chip) => (
                      <button
                        key={chip.key}
                        type="button"
                        onClick={() => setActiveFilter(chip.key)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                          activeFilter === chip.key
                            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                            : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"
                        }`}
                        aria-pressed={activeFilter === chip.key}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {sortChips.map((chip) => (
                      <button
                        key={chip.key}
                        type="button"
                        onClick={() => setActiveSort(chip.key)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                          activeSort === chip.key
                            ? "border-[#F5C76E]/40 bg-[#F5C76E]/15 text-[#F5C76E]"
                            : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"
                        }`}
                        aria-pressed={activeSort === chip.key}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>

                {visibleStocks.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-[#1A1F2B] p-6 text-center text-sm text-gray-400">
                    No stocks match this filter right now.
                  </div>
                ) : (
                  <div
                    className={`space-y-4 ${
                      shouldScrollAutoStocks ? "max-h-[70vh] overflow-y-auto pr-1" : ""
                    }`}
                  >
                    <div className="-mx-1.5 space-y-4 px-1.5 sm:-mx-2 sm:px-2">
                    {visibleStocks.map((stock) => {
                  const quote = quotes[stock.symbol];
                  const price = toNumber(quote?.price);
                  const change = toNumber(quote?.changePercent ?? quote?.percentChange);
                  const shares = toNumber(stock.open_position?.shares);
                  const entry = toNumber(stock.open_position?.entry_price);
                  const pnl = stock.has_open_position ? (price - entry) * shares : 0;
                  const ai = stock.last_ai_decision;

                  return (
                    <div
                      key={stock.id}
                      className="rounded-3xl border border-white/[0.04] bg-[#0F1117] p-3.5 transition hover:border-white/10 sm:p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedStockId(stock.id);
                            setDetailTab("overview");
                            setIsDetailSheetOpen(true);
                          }}
                          className="min-w-0 flex-1 text-left"
                          aria-label={`Open ${stock.symbol} details`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-xl font-semibold text-white">{stock.symbol}</div>
                            {change !== 0 ? (
                              <span className={`text-sm font-semibold ${change >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                                {change >= 0 ? "+" : ""}{change.toFixed(2)}%
                              </span>
                            ) : null}
                            <Pill className={statusClass(stock.status)}>{stock.status || "idle"}</Pill>
                            {ai?.action ? (
                              <Pill className="border-[#F5C76E]/30 bg-[#F5C76E]/10 text-[#F5C76E]">
                                AI {ai.action}
                              </Pill>
                            ) : null}
                          </div>
                          <div className="mt-1 text-xs text-gray-500">Tap to view overview and AI analysis</div>
                        </button>

                        {stock.has_open_position ? (
                          <button
                            type="button"
                            onClick={() => setConfirmAction({ kind: "sell", stock })}
                            disabled={actionLoadingId === stock.id}
                            aria-label={`Sell ${stock.symbol}`}
                            title={`Sell ${stock.symbol}`}
                            className="inline-flex h-9 items-center justify-center rounded-full border border-[#F5C76E]/40 bg-[#F5C76E]/12 px-3 text-xs font-semibold text-[#F5C76E] transition hover:bg-[#F5C76E]/20 disabled:opacity-50"
                          >
                            Sell
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmAction({ kind: "remove", stock })}
                            disabled={actionLoadingId === stock.id}
                            aria-label={`Remove ${stock.symbol}`}
                            title={`Remove ${stock.symbol}`}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-500/40 bg-red-500/10 text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              className="h-4 w-4"
                              aria-hidden="true"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 6V4h8v2" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l1 14h10l1-14" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M10 10v7M14 10v7" />
                            </svg>
                          </button>
                        )}
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-3 text-right sm:grid-cols-6">
                        <MiniMetric label="Price" value={formatMoney(price)} />
                        <MiniMetric
                          label="Move"
                          value={formatPercent(change)}
                          valueClassName={change >= 0 ? "text-emerald-300" : "text-red-300"}
                        />
                        <MiniMetric label="Shares" value={shares || 0} />
                        <MiniMetric label="Allocated" value={formatCompactMoney(stock.allocation)} />
                        <MiniMetric
                          label="P&L"
                          value={`${pnl >= 0 ? "+" : ""}${formatCompactMoney(pnl)}`}
                          valueClassName={pnlClass(pnl)}
                        />
                        <MiniMetric
                          label="Decision"
                          value={ai?.action || "—"}
                          valueClassName="text-[#F5C76E]"
                        />
                      </div>
                    </div>
                    );
                  })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card title="Activity Log" subtitle="Recent engine events and actions taken on this page.">
            {autoLogs.length === 0 ? (
              <div className="text-sm text-gray-400">No activity yet. Run a cycle or take an action to populate this log.</div>
            ) : (
              <div className="space-y-2">
                {(showAllActivity ? autoLogs : autoLogs.slice(0, 4)).map((log, index) => (
                  <div key={`${log}-${index}`} className="rounded-2xl bg-[#1A1F2B] p-3 text-sm text-gray-300">
                    {log}
                  </div>
                ))}
                {autoLogs.length > 4 ? (
                  <button
                    type="button"
                    onClick={() => setShowAllActivity((prev) => !prev)}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-gray-300 transition hover:bg-white/10"
                  >
                    {showAllActivity ? "Show less" : "Show all activity"}
                  </button>
                ) : null}
              </div>
            )}
          </Card>

          {isDetailSheetOpen && selectedStock ? (
            <div className="fixed inset-0 z-50">
              <button
                type="button"
                className="absolute inset-0 bg-black/60"
                onClick={() => setIsDetailSheetOpen(false)}
                aria-label="Close stock details"
              />

              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="stock-detail-title"
                className="absolute bottom-0 left-0 right-0 max-h-[90vh] rounded-t-3xl border-t border-white/10 bg-[#0F1117] shadow-2xl"
              >
                <div className="mx-auto mt-3 h-1.5 w-14 rounded-full bg-white/20" />

                <div className="flex items-start justify-between gap-3 border-b border-white/5 px-4 py-4">
                  <div>
                    <h3 id="stock-detail-title" className="text-xl font-semibold text-white">
                      {selectedStock.symbol}
                    </h3>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <Pill className={statusClass(selectedStock.status)}>
                        {selectedStock.status || "idle"}
                      </Pill>
                      {selectedStock.last_ai_decision?.action ? (
                        <Pill className="border-[#F5C76E]/30 bg-[#F5C76E]/10 text-[#F5C76E]">
                          AI {selectedStock.last_ai_decision.action}
                        </Pill>
                      ) : null}
                      {selectedStock.last_ai_decision?.ctsScore ?? selectedStock.last_ai_decision?.cts_score ? (
                        <Pill className={scorePillClass(selectedStock.last_ai_decision?.ctsScore ?? selectedStock.last_ai_decision?.cts_score)}>
                          Luckmi Score {selectedStock.last_ai_decision?.ctsScore ?? selectedStock.last_ai_decision?.cts_score}
                        </Pill>
                      ) : null}
                      {selectedStock.last_ai_decision?.confidence != null ? (
                        <Pill className="border-white/10 bg-white/5 text-gray-300">
                          {selectedStock.last_ai_decision.confidence}% confidence
                        </Pill>
                      ) : null}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsDetailSheetOpen(false)}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-gray-300 transition hover:bg-white/10"
                    aria-label={`Close ${selectedStock.symbol} details`}
                  >
                    ✕
                  </button>
                </div>

                <div className="flex gap-2 border-b border-white/5 px-4 py-3">
                  {([
                    ["overview", "Overview"],
                    ["trades", "Trades"],
                  ] as [DetailTab, string][]).map(([tabValue, tabLabel]) => (
                    <button
                      key={tabValue}
                      type="button"
                      onClick={() => setDetailTab(tabValue)}
                      className={`rounded-2xl px-3 py-2 text-sm font-medium transition ${
                        detailTab === tabValue
                          ? "bg-emerald-500 text-black"
                          : "border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"
                      }`}
                      aria-pressed={detailTab === tabValue}
                    >
                      {tabLabel}
                    </button>
                  ))}
                </div>

                <div className="max-h-[52vh] space-y-4 overflow-y-auto px-4 py-4">
                  {detailTab === "overview" ? (
                    <div className="space-y-4">
                      {(() => {
                        const quote = quotes[selectedStock.symbol];
                        const price = toNumber(quote?.price);
                        const shares = toNumber(selectedStock.open_position?.shares);
                        const entry = toNumber(selectedStock.open_position?.entry_price);
                        const invested = shares * entry;
                        const available = Math.max(0, toNumber(selectedStock.allocation) - invested);
                        const pnl = selectedStock.has_open_position ? (price - entry) * shares : 0;

                        return (
                          <div className="space-y-4">
                            <div className="grid grid-cols-3 gap-3">
                              <MiniMetric label="Current" value={formatMoney(price)} />
                              <MiniMetric label="Entry" value={entry ? formatMoney(entry) : "—"} />
                              <MiniMetric label="Shares" value={shares || 0} />
                              <MiniMetric label="Allocated" value={formatCompactMoney(selectedStock.allocation)} />
                              <MiniMetric label="Invested" value={formatCompactMoney(invested)} />
                              <MiniMetric
                                label="Unrealized"
                                value={`${pnl >= 0 ? "+" : ""}${formatCompactMoney(pnl)}`}
                                valueClassName={pnlClass(pnl)}
                              />
                            </div>

                            <div className="rounded-3xl border border-[#F5C76E]/20 bg-gradient-to-b from-[#F5C76E]/[0.06] to-[#F5C76E]/[0.02] p-5 shadow-[0_0_40px_rgba(245,199,110,0.06)]">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  <LuckmiAiIcon size={36} />
                                  <div>
                                    <div className="text-base font-bold tracking-tight text-white">AI Analysis</div>
                                    <div className="mt-0.5 text-xs text-gray-400">Most recent AI decision from the last engine run</div>
                                  </div>
                                </div>
                                <Pill className="border-[#F5C76E]/30 bg-[#F5C76E]/10 text-[#F5C76E] text-xs">
                                  {selectedStock.last_ai_decision?.action || "No Decision"}
                                </Pill>
                              </div>

                              <div className="relative mt-4">
                                <div className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-2xl border border-white/5 bg-[#0A0E14] p-4 pr-5 text-sm leading-7 text-gray-200 shadow-inner">
                                  {selectedStock.last_ai_decision?.reason || "No AI analysis yet. Run a manual cycle to generate a fresh decision."}
                                </div>
                                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-2xl bg-gradient-to-t from-[#0A0E14] to-transparent" />
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ) : null}

                  {detailTab === "trades" ? (
                    selectedStockTrades.length === 0 ? (
                      <div className="rounded-3xl border border-dashed border-white/10 bg-[#1A1F2B] p-8 text-center text-sm text-gray-400">
                        No filled trade history for {selectedStock.symbol} yet.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {selectedStockTrades.map((trade, index) => {
                          const tradeKey = trade.id || `${selectedStock.symbol}-${index}-${trade.created_at || "trade"}`;
                          const isExpanded = Boolean(expandedTradeKeys[tradeKey]);
                          const confidence = Number(trade.confidence);
                          const hasConfidence = Number.isFinite(confidence);

                          return (
                            <div key={tradeKey} className="rounded-3xl border border-white/5 bg-[#0F1117] p-4">
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium text-white">
                                    {normalizeTradeType(trade.type)} · {trade.shares ?? 0} shares
                                  </div>
                                  <div className="mt-1 text-xs text-gray-500">{formatDate(trade.created_at)}</div>
                                </div>

                                <div className="text-right">
                                  <div className="font-mono text-sm text-white">{formatMoney(trade.price)}</div>
                                  {trade.pnl !== null && trade.pnl !== undefined ? (
                                    <div className={`mt-1 font-mono text-sm ${pnlClass(toNumber(trade.pnl))}`}>
                                      {toNumber(trade.pnl) >= 0 ? "+" : ""}
                                      {formatMoney(trade.pnl)}
                                    </div>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedTradeKeys((prev) => ({
                                        ...prev,
                                        [tradeKey]: !prev[tradeKey],
                                      }))
                                    }
                                    className="mt-2 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-gray-300 transition hover:bg-white/10"
                                    aria-expanded={isExpanded}
                                    aria-controls={`trade-ai-${tradeKey}`}
                                  >
                                    {isExpanded ? "Hide AI Decision" : "Show AI Decision"}
                                  </button>
                                </div>
                              </div>

                              {isExpanded ? (
                                <div
                                  id={`trade-ai-${tradeKey}`}
                                  className="mt-3 rounded-3xl border border-[#F5C76E]/20 bg-gradient-to-b from-[#F5C76E]/[0.06] to-[#F5C76E]/[0.02] p-4 shadow-[0_0_30px_rgba(245,199,110,0.05)]"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5">
                                      <LuckmiAiIcon size={28} />
                                      <div>
                                        <div className="text-sm font-bold tracking-tight text-white">AI Decision</div>
                                        <div className="text-[10px] text-gray-400">{normalizeTradeType(trade.type)} · {formatDate(trade.created_at)}</div>
                                      </div>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {hasConfidence ? (
                                        <Pill className="border-[#F5C76E]/30 bg-[#F5C76E]/10 text-[#F5C76E]">
                                          {Math.round(confidence)}% conf
                                        </Pill>
                                      ) : null}
                                      {trade.cts_score !== null && trade.cts_score !== undefined ? (
                                        <Pill className={scorePillClass(trade.cts_score)}>CTS {trade.cts_score}</Pill>
                                      ) : null}
                                      {trade.sell_score !== null && trade.sell_score !== undefined ? (
                                        <Pill className="border-red-500/30 bg-red-500/10 text-red-300">
                                          Sell {trade.sell_score}
                                        </Pill>
                                      ) : null}
                                    </div>
                                  </div>
                                  <div className="relative mt-3">
                                    <div className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-2xl border border-white/5 bg-[#0A0E14] p-3 pr-4 text-sm leading-7 text-gray-200 shadow-inner">
                                      {trade.reason || "No AI reasoning text was saved for this trade."}
                                    </div>
                                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 rounded-b-2xl bg-gradient-to-t from-[#0A0E14] to-transparent" />
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )
                  ) : null}
                </div>

                <div className="border-t border-white/5 bg-[#0B0F17] px-4 py-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAutoStock(selectedStock);
                      setShowBuyMoreModal(true);
                    }}
                    disabled={actionLoadingId === selectedStock.id}
                    className="min-h-11 w-full rounded-2xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-50"
                    aria-label={`Add capital to ${selectedStock.symbol}`}
                  >
                    Add Capital
                  </button>
                </div>
              </section>
            </div>
          ) : null}

          <AddAutoStockModal
            isOpen={showAddModal}
            onClose={() => setShowAddModal(false)}
            onCreated={async (createdStock) => {
              await fetchAutoStocks();
              addToAutoLog(`${createdStock?.symbol || "Stock"} added to Auto Trading`);
              setLastUpdatedAt(new Date().toISOString());
            }}
          />

          <BuyMoreModal
            isOpen={showBuyMoreModal}
            stock={selectedAutoStock}
            currentPrice={
              selectedAutoStock
                ? toNumber(quotes[selectedAutoStock.symbol]?.price)
                : 0
            }
            onClose={() => {
              setShowBuyMoreModal(false);
              setSelectedAutoStock(null);
            }}
            onConfirm={async (amount) => {
              if (!selectedAutoStock) return;
              await handleBuyMore(selectedAutoStock, amount);
              setShowBuyMoreModal(false);
              setSelectedAutoStock(null);
            }}
          />

          {confirmAction ? (
            <div className="fixed inset-0 z-[60]">
              <button
                type="button"
                className="absolute inset-0 bg-black/70"
                onClick={() => setConfirmAction(null)}
                aria-label="Close confirmation"
              />
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="confirm-action-title"
                className="absolute left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-white/10 bg-[#0F141E] p-5 shadow-2xl"
              >
                <h3 id="confirm-action-title" className="text-lg font-semibold text-white">
                  {confirmActionLabel}
                </h3>
                <p className="mt-2 text-sm text-gray-300">
                  {confirmAction.kind === "sell"
                    ? `Sell ${confirmAction.stock.symbol} immediately at market price?`
                    : `Remove ${confirmAction.stock.symbol} from Auto Trading?`}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {confirmAction.kind === "sell"
                    ? "This closes the current position for this stock."
                    : "This only removes tracking. No broker position is closed here."}
                </p>

                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmAction(null)}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-gray-300 transition hover:bg-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={runConfirmAction}
                    disabled={actionLoadingId === confirmAction.stock.id}
                    className={`rounded-2xl px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
                      confirmAction.kind === "sell"
                        ? "bg-[#F5C76E] text-black hover:bg-[#ffd78a]"
                        : "bg-red-500 text-white hover:bg-red-400"
                    }`}
                  >
                    {actionLoadingId === confirmAction.stock.id
                      ? "Processing..."
                      : confirmAction.kind === "sell"
                      ? "Confirm Sell"
                      : "Confirm Remove"}
                  </button>
                </div>
              </section>
            </div>
          ) : null}

          <AutoTradingGuideModal
            isOpen={showGuideModal}
            onClose={closeGuideModal}
          />
        </div>
      </main>
    </div>
  );
}