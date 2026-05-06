"use client";

import { useEffect, useState } from "react";
import TopNav from "@/components/TopNav";
import LuckmiAiIcon from "@/components/brand/LuckmiAiIcon";
import { toast } from "sonner";
import type {
  OptionsOpportunity,
  OptionDirection,
  StrategyFamily,
  DteBucket,
  LiquidityQuality,
  GexBias,
} from "@/app/lib/options/types";

// ── Helpers ──────────────────────────────────────────────────

/** Build an OCC option symbol from leg components.
 *  Format: UNDERLYING + YYMMDD + C/P + 8-digit-strike-in-thousandths
 *  e.g. AAPL260620C00200000 for AAPL $200 call expiring 2026-06-20 */
function buildOccSymbol(underlying: string, expiry: string, optionType: 'call' | 'put', strike: number): string {
  // expiry may be 'YYYY-MM-DD' or 'YYMMDD'
  const d = expiry.replace(/-/g, '');           // → 'YYYYMMDD' or 'YYMMDD'
  const ymd = d.length === 8 ? d.slice(2) : d; // → 'YYMMDD'
  const cp = optionType === 'call' ? 'C' : 'P';
  const strikePadded = Math.round(strike * 1000).toString().padStart(8, '0');
  return `${underlying.toUpperCase()}${ymd}${cp}${strikePadded}`;
}

function fmt$(v: number) {
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function scoreTier(n: number) {
  if (n >= 75) return "high";
  if (n >= 62) return "mid";
  return "low";
}

function scoreRingClass(n: number) {
  const t = scoreTier(n);
  if (t === "high") return "text-emerald-300 border-emerald-500/40 bg-emerald-500/10";
  if (t === "mid") return "text-[#F5C76E] border-[#F5C76E]/40 bg-[#F5C76E]/10";
  return "text-red-400 border-red-500/30 bg-red-500/10";
}

function scorePillClass(n: number) {
  if (n >= 75) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (n >= 62) return "border-[#F5C76E]/30 bg-[#F5C76E]/10 text-[#F5C76E]";
  return "border-red-500/30 bg-red-500/10 text-red-300";
}

function directionClass(d: OptionDirection) {
  return d === "bullish"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
    : "border-red-500/30 bg-red-500/10 text-red-300";
}

function gexBadge(g: GexBias) {
  if (g === "negative") return { label: "GEX −", cls: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30" };
  if (g === "positive") return { label: "GEX +", cls: "text-amber-300 bg-amber-500/10 border-amber-500/30" };
  return { label: "GEX ~", cls: "text-gray-400 bg-white/5 border-white/10" };
}

function liquidityBadge(q: LiquidityQuality) {
  if (q === "excellent") return "text-emerald-300";
  if (q === "good") return "text-blue-300";
  if (q === "fair") return "text-amber-300";
  return "text-red-400";
}

function aiActionClass(a?: string) {
  if (a === "Enter") return "text-emerald-300 border-emerald-500/30 bg-emerald-500/10";
  if (a === "Watch") return "text-[#F5C76E] border-[#F5C76E]/30 bg-[#F5C76E]/10";
  if (a === "Avoid") return "text-red-400 border-red-500/30 bg-red-500/10";
  return "text-gray-400 border-white/10 bg-white/5";
}

function strategyLabel(s: StrategyFamily) {
  switch (s) {
    case 'call_debit_spread': return 'Call Debit Spread';
    case 'put_debit_spread':  return 'Put Debit Spread';
    case 'long_call':         return 'Long Call (single-leg)';
    case 'long_put':          return 'Long Put (single-leg)';
    default: return s;
  }
}

function Pill({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${className}`}>
      {children}
    </span>
  );
}

function MiniBar({ label, value }: { label: string; value: number }) {
  const cls =
    value >= 75 ? "bg-emerald-500" :
    value >= 60 ? "bg-[#F5C76E]" :
    "bg-red-500";
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</span>
        <span className="text-[10px] text-gray-400">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full rounded-full ${cls}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// ── Option Preferences ───────────────────────────────────────

type OptionPreferences = {
  max_loss_per_trade: number;
  max_open_positions: number;
  preferred_dte_min: number;
  preferred_dte_max: number;
  min_score_threshold: number;
  hard_loss_stop_pct: number;
  profit_trail_activation_pct: number;
  profit_trail_distance_pct: number;
  auto_exit_enabled: boolean;
  include_long_options: boolean;
  auto_entry_enabled: boolean;
  auto_entry_max_positions: number;
};

const DEFAULT_OPTION_PREFS: OptionPreferences = {
  max_loss_per_trade: 300,
  max_open_positions: 5,
  preferred_dte_min: 7,
  preferred_dte_max: 60,
  min_score_threshold: 35,
  hard_loss_stop_pct: 50,
  profit_trail_activation_pct: 40,
  profit_trail_distance_pct: 25,
  auto_exit_enabled: true,
  include_long_options: false,
  auto_entry_enabled: false,
  auto_entry_max_positions: 3,
};

function OptionPreferencesPanel({
  prefs,
  saving,
  onChange,
}: {
  prefs: OptionPreferences;
  saving: boolean;
  onChange: (patch: Partial<OptionPreferences>) => void;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-[#11151C] p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-sm font-semibold text-white">My Trading Rules</h2>
        {saving && <span className="text-[10px] text-gray-500">Saving…</span>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

        {/* Max loss per trade */}
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">
            Max Loss Per Contract: ${prefs.max_loss_per_trade}
          </label>
          <input
            type="range" min={50} max={5000} step={50}
            value={prefs.max_loss_per_trade}
            onChange={e => onChange({ max_loss_per_trade: Number(e.target.value) })}
            className="w-full accent-[#F5C76E]"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[10px] text-gray-600">$50</span>
            <input
              type="number" min={50} max={5000} step={50}
              value={prefs.max_loss_per_trade}
              onChange={e => onChange({ max_loss_per_trade: Number(e.target.value) })}
              className="w-28 rounded-lg bg-[#1A1F2B] border border-white/10 px-2 py-1 text-xs text-white focus:border-[#F5C76E]/40 focus:outline-none"
            />
            <span className="text-[10px] text-gray-600">$5,000</span>
          </div>
          <p className="text-[10px] text-gray-600 mt-1">Used by scanner and trade entry: blocks setups where net debit ×100 exceeds this per-contract limit</p>
        </div>

        {/* Max open positions */}
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">
            Max Open Positions: {prefs.max_open_positions}
          </label>
          <input
            type="range" min={1} max={20} step={1}
            value={prefs.max_open_positions}
            onChange={e => onChange({ max_open_positions: Number(e.target.value) })}
            className="w-full accent-[#F5C76E]"
          />
          <p className="text-[10px] text-gray-600 mt-1">Paper Trade blocked when you hit this limit</p>
        </div>

        {/* Min score */}
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">
            Min Score Threshold: {prefs.min_score_threshold}
          </label>
          <input
            type="range" min={0} max={100} step={5}
            value={prefs.min_score_threshold}
            onChange={e => onChange({ min_score_threshold: Number(e.target.value) })}
            className="w-full accent-[#F5C76E]"
          />
          <p className="text-[10px] text-gray-600 mt-1">Personal OCS floor (applies alongside filter)</p>
        </div>

        {/* DTE range */}
        <div className="sm:col-span-2 lg:col-span-3">
          <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">
            Preferred DTE Window: {prefs.preferred_dte_min}–{prefs.preferred_dte_max} days
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number" min={1} max={365} step={1}
              value={prefs.preferred_dte_min}
              onChange={e => onChange({ preferred_dte_min: Number(e.target.value) })}
              className="w-24 rounded-xl bg-[#1A1F2B] border border-white/10 px-3 py-2 text-sm text-white focus:border-[#F5C76E]/40 focus:outline-none"
            />
            <span className="text-gray-600 text-xs">to</span>
            <input
              type="number" min={1} max={365} step={1}
              value={prefs.preferred_dte_max}
              onChange={e => onChange({ preferred_dte_max: Number(e.target.value) })}
              className="w-24 rounded-xl bg-[#1A1F2B] border border-white/10 px-3 py-2 text-sm text-white focus:border-[#F5C76E]/40 focus:outline-none"
            />
            <span className="text-gray-500 text-xs">days to expiry (informational)</span>
          </div>
        </div>

      </div>

      {/* Auto-close rules */}
      <div className="mt-4 pt-4 border-t border-white/5">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-xs font-semibold text-white">Exit Rules</h3>
          <span className="text-[10px] text-gray-600">(active when Auto Trading is ON)</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">

          {/* Hard loss stop */}
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">
              Hard Loss Stop: {prefs.hard_loss_stop_pct}% of max loss
            </label>
            <input
              type="range" min={10} max={100} step={5}
              value={prefs.hard_loss_stop_pct}
              onChange={e => onChange({ hard_loss_stop_pct: Number(e.target.value) })}
              className="w-full accent-red-500"
            />
            <p className="text-[10px] text-gray-600 mt-1">Closes immediately — no trailing</p>
          </div>

          {/* Trail activation */}
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">
              Trail Activates At: {prefs.profit_trail_activation_pct}% of max gain
            </label>
            <input
              type="range" min={10} max={90} step={5}
              value={prefs.profit_trail_activation_pct}
              onChange={e => onChange({ profit_trail_activation_pct: Number(e.target.value) })}
              className="w-full accent-emerald-500"
            />
            <p className="text-[10px] text-gray-600 mt-1">Must reach this before trail locks in</p>
          </div>

          {/* Trail distance */}
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">
              Trail Distance: {prefs.profit_trail_distance_pct}% of max gain from peak
            </label>
            <input
              type="range" min={5} max={50} step={5}
              value={prefs.profit_trail_distance_pct}
              onChange={e => onChange({ profit_trail_distance_pct: Number(e.target.value) })}
              className="w-full accent-emerald-500"
            />
            <p className="text-[10px] text-gray-600 mt-1">Exit if drops this far below peak</p>
          </div>

        </div>

        {/* Live trail example */}
        <div className="mt-3 rounded-xl bg-[#1A1F2B] px-4 py-3 text-xs text-gray-500 leading-6">
          <span className="text-white font-medium">Example</span> — max gain $200:
          {" "}trail activates at <span className="text-emerald-300">${(200 * prefs.profit_trail_activation_pct / 100).toFixed(0)}</span>,
          {" "}floor trails <span className="text-emerald-300">${(200 * prefs.profit_trail_distance_pct / 100).toFixed(0)}</span> below peak.
          {" "}Hard loss closes at <span className="text-red-400">-${(100 * prefs.hard_loss_stop_pct / 100).toFixed(0)}</span> (max loss $100).
        </div>
      </div>

      {/* Long options toggle */}
      <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold text-white">Include Long Options</div>
          <div className="text-[10px] text-gray-600 mt-0.5">Show long call / long put setups alongside spreads (Phase D)</div>
        </div>
        <button
          type="button"
          onClick={() => onChange({ include_long_options: !prefs.include_long_options })}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${prefs.include_long_options ? 'bg-[#F5C76E]' : 'bg-white/10'}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${prefs.include_long_options ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>

      {/* ── Auto Trading ─────────────────────────────────────────────────── */}
      <div className="mt-4 pt-4 border-t border-white/5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-white">Auto Trading</div>
            <div className="text-[10px] text-gray-600 mt-0.5">
              When ON, the system automatically places trades on your behalf — no action needed. Requires a connected broker.
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const enabled = !prefs.auto_entry_enabled;
              onChange({ auto_entry_enabled: enabled, auto_exit_enabled: enabled });
            }}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${prefs.auto_entry_enabled ? 'bg-emerald-500' : 'bg-white/10'}`}
            aria-label="Toggle auto trading"
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${prefs.auto_entry_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        {prefs.auto_entry_enabled && (
          <div className="rounded-2xl border border-white/10 bg-[#1A1F2B] px-4 py-3 space-y-3">
            {/* Max auto positions slider */}
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">
                Max Auto Positions: {prefs.auto_entry_max_positions}
              </label>
              <input
                type="range" min={1} max={15} step={1}
                value={prefs.auto_entry_max_positions}
                onChange={e => onChange({ auto_entry_max_positions: Number(e.target.value) })}
                className="w-full accent-emerald-500"
              />
              <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
                <span>1</span>
                <span>15</span>
              </div>
              <p className="text-[10px] text-gray-600 mt-1">
                System will open up to this many positions per cycle if qualified setups exist.
                Overall cap is also bounded by your Max Open Positions ({prefs.max_open_positions}) and available broker balance.
              </p>
            </div>

            {/* Pre-checks reminder */}
            <div className="rounded-xl bg-white/5 px-3 py-2.5 text-[10px] text-gray-500 space-y-1 leading-5">
              <div className="text-white font-semibold text-xs mb-1">Auto-entry pre-checks (enforced per cycle)</div>
              <div>✓ Broker connected and tested</div>
              <div>✓ Account not blocked / no PDT violation</div>
              <div>✓ Options buying power ≥ Max Loss Per Contract</div>
              <div>✓ Setup score ≥ Min Score Threshold ({prefs.min_score_threshold})</div>
              <div>✓ Net debit × 100 ≤ Max Loss Per Contract (${prefs.max_loss_per_trade})</div>
              <div>✓ Opportunity not stale (within expiry window)</div>
              <div>✓ No open position already held for that ticker</div>
              <div>✓ AI is not "Avoid" with ≥ 65% confidence</div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

// ── Paper Trade Types ───────────────────────────────────────

type AiDecisionRecord = {
  option_trade_id: string;
  action: 'Enter' | 'Watch' | 'Avoid' | null;
  reason: string | null;
  confidence: number | null;
  ocs_score: number | null;
  risk_flags: string[] | null;
};

type PaperTrade = {
  id: string;
  symbol: string;
  direction: string;
  strategy: string;
  long_strike: number | null;
  long_expiry: string | null;
  short_strike: number | null;
  short_expiry: string | null;
  option_type: string | null;
  net_debit: number;
  max_gain: number | null;
  max_loss: number | null;
  entry_score: number | null;
  entry_spot_price: number | null;
  status: string;
  entry_at: string;
  exit_at: string | null;
  exit_price: number | null;
  pnl: number | null;
  peak_pnl?: number | null;
  notes: string | null;
  ai_decision?: AiDecisionRecord | null;
};

// ── Options History Drawer ────────────────────────────────────

function aiActionBadge(action: string | null | undefined) {
  if (!action) return null;
  if (action === 'Enter') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (action === 'Avoid') return 'border-red-500/30 bg-red-500/10 text-red-400';
  return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
}

function HistoryTradeRow({ trade }: { trade: PaperTrade }) {
  const [open, setOpen] = useState(false);
  const ai = trade.ai_decision;
  const isClosed = trade.status === 'closed';
  const hasPnl = trade.pnl != null;

  return (
    <div className="rounded-2xl border border-white/5 bg-[#1A1F2B] overflow-hidden">
      {/* Summary row — always visible */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5 transition"
      >
        {/* Score ring */}
        {trade.entry_score != null && (
          <div className={`flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-xl border text-[11px] font-bold ${scoreRingClass(trade.entry_score)}`}>
            {trade.entry_score}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-white">{trade.symbol}</span>
            <Pill className={directionClass(trade.direction as OptionDirection)}>
              {trade.direction === 'bullish' ? '▲' : '▼'} {trade.direction}
            </Pill>
            {ai?.action && (
              <Pill className={aiActionBadge(ai.action) ?? ''}>AI: {ai.action}</Pill>
            )}
            {isClosed && hasPnl && (
              <span className={`text-xs font-semibold ${trade.pnl! >= 0 ? 'text-emerald-300' : 'text-red-400'}`}>
                {trade.pnl! >= 0 ? '+' : ''}{fmt$(trade.pnl!)}
              </span>
            )}
            {!isClosed && (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
            )}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5 truncate">
            {strategyLabel(trade.strategy as StrategyFamily)} · debit {fmt$(trade.net_debit)}
            {trade.long_strike != null && trade.short_strike != null && ` · $${trade.long_strike}/$${trade.short_strike}`}
          </div>
        </div>
        <span className="text-gray-600 text-xs shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="px-3 pb-3 pt-0 space-y-2 border-t border-white/5">
          {/* Metrics */}
          <div className="grid grid-cols-3 gap-2 mt-2">
            {[
              { label: 'Net Debit', value: fmt$(trade.net_debit) },
              { label: 'Max Gain', value: trade.max_gain != null ? fmt$(trade.max_gain) : '—' },
              { label: 'Max Loss', value: trade.max_loss != null ? fmt$(trade.max_loss) : '—' },
            ].map(m => (
              <div key={m.label} className="rounded-xl bg-[#11151C] px-2 py-1.5 text-center">
                <div className="text-[9px] uppercase tracking-wide text-gray-600">{m.label}</div>
                <div className="text-xs font-semibold text-white mt-0.5">{m.value}</div>
              </div>
            ))}
          </div>
          {/* Entry / exit dates */}
          <div className="flex items-center gap-3 text-[10px] text-gray-500">
            <span>Entry {new Date(trade.entry_at).toLocaleString()}</span>
            {trade.exit_at && <span>Exit {new Date(trade.exit_at).toLocaleString()}</span>}
          </div>
          {/* AI reason */}
          {ai?.reason && (
            <div className="rounded-xl border border-[#F5C76E]/10 bg-[#11151C] px-3 py-2 space-y-1">
              <div className="flex items-center gap-1.5 mb-1">
                <LuckmiAiIcon size={16} />
                <span className="text-[10px] font-semibold text-white uppercase tracking-wide">AI Analysis</span>
                {ai.confidence != null && (
                  <span className="text-[10px] text-gray-500">{ai.confidence}% confidence</span>
                )}
              </div>
              <p className="text-[11px] text-gray-300 leading-5">{ai.reason}</p>
              {ai.risk_flags && ai.risk_flags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {ai.risk_flags.map((f: string) => (
                    <Pill key={f} className="border-amber-500/30 bg-amber-500/10 text-amber-300">⚠ {f}</Pill>
                  ))}
                </div>
              )}
            </div>
          )}
          {!ai && (
            <p className="text-[10px] text-gray-600 italic">No AI analysis recorded for this trade.</p>
          )}
        </div>
      )}
    </div>
  );
}

function OptionsHistoryDrawer({
  trades,
  onClose,
}: {
  trades: PaperTrade[];
  onClose: () => void;
}) {
  // Group trades by entry date (local date string)
  const byDay = trades.reduce<Record<string, PaperTrade[]>>((acc, t) => {
    const day = new Date(t.entry_at).toLocaleDateString(undefined, {
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
    });
    (acc[day] = acc[day] ?? []).push(t);
    return acc;
  }, {});

  const days = Object.keys(byDay);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="relative w-full max-w-md h-full bg-[#0d1117] border-l border-white/10 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div>
            <h2 className="text-base font-bold text-white">Options Trade History</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">{trades.length} total trade{trades.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-white transition text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {days.length === 0 && (
            <div className="text-center text-gray-500 text-sm mt-10">No trades yet.</div>
          )}
          {days.map(day => {
            const dayTrades = byDay[day];
            const openCount = dayTrades.filter(t => t.status === 'open').length;
            const closedCount = dayTrades.filter(t => t.status === 'closed').length;
            const dayPnl = dayTrades
              .filter(t => t.status === 'closed' && t.pnl != null)
              .reduce((s, t) => s + (t.pnl ?? 0), 0);
            const hasDayPnl = closedCount > 0 && dayTrades.some(t => t.pnl != null);

            return (
              <details key={day} open>
                <summary className="flex items-center gap-2 cursor-pointer select-none mb-2">
                  <span className="text-xs font-semibold text-white">{day}</span>
                  <span className="text-[10px] text-gray-500">{dayTrades.length} trade{dayTrades.length !== 1 ? 's' : ''}</span>
                  {openCount > 0 && (
                    <span className="rounded-full bg-emerald-500/10 border border-emerald-500/25 px-1.5 py-0.5 text-[10px] text-emerald-300">{openCount} open</span>
                  )}
                  {hasDayPnl && (
                    <span className={`ml-auto text-xs font-semibold ${dayPnl >= 0 ? 'text-emerald-300' : 'text-red-400'}`}>
                      {dayPnl >= 0 ? '+' : ''}{fmt$(dayPnl)}
                    </span>
                  )}
                </summary>
                <div className="space-y-2">
                  {dayTrades.map(t => <HistoryTradeRow key={t.id} trade={t} />)}
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Paper Trade Confirmation Modal ────────────────────────────

function PaperTradeModal({
  opp,
  onConfirm,
  onCancel,
  saving,
  brokerMode,
}: {
  opp: OptionsOpportunity;
  onConfirm: () => void;
  onCancel: () => void;
  saving: boolean;
  brokerMode: 'paper' | 'live' | null;
}) {
  const longType = opp.longLeg.optionType.toUpperCase();
  const modeLabel = brokerMode ? brokerMode.toUpperCase() : 'OFF';
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0d1117] shadow-2xl">
        <div className="flex items-start justify-between border-b border-white/5 p-5">
          <div>
            <h2 className="text-lg font-bold text-white">Broker Trade</h2>
            <p className="text-xs text-gray-400 mt-0.5">Submit to Alpaca {modeLabel} mode</p>
          </div>
          <button type="button" onClick={onCancel} className="text-gray-500 hover:text-white text-xl leading-none ml-4">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-2xl font-bold text-white">{opp.symbol}</span>
            <Pill className={directionClass(opp.direction)}>
              {opp.direction === "bullish" ? "▲ Bullish" : "▼ Bearish"}
            </Pill>
            <Pill className={scorePillClass(opp.score.finalScore)}>OCS {opp.score.finalScore}</Pill>
          </div>
          <p className="text-sm text-gray-400 -mt-1">{strategyLabel(opp.strategy)}</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-emerald-500/5 border border-emerald-500/20 p-3">
              <div className="text-[10px] uppercase tracking-wide text-emerald-400 mb-1">BUY Long Leg</div>
              <div className="text-base font-bold text-white">${opp.longLeg.strike} {longType}</div>
              <div className="text-xs text-gray-400">Exp {opp.longLeg.expiry}</div>
              <div className="text-xs text-gray-400">{opp.longLeg.mid != null ? fmt$(opp.longLeg.mid) : "—"}</div>
            </div>
            {opp.shortLeg ? (
              <div className="rounded-2xl bg-red-500/5 border border-red-500/20 p-3">
                <div className="text-[10px] uppercase tracking-wide text-red-400 mb-1">SELL Short Leg</div>
                <div className="text-base font-bold text-white">${opp.shortLeg.strike} {longType}</div>
                <div className="text-xs text-gray-400">Exp {opp.shortLeg.expiry}</div>
                <div className="text-xs text-gray-400">{opp.shortLeg.mid != null ? fmt$(opp.shortLeg.mid) : "—"}</div>
              </div>
            ) : (
              <div className="rounded-2xl bg-[#1A1F2B] border border-white/10 p-3 flex flex-col justify-center">
                <div className="text-[10px] uppercase tracking-wide text-gray-600 mb-1">Single Leg</div>
                <div className="text-xs text-gray-500">No short leg — full premium at risk</div>
                {opp.longLeg.delta != null && <div className="text-xs text-gray-500 mt-1">Δ {opp.longLeg.delta.toFixed(2)}</div>}
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Net Debit", value: fmt$(opp.netDebit), sub: `×100 = ${fmt$(opp.netDebit * 100)}`, cls: "text-white" },
              { label: "Max Gain", value: fmt$(opp.maxGain), sub: null, cls: "text-emerald-300" },
              { label: "Max Loss", value: fmt$(opp.maxLoss), sub: null, cls: "text-red-400" },
            ].map(m => (
              <div key={m.label} className="rounded-xl bg-[#1A1F2B] p-3 text-center">
                <div className="text-[10px] uppercase text-gray-500">{m.label}</div>
                <div className={`text-sm font-bold mt-0.5 ${m.cls}`}>{m.value}</div>
                {m.sub && <div className="text-[10px] text-gray-600 mt-0.5">{m.sub}</div>}
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-500 bg-[#1A1F2B] rounded-xl px-3 py-2">
            Orders are routed to Alpaca. Live orders require both env and account live flags enabled.
          </p>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-gray-300 hover:bg-white/10 transition">
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={saving}
              className="flex-1 rounded-xl border border-[#F5C76E]/30 bg-[#F5C76E]/15 px-4 py-2.5 text-sm font-semibold text-[#F5C76E] hover:bg-[#F5C76E]/25 disabled:opacity-50 transition"
            >
              {saving ? "Submitting…" : "Submit Broker Order"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Close Trade Modal ─────────────────────────────────────────

function CloseTradeModal({
  trade,
  onConfirm,
  onCancel,
  closing,
}: {
  trade: PaperTrade;
  onConfirm: (exitPrice: number) => void;
  onCancel: () => void;
  closing: boolean;
}) {
  const [exitPrice, setExitPrice] = useState("");
  const parsed = parseFloat(exitPrice);
  const valid = Number.isFinite(parsed) && parsed >= 0;
  const pnl = valid ? (parsed - trade.net_debit) * 100 : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0d1117] shadow-2xl">
        <div className="flex items-start justify-between border-b border-white/5 p-5">
          <div>
            <h2 className="text-lg font-bold text-white">Close Position</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {trade.symbol} · {trade.direction} · {strategyLabel(trade.strategy as StrategyFamily)}
            </p>
          </div>
          <button type="button" onClick={onCancel} className="text-gray-500 hover:text-white text-xl leading-none ml-4">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Exit spread price (net credit received per share)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={exitPrice}
              onChange={e => setExitPrice(e.target.value)}
              placeholder={`Entry was ${fmt$(trade.net_debit)}`}
              className="w-full rounded-xl bg-[#1A1F2B] border border-white/10 px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-[#F5C76E]/40 focus:outline-none"
            />
          </div>

          {valid && pnl !== null && (
            <div className={`rounded-xl px-4 py-3 text-center text-sm font-semibold ${pnl >= 0 ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300" : "bg-red-500/10 border border-red-500/20 text-red-400"}`}>
              P&L: {pnl >= 0 ? "+" : ""}{fmt$(pnl)}
              <span className="text-xs font-normal text-gray-500 ml-1">(1 contract)</span>
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-gray-300 hover:bg-white/10 transition">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => { if (valid) onConfirm(parsed); }}
              disabled={!valid || closing}
              className="flex-1 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-500/20 disabled:opacity-40 transition"
            >
              {closing ? "Closing…" : "Close Trade"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Paper Trade Row & Panel ───────────────────────────────────

function PaperTradeRow({ trade, onClose }: { trade: PaperTrade; onClose?: (t: PaperTrade) => void }) {
  const isClosed = trade.status === "closed";
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-[#11151C] px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-sm text-white">{trade.symbol}</span>
          <Pill className={directionClass(trade.direction as OptionDirection)}>
            {trade.direction === "bullish" ? "▲ Bull" : "▼ Bear"}
          </Pill>
          {isClosed ? (
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-gray-500">closed</span>
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 mt-1 text-xs text-gray-500">
          <span>{strategyLabel(trade.strategy as StrategyFamily)}</span>
          {trade.long_strike != null && trade.short_strike != null && (
            <span>${trade.long_strike} / ${trade.short_strike}</span>
          )}
          <span>{new Date(trade.entry_at).toLocaleDateString()}</span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-xs text-gray-500">debit {fmt$(trade.net_debit)}</div>
        {isClosed && trade.pnl != null ? (
          <div className={`text-sm font-bold ${trade.pnl >= 0 ? "text-emerald-300" : "text-red-400"}`}>
            {trade.pnl >= 0 ? "+" : ""}{fmt$(trade.pnl)}
          </div>
        ) : (
          <div className="text-[10px] text-gray-600">P&L on close</div>
        )}
      </div>
      {!isClosed && onClose && (
        <button
          type="button"
          onClick={() => onClose(trade)}
          className="shrink-0 rounded-xl border border-red-500/25 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/15 transition"
        >
          Close
        </button>
      )}
    </div>
  );
}

function PaperTradesPanel({
  trades,
  loading,
  onClose,
  onRefresh,
  onPickSymbol,
  activeSymbol,
}: {
  trades: PaperTrade[];
  loading: boolean;
  onClose: (t: PaperTrade) => void;
  onRefresh: () => void;
  onPickSymbol: (symbol: string | null) => void;
  activeSymbol: string | null;
}) {
  const open = trades.filter(t => t.status === "open");
  const closed = trades.filter(t => t.status === "closed");
  const openSymbols = Array.from(new Set(open.map(t => t.symbol.toUpperCase()))).sort();
  const symbolHealth = new Map(
    openSymbols.map((symbol) => {
      const rows = open.filter(t => t.symbol.toUpperCase() === symbol);
      const values = rows
        .map(t => (t.pnl != null ? t.pnl : t.peak_pnl ?? null))
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

      if (values.length === 0) {
        return [symbol, {
          label: 'No P&L yet',
          cls: 'border-white/10 bg-white/5 text-gray-500',
        }];
      }

      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const signed = `${avg >= 0 ? '+' : '-'}${fmt$(Math.abs(avg))}`;

      if (avg >= 50) {
        return [symbol, {
          label: `${signed} peak`,
          cls: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
        }];
      }
      if (avg <= -30) {
        return [symbol, {
          label: `-${fmt$(Math.abs(avg))}`,
          cls: 'border-red-500/25 bg-red-500/10 text-red-300',
        }];
      }

      return [symbol, {
        label: `${signed} flat`,
        cls: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
      }];
    })
  );

  if (loading) {
    return (
      <section>
        <h2 className="text-base font-semibold text-white mb-3">In-Position & Trade History</h2>
        <div className="space-y-2">
          {[1, 2].map(i => <div key={i} className="h-16 rounded-2xl bg-[#11151C] animate-pulse" />)}
        </div>
      </section>
    );
  }

  if (trades.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-white">In-Position & Trade History</h2>
          {open.length > 0 && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300 font-medium">
              {open.length} in-position
            </span>
          )}
        </div>
        <button type="button" onClick={onRefresh} className="text-xs text-gray-500 hover:text-gray-300 transition">↺ Refresh</button>
      </div>
      {openSymbols.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onPickSymbol(null)}
            className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
              activeSymbol == null
                ? 'border-[#F5C76E]/35 bg-[#F5C76E]/10 text-[#F5C76E]'
                : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20'
            }`}
          >
            All Symbols
          </button>
          {openSymbols.map(symbol => (
            <button
              key={symbol}
              type="button"
              onClick={() => onPickSymbol(symbol)}
              className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                activeSymbol === symbol
                  ? 'border-amber-500/35 bg-amber-500/10 text-amber-300'
                  : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20'
              }`}
            >
              <span>{symbol}</span>
              <span className={`ml-2 rounded-full border px-1.5 py-0.5 text-[10px] leading-none ${symbolHealth.get(symbol)?.cls ?? 'border-white/10 bg-white/5 text-gray-500'}`}>
                {symbolHealth.get(symbol)?.label ?? 'No P&L yet'}
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="space-y-2">
        {open
          .filter(t => activeSymbol == null || t.symbol.toUpperCase() === activeSymbol)
          .map(t => <PaperTradeRow key={t.id} trade={t} onClose={onClose} />)}
        {closed.length > 0 && (
          <details>
            <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300 transition select-none py-1">
              {closed.length} closed trade{closed.length > 1 ? "s" : ""} ▸
            </summary>
            <div className="mt-2 space-y-2">
              {closed.map(t => <PaperTradeRow key={t.id} trade={t} />)}
            </div>
          </details>
        )}
      </div>
    </section>
  );
}

// ── Detail Panel ─────────────────────────────────────────────

function OpportunityDetailPanel({
  opp,
  onClose,
}: {
  opp: OptionsOpportunity;
  onClose: () => void;
}) {
  const gex = gexBadge(opp.gexBias);
  const dir = opp.direction === "bullish" ? "bullish" : "bearish";
  const longType = opp.longLeg.optionType.toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#0d1117] shadow-2xl">

        {/* Header */}
        <div className="flex items-start justify-between border-b border-white/5 p-5">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-2xl font-bold text-white">{opp.symbol}</span>
              <Pill className={directionClass(opp.direction)}>
                {opp.direction === "bullish" ? "▲ Bullish" : "▼ Bearish"}
              </Pill>
              <Pill className={scorePillClass(opp.score.finalScore)}>
                OCS {opp.score.finalScore}
              </Pill>
              {opp.aiAction && (
                <Pill className={aiActionClass(opp.aiAction)}>
                  AI: {opp.aiAction}
                </Pill>
              )}
            </div>
            <div className="mt-1 text-sm text-gray-400">{strategyLabel(opp.strategy)}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-white text-xl leading-none ml-4"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-5">

          {/* Spread Construction */}
          <section className="rounded-2xl border border-white/5 bg-[#11151C] p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Spread Construction</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-3">
                <div className="text-[10px] uppercase tracking-wide text-emerald-400 mb-1">BUY (Long Leg)</div>
                <div className="text-lg font-bold text-white">${opp.longLeg.strike} {longType}</div>
                <div className="text-xs text-gray-400 mt-0.5">Exp {opp.longLeg.expiry}</div>
                <div className="text-xs text-gray-400">Mid {opp.longLeg.mid != null ? fmt$(opp.longLeg.mid) : "—"}</div>
                {opp.longLeg.delta != null && (
                  <div className="text-xs text-gray-500">Δ {opp.longLeg.delta.toFixed(2)}</div>
                )}
              </div>
              {opp.shortLeg ? (
                <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-red-400 mb-1">SELL (Short Leg)</div>
                  <div className="text-lg font-bold text-white">${opp.shortLeg.strike} {longType}</div>
                  <div className="text-xs text-gray-400 mt-0.5">Exp {opp.shortLeg.expiry}</div>
                  <div className="text-xs text-gray-400">Mid {opp.shortLeg.mid != null ? fmt$(opp.shortLeg.mid) : "—"}</div>
                  {opp.shortLeg.delta != null && (
                    <div className="text-xs text-gray-500">Δ {opp.shortLeg.delta.toFixed(2)}</div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl bg-[#1A1F2B] border border-white/10 p-3 flex flex-col justify-center">
                  <div className="text-[10px] uppercase tracking-wide text-gray-600 mb-1">Single Leg</div>
                  <div className="text-xs text-gray-500">No short leg — full premium at risk</div>
                  <div className="text-xs text-gray-500 mt-1">Max loss = premium × 100</div>
                </div>
              )}
            </div>
          </section>

          {/* Risk/Reward */}
          <section className="rounded-2xl border border-white/5 bg-[#11151C] p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Risk / Reward</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Net Debit", value: fmt$(opp.netDebit), sub: "cost to enter" },
                { label: "Max Gain", value: fmt$(opp.maxGain), sub: "at expiry" },
                { label: "Max Loss", value: fmt$(opp.maxLoss), sub: "if worthless" },
                { label: "R/R", value: `${opp.riskRewardRatio}:1`, sub: "ratio" },
              ].map(m => (
                <div key={m.label} className="rounded-xl bg-[#1A1F2B] border border-white/5 p-3 text-center">
                  <div className="text-[10px] uppercase tracking-wide text-gray-500">{m.label}</div>
                  <div className="mt-1 text-base font-bold text-white">{m.value}</div>
                  <div className="text-[10px] text-gray-500">{m.sub}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
              <div className="rounded-lg bg-[#1A1F2B] p-2.5 text-center">
                <div className="text-gray-500 text-[10px] uppercase">Breakeven</div>
                <div className="text-white font-medium mt-0.5">${opp.breakeven.toFixed(2)}</div>
              </div>
              <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/15 p-2.5 text-center">
                <div className="text-emerald-400 text-[10px] uppercase">Profit Target</div>
                <div className="text-emerald-300 font-medium mt-0.5">{fmt$(opp.profitTarget)}</div>
              </div>
              <div className="rounded-lg bg-red-500/5 border border-red-500/15 p-2.5 text-center">
                <div className="text-red-400 text-[10px] uppercase">Stop Loss</div>
                <div className="text-red-400 font-medium mt-0.5">{fmt$(opp.stopLoss)}</div>
              </div>
            </div>
          </section>

          {/* Score Breakdown */}
          <section className="rounded-2xl border border-white/5 bg-[#11151C] p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Luckmi Score Breakdown</h3>
            <div className="space-y-2.5">
              <MiniBar label="Flow (35%)" value={opp.score.flowScore} />
              <MiniBar label="Structure (25%)" value={opp.score.structureScore} />
              <MiniBar label="Volatility Fit (20%)" value={opp.score.volatilityFitScore} />
              <MiniBar label="Execution Quality (20%)" value={opp.score.executionQualityScore} />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className={`flex-1 rounded-xl border px-3 py-2 text-center text-sm font-bold ${scoreRingClass(opp.score.finalScore)}`}>
                OCS {opp.score.finalScore} / 100
              </div>
              <Pill className={gex.cls}>{gex.label}</Pill>
              <Pill className="border-blue-500/30 bg-blue-500/10 text-blue-300">
                IV Rank {opp.ivRank}
              </Pill>
            </div>
          </section>

          {/* AI Analysis */}
          {opp.aiReason ? (
            <section className="rounded-2xl border border-[#F5C76E]/15 bg-[#11151C] p-4">
              <div className="flex items-center gap-2 mb-3">
                <LuckmiAiIcon size={28} />
                <h3 className="text-sm font-semibold text-white">Luckmi AI Analysis</h3>
                {opp.aiConfidence != null && (
                  <Pill className="border-white/10 bg-white/5 text-gray-400">
                    {opp.aiConfidence}% confidence
                  </Pill>
                )}
              </div>
              <p className="text-sm leading-7 text-gray-300 whitespace-pre-wrap">{opp.aiReason}</p>
              {opp.aiRiskFlags && opp.aiRiskFlags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {opp.aiRiskFlags.map(flag => (
                    <Pill key={flag} className="border-amber-500/30 bg-amber-500/10 text-amber-300">
                      ⚠ {flag}
                    </Pill>
                  ))}
                </div>
              )}
            </section>
          ) : (
            <section className="rounded-2xl border border-white/5 bg-[#11151C] p-4">
              <div className="flex items-center gap-2 mb-2">
                <LuckmiAiIcon size={28} />
                <h3 className="text-sm font-semibold text-white">Luckmi AI Analysis</h3>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-gray-400">{opp.flowSummary}</p>
                <p className="text-sm text-gray-400">{opp.structureSummary}</p>
              </div>
            </section>
          )}

          {/* Invalidation */}
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
            <span className="font-medium">Invalidation: </span>
            {opp.invalidationCondition}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Opportunity Card ─────────────────────────────────────────

function OpportunityCard({
  opp,
  onOpen,
  onPaperTrade,
  brokerMode,
  prefs,
  openPositionCount,
  inPosition,
}: {
  opp: OptionsOpportunity;
  onOpen: (o: OptionsOpportunity) => void;
  onPaperTrade: (o: OptionsOpportunity) => void;
  brokerMode: 'paper' | 'live' | null;
  prefs: OptionPreferences;
  openPositionCount: number;
  inPosition: boolean;
}) {
  const gex = gexBadge(opp.gexBias);
  const tradeMaxLoss = opp.netDebit * 100;
  const autoEntryActive = prefs.auto_entry_enabled;
  const blockReason =
    !brokerMode
      ? 'Connect Alpaca and run Test Connection'
      : inPosition
      ? 'Already in position'
      : openPositionCount >= prefs.max_open_positions
      ? `Limit reached (${prefs.max_open_positions} open)`
      : tradeMaxLoss > prefs.max_loss_per_trade
      ? `Exceeds per-contract cap ($${prefs.max_loss_per_trade})`
      : null;

  return (
    <div className={`rounded-3xl border transition-all overflow-hidden flex flex-col ${
      inPosition
        ? 'border-amber-500/25 bg-[#1a1708] hover:border-amber-500/40'
        : 'border-white/5 bg-[#11151C] hover:border-white/15 hover:bg-[#161b22]'
    }`}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen(opp)}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onOpen(opp); }}
        className="flex-1 text-left p-4 sm:p-5 cursor-pointer"
      >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Score ring */}
          <div className={`flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-2xl border text-sm font-bold ${scoreRingClass(opp.score.finalScore)}`}>
            {opp.score.finalScore}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg font-bold text-white">{opp.symbol}</span>
              <Pill className={directionClass(opp.direction)}>
                {opp.strategy === 'long_call' ? '▲ Long Call'
                  : opp.strategy === 'long_put' ? '▼ Long Put'
                  : opp.direction === 'bullish' ? '▲ Call Debit' : '▼ Put Debit'}
              </Pill>
              {inPosition && (
                <Pill className="border-amber-500/30 bg-amber-500/10 text-amber-300">In Position</Pill>
              )}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">{strategyLabel(opp.strategy)}</div>
          </div>
        </div>

        {/* AI action badge */}
        {opp.aiAction && (
          <Pill className={aiActionClass(opp.aiAction)}>{opp.aiAction}</Pill>
        )}
      </div>

      {/* Metrics row */}
      <div className="mt-3 grid grid-cols-4 gap-2">
        <div className="rounded-xl bg-[#1A1F2B] px-2.5 py-2 text-center">
          <div className="text-[10px] uppercase tracking-wide text-gray-500">Debit</div>
          <div className="text-xs font-semibold text-white mt-0.5">{fmt$(opp.netDebit)}</div>
        </div>
        <div className="rounded-xl bg-[#1A1F2B] px-2.5 py-2 text-center">
          <div className="text-[10px] uppercase tracking-wide text-gray-500">Max Gain</div>
          <div className="text-xs font-semibold text-emerald-300 mt-0.5">{fmt$(opp.maxGain)}</div>
        </div>
        <div className="rounded-xl bg-[#1A1F2B] px-2.5 py-2 text-center">
          <div className="text-[10px] uppercase tracking-wide text-gray-500">IV Rank</div>
          <div className={`text-xs font-semibold mt-0.5 ${opp.ivRank <= 35 ? 'text-emerald-300' : opp.ivRank <= 55 ? 'text-[#F5C76E]' : 'text-red-400'}`}>
            {opp.ivRank}%
          </div>
        </div>
        <div className="rounded-xl bg-[#1A1F2B] px-2.5 py-2 text-center">
          <div className="text-[10px] uppercase tracking-wide text-gray-500">R/R</div>
          <div className="text-xs font-semibold text-white mt-0.5">{opp.riskRewardRatio}:1</div>
        </div>
      </div>

      {/* Strike info */}
      <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
        <span>
          {opp.shortLeg
            ? `$${opp.longLeg.strike} / $${opp.shortLeg.strike} — exp ${opp.longLeg.expiry}`
            : `$${opp.longLeg.strike} ${opp.longLeg.optionType} — exp ${opp.longLeg.expiry} | δ${opp.longLeg.delta?.toFixed(2)}`
          }
        </span>
        <div className="flex items-center gap-1.5">
          <Pill className={gex.cls}>{gex.label}</Pill>
          <Pill className={`border-white/10 bg-white/5 ${liquidityBadge(opp.liquidityQuality)}`}>
            {opp.liquidityQuality}
          </Pill>
        </div>
      </div>

      {/* Thesis */}
      <p className="mt-2.5 text-xs text-gray-500 line-clamp-2">{opp.thesis}</p>
      </div>
      <div className="px-4 pb-4 pt-1">
        {autoEntryActive ? (
          <div
            title="Auto Trading is ON. Engine will evaluate and place entries automatically if setup passes checks."
            className="w-full rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-center text-xs font-medium text-emerald-300"
          >
            Auto Trading ON - discovery managed by engine
          </div>
        ) : inPosition ? (
          <div className="w-full rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-center text-xs font-medium text-amber-400">
            ● In Position
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { if (!blockReason) onPaperTrade(opp); }}
            disabled={!!blockReason}
            title={blockReason ?? undefined}
            className={`w-full rounded-xl border px-3 py-2 text-xs font-medium transition ${
              blockReason
                ? 'border-white/10 bg-white/5 text-gray-600 cursor-not-allowed'
                : 'border-[#F5C76E]/25 bg-[#F5C76E]/5 text-[#F5C76E] hover:bg-[#F5C76E]/15'
            }`}
          >
            {blockReason ? `🚫 ${blockReason}` : `Trade via Alpaca (${brokerMode?.toUpperCase()})`}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Filters ──────────────────────────────────────────────────

type Filters = {
  direction: 'all' | OptionDirection;
  minScore: number;
  maxIvRank: number;
  dteBucket: 'all' | DteBucket;
  liquidityMin: 'all' | LiquidityQuality;
};

const DEFAULT_FILTERS: Filters = {
  direction: 'all',
  minScore: 35,   // matches server MIN_SCORE (trial plan); raise to 55 on paid UW plan
  maxIvRank: 80,
  dteBucket: 'all',
  liquidityMin: 'all',
};

function toPositionKey(symbol: string, direction: string, strategy: string): string {
  return `${symbol.toUpperCase()}|${direction.toLowerCase()}|${strategy.toLowerCase()}`;
}

function applyFilters(opps: OptionsOpportunity[], f: Filters): OptionsOpportunity[] {
  return opps.filter(o => {
    if (f.direction !== 'all' && o.direction !== f.direction) return false;
    if (o.score.finalScore < f.minScore) return false;
    if (o.ivRank > f.maxIvRank) return false;
    if (f.dteBucket !== 'all' && o.dteBucket !== f.dteBucket) return false;
    if (f.liquidityMin !== 'all') {
      const rank = { excellent: 4, good: 3, fair: 2, poor: 1 };
      if (rank[o.liquidityQuality] < rank[f.liquidityMin]) return false;
    }
    return true;
  });
}

// ── Skipped Symbols Dev Disclosure ───────────────────────────

type ScanMeta = {
  totalUniverse: number;
  eligibleSymbols: number;
  skippedSymbols: { symbol: string; reason: string }[];
};

function SkippedSymbolsDisclosure({ scanMeta }: { scanMeta: ScanMeta }) {
  const [open, setOpen] = useState(false);
  const skipped = scanMeta.skippedSymbols;
  if (skipped.length === 0) return null;

  // Colours per reason tag
  function tagCls(part: string): string {
    if (part.includes('no-valid-legs')) return 'bg-purple-500/15 text-purple-300 border-purple-500/25';
    if (part.includes('spot-price'))   return 'bg-red-500/15 text-red-300 border-red-500/25';
    return 'bg-white/5 text-gray-400 border-white/10';
  }

  function tagLabel(part: string): string {
    if (part === 'no-valid-legs-either-direction') return 'no option contracts';
    if (part === 'spot-price') return 'no spot price';
    return part;
  }

  return (
    <div className="border-t border-white/5 pt-2 mt-0.5">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-xs text-amber-300 hover:text-amber-200 transition w-full"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
        <span>
          {skipped.length} symbol{skipped.length > 1 ? 's' : ''} excluded due to insufficient live UW contract data
        </span>
        <span className="ml-auto text-gray-600">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-1.5">
          {skipped.map(({ symbol, reason }) => {
            const parts = reason.replace('missing ', '').split(', ');
            return (
              <div key={symbol} className="flex items-start gap-2 rounded-xl bg-[#1A1F2B] px-3 py-2">
                <span className="font-mono text-xs font-semibold text-white w-14 shrink-0 pt-0.5">
                  {symbol}
                </span>
                <div className="flex flex-wrap gap-1">
                  {parts.map(p => (
                    <span
                      key={p}
                      className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium ${tagCls(p)}`}
                    >
                      {tagLabel(p)}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
          <p className="text-[10px] text-gray-600 pt-0.5 pl-1">
            These symbols will appear once UW returns enough contracts to build at least one spread direction.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export default function OptionsPage() {
  const [opportunities, setOpportunities] = useState<OptionsOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [dataMode, setDataMode] = useState<'mock' | 'live_strict'>('mock');
  const [quotesSource, setQuotesSource] = useState<'live' | 'unavailable'>('unavailable');
  const [scanMeta, setScanMeta] = useState<{ totalUniverse: number; eligibleSymbols: number; skippedSymbols: { symbol: string; reason: string }[] } | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<OptionsOpportunity | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Paper trades
  const [paperTradeTarget, setPaperTradeTarget] = useState<OptionsOpportunity | null>(null);
  const [savingPaperTrade, setSavingPaperTrade] = useState(false);
  const [paperTrades, setPaperTrades] = useState<PaperTrade[]>([]);
  const [paperTradesLoading, setPaperTradesLoading] = useState(true);
  const [closeTarget, setCloseTarget] = useState<PaperTrade | null>(null);
  const [closingTrade, setClosingTrade] = useState(false);
  const [activePositionSymbol, setActivePositionSymbol] = useState<string | null>(null);

  // Preferences
  const [prefs, setPrefs] = useState<OptionPreferences>(DEFAULT_OPTION_PREFS);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Broker mode — paper/live execution if Alpaca is connected
  const [brokerMode, setBrokerMode] = useState<'paper' | 'live' | null>(null);

  useEffect(() => {
    fetch('/api/broker/mode')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.connected && d?.mode) {
          setBrokerMode(d.mode as 'paper' | 'live');
        } else {
          setBrokerMode(null);
        }
      })
      .catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      // Fetch spreads
      const res = await fetch('/api/options/opportunities', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load opportunities');
      const data = await res.json();
      let allOpps: OptionsOpportunity[] = data.opportunities ?? [];

      // Fetch long options if enabled in prefs
      if (prefs.include_long_options) {
        try {
          const longRes = await fetch('/api/options/long-options', { cache: 'no-store' });
          if (longRes.ok) {
            const longData = await longRes.json();
            const longOpps: OptionsOpportunity[] = longData.opportunities ?? [];
            // Merge and re-sort by finalScore descending
            allOpps = [...allOpps, ...longOpps].sort(
              (a, b) => b.score.finalScore - a.score.finalScore
            );
          }
        } catch {
          // Non-fatal — spreads still displayed
        }
      }

      setOpportunities(allOpps);
      setGeneratedAt(data.generatedAt ?? null);
      setDataMode(data.dataMode === 'live_strict' ? 'live_strict' : 'mock');
      setQuotesSource(data.quotesSource === 'live' ? 'live' : 'unavailable');
      setScanMeta(data.scanMeta ?? null);
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function loadPaperTrades() {
    setPaperTradesLoading(true);
    try {
      const res = await fetch('/api/options/paper-trade');
      if (res.ok) {
        const data = await res.json();
        setPaperTrades(data.trades ?? []);
      }
    } catch {
      // silently fail — not critical
    } finally {
      setPaperTradesLoading(false);
    }
  }

  async function confirmPaperTrade() {
    if (!paperTradeTarget) return;
    setSavingPaperTrade(true);
    try {
      const opp = paperTradeTarget;

      if (!brokerMode) {
        toast.error('Connect Alpaca and pass Test Connection before trading options');
        return;
      }

      const brokerBody = {
        symbol: opp.symbol,
        direction: opp.direction,
        strategy: opp.strategy,
        longOccSymbol: buildOccSymbol(opp.symbol, opp.longLeg.expiry, opp.longLeg.optionType, opp.longLeg.strike),
        shortOccSymbol: opp.shortLeg
          ? buildOccSymbol(opp.symbol, opp.shortLeg.expiry, opp.shortLeg.optionType, opp.shortLeg.strike)
          : null,
        longStrike: opp.longLeg.strike,
        longExpiry: opp.longLeg.expiry,
        shortStrike: opp.shortLeg?.strike ?? null,
        shortExpiry: opp.shortLeg?.expiry ?? null,
        optionType: opp.longLeg.optionType,
        netDebit: opp.netDebit,
        maxGain: opp.maxGain,
        maxLoss: opp.maxLoss,
        entryScore: opp.score.finalScore,
        entrySpotPrice: null,
        qtyContracts: 1,
        // AI fields — stored in ai_decisions so history drawer shows analysis
        aiAction: opp.aiAction ?? null,
        aiReason: opp.aiReason ?? null,
        aiConfidence: opp.aiConfidence ?? null,
        aiRiskFlags: opp.aiRiskFlags ?? null,
      };

      const res = await fetch('/api/options/broker-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(brokerBody),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error((err as any).error ?? 'Failed to submit broker order');
        return;
      }

      const data = await res.json();
      toast.success(`Broker order submitted: ${opp.symbol} ${opp.direction} (${data.executionMode ?? brokerMode})`);
      setPaperTradeTarget(null);
      loadPaperTrades();
    } catch {
      toast.error('Failed to submit broker order');
    } finally {
      setSavingPaperTrade(false);
    }
  }

  async function closePaperTrade(exitPrice: number) {
    if (!closeTarget) return;
    setClosingTrade(true);
    try {
      const res = await fetch('/api/options/paper-trade', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: closeTarget.id, exit_price: exitPrice }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error((err as any).error ?? 'Failed to close trade');
        return;
      }
      const data = await res.json();
      const pnl: number | null = data.trade?.pnl ?? null;
      const pnlStr = pnl != null ? `${pnl >= 0 ? '+' : ''}${fmt$(pnl)}` : '?';
      toast.success(`Closed ${closeTarget.symbol} · P&L: ${pnlStr}`);
      setCloseTarget(null);
      loadPaperTrades();
    } catch {
      toast.error('Failed to close trade');
    } finally {
      setClosingTrade(false);
    }
  }

  useEffect(() => { loadPaperTrades(); }, []);

  // Auto-refresh positions every 60 s when auto-entry is ON
  // so background cron-placed trades surface without manual refresh
  useEffect(() => {
    if (!prefs.auto_entry_enabled) return;
    const id = setInterval(() => { loadPaperTrades(); }, 60_000);
    return () => clearInterval(id);
  }, [prefs.auto_entry_enabled]);

  async function loadPrefs() {
    try {
      const res = await fetch('/api/options/preferences');
      if (res.ok) {
        const data = await res.json();
        if (data.prefs) setPrefs(p => ({ ...p, ...data.prefs }));
      }
    } catch { /* silently ignore */ }
  }

  async function savePrefs(patch: Partial<OptionPreferences>) {
    setPrefs(p => ({ ...p, ...patch }));
    setPrefsSaving(true);
    try {
      const res = await fetch('/api/options/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error((err as any).error ?? 'Failed to save settings');
      }
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setPrefsSaving(false);
    }
  }

  useEffect(() => { loadPrefs(); }, []);

  const openTrades = paperTrades.filter(t => t.status === 'open');
  const openPositionCount = openTrades.length;
  const inPositionKeys = new Set(
    openTrades.map(t => toPositionKey(t.symbol, t.direction, t.strategy))
  );

  const effectiveMinScore = Math.max(filters.minScore, prefs.min_score_threshold);
  const baseVisible = applyFilters(opportunities, { ...filters, minScore: effectiveMinScore })
    .filter(o => (o.netDebit * 100) <= prefs.max_loss_per_trade)
    // Discoveries should not duplicate currently-held positions.
    .filter(o => !inPositionKeys.has(toPositionKey(o.symbol, o.direction, o.strategy)));
  const visible = activePositionSymbol
    ? baseVisible.filter(o => o.symbol.toUpperCase() === activePositionSymbol)
    : baseVisible;
  const topHighConv = visible.filter(o => o.score.finalScore >= 75);
  const remaining = visible.filter(o => o.score.finalScore < 75);

  return (
    <div className="min-h-screen bg-[#0b0f16] text-white">
      <TopNav activePage="options" />

      <div className="p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-6">

          {/* Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <LuckmiAiIcon size={32} />
                <h1 className="text-2xl font-semibold sm:text-3xl">Options</h1>
                <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-[11px] text-blue-300 font-medium">
                  Debit Spreads · Beta
                </span>
              </div>
              <p className="mt-2 text-sm text-gray-400 max-w-2xl">
                Luckmi ranks today's best call and put debit spread setups using options flow, GEX, IV fit, and execution quality. AI explains the top setups.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#11151C] px-3 py-2 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-gray-500 uppercase tracking-wide">Automation</span>
            <span className={`rounded-full border px-2 py-0.5 font-medium ${prefs.auto_entry_enabled ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-white/10 bg-white/5 text-gray-400'}`}>
              Auto trading: {prefs.auto_entry_enabled ? `ON · up to ${prefs.auto_entry_max_positions}` : 'OFF'}
            </span>
            <span className={`rounded-full border px-2 py-0.5 font-medium ${prefs.include_long_options ? 'border-[#F5C76E]/35 bg-[#F5C76E]/10 text-[#F5C76E]' : 'border-white/10 bg-white/5 text-gray-400'}`}>
              Long options scanner: {prefs.include_long_options ? 'ON' : 'OFF'}
            </span>
            <span className={`rounded-full border px-2 py-0.5 font-medium ${brokerMode === 'paper' ? 'border-blue-500/30 bg-blue-500/10 text-blue-300' : brokerMode === 'live' ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-white/10 bg-white/5 text-gray-400'}`}>
              Broker: {brokerMode ? `${brokerMode.toUpperCase()} (Alpaca)` : 'OFF'}
            </span>
          </div>

          {prefs.auto_entry_enabled && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              All discoveries are auto candidates; entries are placed only if checks pass.
            </div>
          )}

          {/* Data source status — two rows: options flow and stock prices */}
          <div className="rounded-xl border border-white/10 bg-[#11151C] px-3 py-2 space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              {dataMode === 'live_strict' ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                  <span className="text-emerald-300 font-medium">Options flow: Live strict (UW)</span>
                  <span className="text-gray-500">— no mock fallback; symbols with missing UW legs are excluded</span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
                  <span className="text-amber-300 font-medium">Options flow: Mock data</span>
                  <span className="text-gray-500">— live options flow not configured</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs">
              {quotesSource === 'live' ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                  <span className="text-emerald-300 font-medium">Stock prices: Live</span>
                  <span className="text-gray-500">— spread strikes are anchored to real current prices</span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-red-400 shrink-0" />
                  <span className="text-red-300 font-medium">Stock prices: Unavailable</span>
                  <span className="text-gray-500">— real-time prices not configured; spread strikes may be approximate</span>
                </>
              )}
            </div>
            {dataMode === 'live_strict' && scanMeta && scanMeta.eligibleSymbols < scanMeta.totalUniverse && (
              <SkippedSymbolsDisclosure scanMeta={scanMeta} />
            )}
          </div>

          {/* Actions Row */}
          <div className="rounded-xl border border-white/10 bg-[#11151C] px-3 py-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFilters(f => !f)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-300 hover:border-white/20 transition"
            >
              Filters {showFilters ? "▲" : "▼"}
            </button>
            <button
              type="button"
              onClick={() => setShowSettings(s => !s)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-300 hover:border-white/20 transition"
            >
              ⚙️ Rules {showSettings ? "▲" : "▼"}
            </button>
            <button
              type="button"
              onClick={() => setShowHistory(true)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-300 hover:border-white/20 transition"
            >
              📋 History
            </button>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="ml-auto rounded-lg border border-[#F5C76E]/30 bg-[#F5C76E]/10 px-3 py-1.5 text-xs font-medium text-[#F5C76E] hover:bg-[#F5C76E]/20 disabled:opacity-50 transition"
            >
              {loading ? "Scanning…" : "Refresh"}
            </button>
          </div>

          {/* Filter Panel */}
          {showFilters && (
            <div className="rounded-3xl border border-white/10 bg-[#11151C] p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-white mb-4">Filters</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">

                {/* Direction */}
                <div>
                  <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">Direction</label>
                  <div className="flex gap-1">
                    {(['all', 'bullish', 'bearish'] as const).map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setFilters(f => ({ ...f, direction: v }))}
                        className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                          filters.direction === v
                            ? 'bg-[#F5C76E]/20 text-[#F5C76E] border border-[#F5C76E]/30'
                            : 'bg-white/5 text-gray-400 border border-white/10 hover:border-white/20'
                        }`}
                      >
                        {v === 'all' ? 'All' : v === 'bullish' ? '▲ Bull' : '▼ Bear'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Min score */}
                <div>
                  <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">
                    Min OCS Score: {filters.minScore}
                  </label>
                  <input
                    type="range" min={35} max={85} step={5}
                    value={filters.minScore}
                    onChange={e => setFilters(f => ({ ...f, minScore: Number(e.target.value) }))}
                    className="w-full accent-[#F5C76E]"
                  />
                </div>

                {/* Max IV rank */}
                <div>
                  <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">
                    Max IV Rank: {filters.maxIvRank}%
                  </label>
                  <input
                    type="range" min={20} max={100} step={5}
                    value={filters.maxIvRank}
                    onChange={e => setFilters(f => ({ ...f, maxIvRank: Number(e.target.value) }))}
                    className="w-full accent-[#F5C76E]"
                  />
                </div>

                {/* DTE bucket */}
                <div>
                  <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">DTE</label>
                  <select
                    value={filters.dteBucket}
                    onChange={e => setFilters(f => ({ ...f, dteBucket: e.target.value as any }))}
                    className="w-full rounded-lg bg-[#1A1F2B] border border-white/10 text-gray-300 text-xs px-2 py-2"
                  >
                    <option value="all">All DTEs</option>
                    <option value="7-14">7–14 days</option>
                    <option value="14-21">14–21 days</option>
                    <option value="21-35">21–35 days</option>
                    <option value="35-60">35–60 days</option>
                  </select>
                </div>

                {/* Liquidity */}
                <div>
                  <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">Min Liquidity</label>
                  <select
                    value={filters.liquidityMin}
                    onChange={e => setFilters(f => ({ ...f, liquidityMin: e.target.value as any }))}
                    className="w-full rounded-lg bg-[#1A1F2B] border border-white/10 text-gray-300 text-xs px-2 py-2"
                  >
                    <option value="all">Any</option>
                    <option value="fair">Fair+</option>
                    <option value="good">Good+</option>
                    <option value="excellent">Excellent only</option>
                  </select>
                </div>

              </div>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                  className="text-xs text-gray-500 hover:text-gray-300 transition"
                >
                  Reset filters
                </button>
              </div>
            </div>
          )}

          {/* Settings Panel */}
          {showSettings && (
            <OptionPreferencesPanel prefs={prefs} saving={prefsSaving} onChange={savePrefs} />
          )}

          {/* Error */}
          {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-44 rounded-3xl border border-white/5 bg-[#11151C] animate-pulse" />
              ))}
            </div>
          )}

          {/* Results */}
          {!loading && !error && (
            <>
              {/* In-Position section (separate from discoveries) */}
              <PaperTradesPanel
                trades={paperTrades}
                loading={paperTradesLoading}
                onClose={setCloseTarget}
                onRefresh={loadPaperTrades}
                onPickSymbol={setActivePositionSymbol}
                activeSymbol={activePositionSymbol}
              />

              {/* Summary bar */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
                <span><span className="text-white font-medium">{visible.length}</span> discoveries</span>
                <span><span className="text-emerald-300 font-medium">{topHighConv.length}</span> high conviction</span>
                <span><span className="text-amber-300 font-medium">{openPositionCount}</span> in-position</span>
                {activePositionSymbol && (
                  <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-amber-300 text-xs">
                    Symbol filter: {activePositionSymbol}
                  </span>
                )}
                {generatedAt && (
                  <span className="text-gray-600 text-xs">
                    Updated {new Date(generatedAt).toLocaleTimeString()}
                  </span>
                )}
              </div>

              {/* High conviction section */}
              {topHighConv.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-emerald-400 text-lg">⚡</span>
                    <h2 className="text-base font-semibold text-white">High Conviction</h2>
                    <span className="text-xs text-gray-500">OCS 75+</span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {topHighConv.map(o => (
                      <OpportunityCard
                        key={o.id}
                        opp={o}
                        onOpen={setSelected}
                        onPaperTrade={setPaperTradeTarget}
                        brokerMode={brokerMode}
                        prefs={prefs}
                        openPositionCount={openPositionCount}
                        inPosition={inPositionKeys.has(toPositionKey(o.symbol, o.direction, o.strategy))}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* All other opportunities */}
              {remaining.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <h2 className="text-base font-semibold text-white">All Opportunities</h2>
                    <span className="text-xs text-gray-500">OCS 55–74</span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {remaining.map(o => (
                      <OpportunityCard
                        key={o.id}
                        opp={o}
                        onOpen={setSelected}
                        onPaperTrade={setPaperTradeTarget}
                        brokerMode={brokerMode}
                        prefs={prefs}
                        openPositionCount={openPositionCount}
                        inPosition={inPositionKeys.has(toPositionKey(o.symbol, o.direction, o.strategy))}
                      />
                    ))}
                  </div>
                </section>
              )}

              {visible.length === 0 && (
                <div className="rounded-3xl border border-white/5 bg-[#11151C] p-10 text-center">
                  <div className="text-3xl mb-3">📊</div>
                  <p className="text-gray-400 text-sm">No setups meet current filters.</p>
                  <button
                    type="button"
                    onClick={() => setFilters(DEFAULT_FILTERS)}
                    className="mt-3 text-xs text-[#F5C76E] hover:underline"
                  >
                    Reset filters
                  </button>
                </div>
              )}

              {/* How scoring works */}
              <section className="rounded-3xl border border-white/5 bg-[#11151C] p-5">
                <h2 className="text-sm font-semibold text-white mb-3">How Luckmi Options Score Works</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                  {[
                    { label: "Flow (35%)", desc: "Unusual call/put sweeps, net premium bias, ask-side aggression" },
                    { label: "Structure (25%)", desc: "GEX regime, gamma walls, dark pool levels" },
                    { label: "Volatility Fit (20%)", desc: "IV rank (lower = better for debit spreads), term structure" },
                    { label: "Execution (20%)", desc: "Bid-ask width, OI liquidity, delta quality, risk/reward" },
                  ].map(item => (
                    <div key={item.label} className="rounded-2xl bg-[#1A1F2B] p-3">
                      <div className="text-xs font-semibold text-white">{item.label}</div>
                      <div className="text-xs text-gray-500 mt-1 leading-5">{item.desc}</div>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-gray-600">
                  Score is fully deterministic. AI (gpt-4o-mini) enriches the top setups with plain-language explanation and risk flags — it does not affect the score.
                </p>
              </section>
            </>
          )}
        </div>
      </div>

      {/* Detail Panel */}
      {selected && (
        <OpportunityDetailPanel opp={selected} onClose={() => setSelected(null)} />
      )}

      {/* Paper Trade Confirmation */}
      {paperTradeTarget && (
        <PaperTradeModal
          opp={paperTradeTarget}
          onConfirm={confirmPaperTrade}
          onCancel={() => setPaperTradeTarget(null)}
          saving={savingPaperTrade}
          brokerMode={brokerMode}
        />
      )}

      {/* Close Trade */}
      {closeTarget && (
        <CloseTradeModal
          trade={closeTarget}
          onConfirm={closePaperTrade}
          onCancel={() => setCloseTarget(null)}
          closing={closingTrade}
        />
      )}

      {/* Trade History Drawer */}
      {showHistory && (
        <OptionsHistoryDrawer
          trades={paperTrades}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}
