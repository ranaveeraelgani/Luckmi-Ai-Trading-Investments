"use client";

import { useEffect, useMemo, useState } from "react";
import TopNav from "@/components/TopNav";
import LuckmiAiIcon from "@/components/brand/LuckmiAiIcon";
import AddAutoStockModal from "@/components/auto/AddAutoStockModal";
import BuyMoreModal from "@/components/auto/BuyMoreModal";
import RunTradeCycleButton from "@/components/RunTradeCycleButton";
import BrokerStatusCard from "@/components/broker/BrokerStatusCard";

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
  trades_count?: number;
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

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
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
  const [openStocks, setOpenStocks] = useState<Record<string, boolean>>({});
  const [openTrades, setOpenTrades] = useState<Record<string, boolean>>({});
  const [engineExpanded, setEngineExpanded] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);

  useEffect(() => {
    fetchAutoStocks();
    fetchLastRun();
    fetchTrades();
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
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleDeleteAutoStock(stock: AutoStock) {
    if (stock.has_open_position) {
      addToAutoLog(`Cannot remove ${stock.symbol} while position is open`);
      return;
    }

    if (!window.confirm(`Remove ${stock.symbol} from Auto Trading?`)) return;

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
    } catch (err: any) {
      addToAutoLog(err?.message || `Failed to remove ${stock.symbol}`);
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleSellNow(stock: AutoStock) {
    if (!stock.has_open_position) {
      addToAutoLog(`${stock.symbol} has no open position`);
      return;
    }

    if (!window.confirm(`Sell ${stock.symbol} now?`)) return;

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
                Your AI-managed trading workspace. Review positions, AI reasoning, broker status, and trade timelines in one clean view.
              </p>
            </div>

            <button
              onClick={() => setShowAddModal(true)}
              className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-emerald-400"
            >
              + Add Auto Stock
            </button>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.35fr_.9fr]">
            <Card title="Auto Portfolio Summary" subtitle="Compact view of automation health and capital usage.">
              <div className="space-y-5">
                <div className="flex flex-row gap-4 justify-between sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-sm text-gray-400">Total Allocation</div>
                    <div className="mt-1 text-2xl font-semibold text-white">
                      {formatMoney(totalAllocation)}
                    </div>
                  </div>

                  <div className="sm:text-right">
                    <div className="text-sm text-gray-400">Unrealized P&L</div>
                    <div className={`mt-1 text-2xl font-semibold ${pnlClass(totalUnrealized)}`}>
                      {totalUnrealized >= 0 ? "+" : ""}
                      {formatMoney(totalUnrealized)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <MiniMetric label="Tracked" value={autoStocks.length} />
                  <MiniMetric label="Open Positions" value={openPositions.length} valueClassName="text-emerald-300" />
                  <MiniMetric label="Last Run" value={lastRun?.status || "never"} />
                  <MiniMetric label="Trades" value={lastRun?.trades_executed ?? lastRun?.trades_count ?? 0} />
                </div>
              </div>
            </Card>

            <Card
              title="Engine Control"
              subtitle="Run the AI trade cycle and inspect state only when needed."
              right={
                <RunTradeCycleButton
                  fetchAutoStocks={fetchAutoStocks}
                  fetchLastRun={fetchLastRun}
                  addToAutoLog={addToAutoLog}
                  setIsAiThinking={setIsAiThinking}
                />
              }
            >
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Pill className={statusClass(lastRun?.status)}>
                    {lastRun?.status || "never"}
                  </Pill>
                  <Pill className="border-white/10 bg-white/5 text-gray-300">
                    AI {isAiThinking ? "Running" : "Idle"}
                  </Pill>
                  {lastRun?.broker_mode ? (
                    <Pill className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                      {lastRun.broker_mode}
                    </Pill>
                  ) : null}
                </div>

                <div className="text-sm text-gray-400">
                  Last run: {formatDate(lastRun?.created_at)}
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
                    <MiniMetric label="Trades" value={lastRun?.trades_executed ?? lastRun?.trades_count ?? 0} />
                    <MiniMetric label="Mode" value={lastRun?.broker_mode || "paper"} />
                    <MiniMetric label="Error" value={lastRun?.error_message || "—"} />
                  </div>
                )}
              </div>
            </Card>
          </div>

          <BrokerStatusCard />

          <Card
            title="Auto Stock List"
            subtitle="Collapsed by default. Open a stock to review AI reason, capital, and actions."
          >
            {autoStocks.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/10 bg-[#1A1F2B] p-10 text-center">
                <div className="text-lg font-medium text-white">No auto stocks yet</div>
                <p className="mt-2 text-sm text-gray-400">Add a stock to let Luckmi AI monitor paper trades.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {autoStocks.map((stock) => {
                  const quote = quotes[stock.symbol];
                  const price = toNumber(quote?.price);
                  const change = toNumber(quote?.changePercent ?? quote?.percentChange);
                  const shares = toNumber(stock.open_position?.shares);
                  const entry = toNumber(stock.open_position?.entry_price);
                  const invested = shares * entry;
                  const available = Math.max(0, toNumber(stock.allocation) - invested);
                  const pnl = stock.has_open_position ? (price - entry) * shares : 0;
                  const isOpen = Boolean(openStocks[stock.id]);
                  const ai = stock.last_ai_decision;
                  const cts = ai?.ctsScore ?? ai?.cts_score ?? "—";

                  return (
                    <div key={stock.id} className="rounded-3xl border border-white/5 bg-[#0F1117] p-4">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenStocks((prev) => ({
                            ...prev,
                            [stock.id]: !prev[stock.id],
                          }))
                        }
                        className="flex w-full flex-col gap-4 text-left lg:flex-row lg:items-center lg:justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <div className="text-xs text-gray-500">{isOpen ? "▲" : "▼"}</div>

                          <div>
                            <div className="flex items-center gap-2">
                              <div className="text-xl font-semibold text-white">{stock.symbol}</div>
                              <Pill className={statusClass(stock.status)}>
                                {stock.status || "idle"}
                              </Pill>                            
                                {stock.compound_profits ? (
                                    <Pill className="border-emerald-500/20 bg-emerald-500/10 text-emerald-300 px-2 py-0.3 rounded-2xl">
                                        ♻️
                                    </Pill>
                                ) : null}

                                {stock.rinse_repeat ? (
                                    <Pill className="border-blue-500/20 bg-blue-500/10 text-blue-300 px-2 py-1 rounded-2xl">
                                        🔄 × {stock.max_repeats ?? 0}
                                    </Pill>
                                ) : null}

                              {ai?.action && (
                                <Pill className="border-[#F5C76E]/30 bg-[#F5C76E]/10 text-[#F5C76E]">
                                  AI {ai.action}
                                </Pill>
                              )}
                            </div>
                          </div>
                        </div>

                        {!isOpen && (
                          <div className="grid grid-cols-3 gap-3 text-right sm:grid-cols-6 lg:min-w-[680px]">
                            <MiniMetric label="Price" value={formatMoney(price)} />
                            <MiniMetric label="Move" value={formatPercent(change)} valueClassName={change >= 0 ? "text-emerald-300" : "text-red-300"} />
                            <MiniMetric label="Shares" value={shares || 0} />
                            <MiniMetric label="Allocated" value={formatCompactMoney(stock.allocation)} />
                            <MiniMetric label="P&L" value={`${pnl >= 0 ? "+" : ""}${formatCompactMoney(pnl)}`} valueClassName={pnlClass(pnl)} />
                            <MiniMetric label="Available" value={formatCompactMoney(available)} valueClassName="text-[#F5C76E]" />
                          </div>
                        )}
                      </button>

                        {isOpen && (
                        <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1.15fr]">
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            <MiniMetric label="Current" value={formatMoney(price)} />
                            <MiniMetric label="Entry" value={entry ? formatMoney(entry) : "—"} />
                            <MiniMetric label="Shares" value={shares || 0} />
                            <MiniMetric label="Invested" value={formatCompactMoney(invested)} />
                            <MiniMetric
                                label="Available"
                                value={formatCompactMoney(available)}
                                valueClassName="text-[#F5C76E]"
                            />
                            <MiniMetric
                                label="Unrealized"
                                value={`${pnl >= 0 ? "+" : ""}${formatCompactMoney(pnl)}`}
                                valueClassName={pnlClass(pnl)}
                            />
                            </div>

                            <div className="rounded-3xl border border-[#F5C76E]/15 bg-[#F5C76E]/[0.04] p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="flex items-center gap-2">
                                <LuckmiAiIcon size={30} />
                                <div>
                                    <div className="text-sm font-semibold text-white">Last AI Decision</div>
                                    <div className="text-xs text-gray-500">
                                    CTS {cts} · Confidence {ai?.confidence ?? "—"}%
                                    </div>
                                </div>
                                </div>

                                <Pill className="border-[#F5C76E]/30 bg-[#F5C76E]/10 text-[#F5C76E]">
                                {ai?.action || "No Decision"}
                                </Pill>
                            </div>

                            <div className="mt-3 line-clamp-3 rounded-2xl bg-[#11151C] p-3 text-sm leading-6 text-gray-300">
                                {ai?.reason || "No AI reason yet. Run the engine to generate a fresh decision."}
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                type="button"
                                onClick={() => {
                                    setSelectedAutoStock(stock);
                                    setShowBuyMoreModal(true);
                                }}
                                disabled={actionLoadingId === stock.id}
                                className="rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-50"
                                >
                                Add Capital
                                </button>

                                {stock.has_open_position ? (
                                <button
                                    type="button"
                                    onClick={() => handleSellNow(stock)}
                                    disabled={actionLoadingId === stock.id}
                                    className="rounded-2xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                                >
                                    Sell Now
                                </button>
                                ) : (
                                <button
                                    type="button"
                                    onClick={() => handleDeleteAutoStock(stock)}
                                    disabled={actionLoadingId === stock.id}
                                    className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                                >
                                    Remove
                                </button>
                                )}
                            </div>
                            </div>
                        </div>
                        )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card
            title="Trade History"
            subtitle="Grouped timelines by symbol."
            right={
              <Pill className="border-white/10 bg-white/5 text-gray-300">
                {totalTrades} trades
              </Pill>
            }
          >
            {Object.keys(tradeHistory).length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/10 bg-[#1A1F2B] p-10 text-center text-gray-400">
                No broker-filled trade history yet.
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(tradeHistory).map(([symbol, trades]) => {
                  const isOpen = Boolean(openTrades[symbol]);
                  const realized = trades.reduce(
                    (sum, t) => sum + (String(t.type).includes("sell") ? toNumber(t.pnl) : 0),
                    0
                  );

                  return (
                    <div key={symbol} className="rounded-3xl border border-white/5 bg-[#0F1117]">
                      <button
                        onClick={() =>
                          setOpenTrades((prev) => ({
                            ...prev,
                            [symbol]: !prev[symbol],
                          }))
                        }
                        className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-500">{isOpen ? "▲" : "▼"}</span>
                          <div>
                            <div className="text-lg font-semibold text-white">{symbol}</div>
                            <div className="text-xs text-gray-500">{trades.length} trades</div>
                          </div>
                        </div>

                        <div className={`font-mono text-sm font-semibold ${pnlClass(realized)}`}>
                          {realized >= 0 ? "+" : ""}
                          {formatMoney(realized)}
                        </div>
                      </button>

                      {isOpen && (
                        <div className="divide-y divide-white/5 border-t border-white/5">
                          {trades.map((trade, index) => (
                            <div key={trade.id || index} className="p-4">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <div className="font-medium text-white">
                                    {normalizeTradeType(trade.type)} · {trade.shares ?? 0} shares
                                  </div>
                                  <div className="mt-1 text-xs text-gray-500">
                                    {formatDate(trade.created_at)}
                                  </div>
                                  {trade.reason && (
                                    <div className="mt-2 text-sm text-gray-400">
                                      {trade.reason}
                                    </div>
                                  )}
                                </div>

                                <div className="text-right">
                                  <div className="font-mono text-sm text-white">
                                    {formatMoney(trade.price)}
                                  </div>
                                  {trade.pnl !== null && trade.pnl !== undefined && (
                                    <div className={`mt-1 font-mono text-sm ${pnlClass(toNumber(trade.pnl))}`}>
                                      {toNumber(trade.pnl) >= 0 ? "+" : ""}
                                      {formatMoney(trade.pnl)}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="Activity Log" subtitle="Recent page actions and engine messages.">
            {autoLogs.length === 0 ? (
              <div className="text-sm text-gray-400">No recent activity yet.</div>
            ) : (
              <div className="space-y-2">
                {autoLogs.map((log, index) => (
                  <div key={`${log}-${index}`} className="rounded-2xl bg-[#1A1F2B] p-3 text-sm text-gray-300">
                    {log}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <AddAutoStockModal
            isOpen={showAddModal}
            onClose={() => setShowAddModal(false)}
            onCreated={async (createdStock) => {
              await fetchAutoStocks();
              addToAutoLog(`${createdStock?.symbol || "Stock"} added to Auto Trading`);
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
        </div>
      </main>
    </div>
  );
}