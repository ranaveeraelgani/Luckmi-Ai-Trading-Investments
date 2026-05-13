"use client";

import { useState } from 'react';
import type { SmartMoneyDashboardItem } from '@/components/smart-money/types';
import { getTierLabel, getTierSubLabel } from '@/components/smart-money/tierLabels';
import LuckmiAiIcon from '@/components/brand/LuckmiAiIcon';

type SmartMoneyStockCardProps = {
  item: SmartMoneyDashboardItem;
};

function tierClass(tier: SmartMoneyDashboardItem['tier']) {
  if (tier === 'tier_1') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (tier === 'tier_2') return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  return 'border-gray-500/30 bg-white/5 text-gray-300';
}

function scoreBar(value: number, color: string) {
  const width = `${Math.max(0, Math.min(100, value))}%`;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
      <div className={`h-2 ${color}`} style={{ width }} />
    </div>
  );
}

export default function SmartMoneyStockCard({ item }: SmartMoneyStockCardProps) {
  const [busy, setBusy] = useState<null | 'watchlist' | 'auto'>(null);
  const [result, setResult] = useState<string>('');
  const [expanded, setExpanded] = useState(false);

  const actionTier = getTierSubLabel(item.tier);

  async function addToWatchlist() {
    try {
      setBusy('watchlist');
      setResult('');

      const res = await fetch('/api/smart-money/actions/add-to-watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: item.symbol,
          smartMoneyScore: item.smartMoneyScore,
          ctsScore: item.ctsScore,
          finalConviction: item.finalConviction,
          tier: item.tier,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setResult(data?.error || 'Failed to add to watchlist');
        return;
      }

      setResult(`${item.symbol} added to watchlist`);
    } catch {
      setResult('Failed to add to watchlist');
    } finally {
      setBusy(null);
    }
  }

  async function addToAuto() {
    try {
      setBusy('auto');
      setResult('');

      const res = await fetch('/api/smart-money/actions/add-to-auto-trading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: item.symbol,
          allocation: 0,
          compound_profits: false,
          rinse_repeat: true,
          max_repeats: 5,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setResult(data?.error || 'Failed to add to auto trading');
        return;
      }

      setResult(`${item.symbol} added to auto trading`);
    } catch {
      setResult('Failed to add to auto trading');
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="rounded-3xl border border-white/5 bg-[#11151C] p-4 shadow-[0_0_25px_rgba(21,173,255,0.05)]">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded">
              <LuckmiAiIcon />
            </span>
            <h3 className="text-xl font-semibold text-white">{item.symbol}</h3>
          </div>
          <p className="text-xs text-gray-400">{new Date(item.generatedAt).toLocaleTimeString()}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${tierClass(item.tier)}`}>
          {getTierLabel(item.tier)}
        </span>
      </div>

      <p className="mb-3 text-xs text-gray-300">{actionTier}</p>

      <div className="space-y-2">
        <div>
          <div className="mb-1 flex justify-between text-xs text-gray-400">
            <span>Final Conviction</span>
            <span>{item.finalConviction.toFixed(1)}</span>
          </div>
          {scoreBar(item.finalConviction, 'bg-emerald-400')}
        </div>
        <div>
          <div className="mb-1 flex justify-between text-xs text-gray-400">
            <span>CTS</span>
            <span>{item.ctsScore.toFixed(1)}</span>
          </div>
          {scoreBar(item.ctsScore, 'bg-blue-400')}
        </div>
        <div>
          <div className="mb-1 flex justify-between text-xs text-gray-400">
            <span>SMS</span>
            <span>{item.smartMoneyScore.toFixed(1)}</span>
          </div>
          {scoreBar(item.smartMoneyScore, 'bg-amber-400')}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-[#1A1F2B] p-3 text-xs text-gray-300">
        <div className="mb-1 font-medium text-white">{item.alignment}</div>
        <div>{item.tierReason}</div>
      </div>

      <div className="mt-3 rounded-2xl border border-white/10 bg-[#1A1F2B] p-3 text-xs text-gray-300">
        <div className="mb-1 font-medium text-white">AI Analysis</div>
        <p>
          {item.aiNarrative || 'Narrative is still loading. Signal summary is available above.'}
        </p>
        <p className="mt-1 text-[11px] text-gray-400">Confidence: {item.aiConfidence ?? 65}%</p>

        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-2 text-[11px] text-blue-300 transition hover:text-blue-200"
        >
          {expanded ? 'Read Less ▲' : 'Read More ▼'}
        </button>

        {expanded ? (
          <ul className="mt-2 space-y-1 text-[11px] text-gray-300">
            {item.signals.optionsFlow.slice(0, 2).map((signal, idx) => (
              <li key={`flow-${idx}`}>• {signal}</li>
            ))}
            {item.signals.darkPoolProxy.slice(0, 1).map((signal, idx) => (
              <li key={`gex-${idx}`}>• {signal}</li>
            ))}
            {item.signals.volatility.slice(0, 1).map((signal, idx) => (
              <li key={`vol-${idx}`}>• {signal}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={addToWatchlist}
          disabled={Boolean(busy)}
          className="flex-1 rounded-xl border border-blue-500/35 bg-blue-500/10 px-3 py-2 text-sm text-blue-300 transition hover:bg-blue-500/20 disabled:opacity-50"
        >
          {busy === 'watchlist' ? 'Adding...' : 'Add to Watchlist'}
        </button>

        <button
          type="button"
          onClick={addToAuto}
          disabled={Boolean(busy) || !item.isAutoTradingEligible}
          className="flex-1 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
        >
          {busy === 'auto' ? 'Adding...' : 'Add to Auto'}
        </button>
      </div>

      {result ? <p className="mt-3 text-xs text-gray-300">{result}</p> : null}
    </article>
  );
}
