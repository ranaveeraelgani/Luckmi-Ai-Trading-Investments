"use client";

import type { SmartMoneyTier } from '@/components/smart-money/types';

type FilterToolbarProps = {
  limit: number;
  minCts: number;
  minSms: number;
  tier: SmartMoneyTier | 'all';
  loading: boolean;
  onLimitChange: (value: number) => void;
  onMinCtsChange: (value: number) => void;
  onMinSmsChange: (value: number) => void;
  onTierChange: (value: SmartMoneyTier | 'all') => void;
  onRefresh: () => void;
};

export default function FilterToolbar({
  limit,
  minCts,
  minSms,
  tier,
  loading,
  onLimitChange,
  onMinCtsChange,
  onMinSmsChange,
  onTierChange,
  onRefresh,
}: FilterToolbarProps) {
  return (
    <section className="rounded-3xl border border-white/5 bg-[#11151C] p-4 sm:p-5">
      <div className="grid gap-3 md:grid-cols-5">
        <label className="text-xs text-gray-400">
          Limit
          <input
            type="number"
            min={1}
            max={30}
            value={limit}
            onChange={(e) => onLimitChange(Number(e.target.value || 20))}
            className="mt-1 w-full rounded-xl border border-white/10 bg-[#1A1F2B] px-3 py-2 text-sm text-white outline-none focus:border-blue-400"
          />
        </label>

        <label className="text-xs text-gray-400">
          Min CTS
          <input
            type="number"
            min={0}
            max={100}
            value={minCts}
            onChange={(e) => onMinCtsChange(Number(e.target.value || 50))}
            className="mt-1 w-full rounded-xl border border-white/10 bg-[#1A1F2B] px-3 py-2 text-sm text-white outline-none focus:border-blue-400"
          />
        </label>

        <label className="text-xs text-gray-400">
          Min SMS
          <input
            type="number"
            min={0}
            max={100}
            value={minSms}
            onChange={(e) => onMinSmsChange(Number(e.target.value || 60))}
            className="mt-1 w-full rounded-xl border border-white/10 bg-[#1A1F2B] px-3 py-2 text-sm text-white outline-none focus:border-blue-400"
          />
        </label>

        <label className="text-xs text-gray-400">
          Tier
          <select
            value={tier}
            onChange={(e) => onTierChange(e.target.value as SmartMoneyTier | 'all')}
            className="mt-1 w-full rounded-xl border border-white/10 bg-[#1A1F2B] px-3 py-2 text-sm text-white outline-none focus:border-blue-400"
          >
            <option value="all">All</option>
            <option value="tier_1">Tier 1</option>
            <option value="tier_2">Tier 2</option>
            <option value="tier_3">Tier 3</option>
          </select>
        </label>

        <div className="flex items-end">
          <button
            type="button"
            disabled={loading}
            onClick={onRefresh}
            className="w-full rounded-xl border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-sm font-medium text-blue-300 transition hover:bg-blue-500/20 disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>
    </section>
  );
}
