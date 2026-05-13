"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import TopNav from '@/components/TopNav';
import FilterToolbar from '@/components/smart-money/FilterToolbar';
import TierSummaryPanel from '@/components/smart-money/TierSummaryPanel';
import SmartMoneyStockGrid from '@/components/smart-money/SmartMoneyStockGrid';
import type {
  SmartMoneyDashboardItem,
  SmartMoneyDashboardResponse,
  SmartMoneyTier,
} from '@/components/smart-money/types';

export default function SmartMoneyPage() {
  const smartMoneyEnabled = process.env.NEXT_PUBLIC_SMART_MONEY_ENABLED !== 'false';
  const [items, setItems] = useState<SmartMoneyDashboardItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generatedAt, setGeneratedAt] = useState<string>('');
  const [dashboardMeta, setDashboardMeta] = useState<{
    source: string;
    warning: string | null;
    stats: {
      universeCount: number;
      evaluatedCount: number;
      successfulCount: number;
      passedCount: number;
      filteredOutCount: number;
      failedCount: number;
    } | null;
  }>({
    source: 'unknown',
    warning: null,
    stats: null,
  });

  const [limit, setLimit] = useState(20);
  const [minCts, setMinCts] = useState(45);
  const [minSms, setMinSms] = useState(35);
  const [tier, setTier] = useState<SmartMoneyTier | 'all'>('all');

  const tierCounts = useMemo(
    () =>
      items.reduce(
        (acc, row) => {
          acc[row.tier] += 1;
          return acc;
        },
        { tier_1: 0, tier_2: 0, tier_3: 0 },
      ),
    [items],
  );

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const params = new URLSearchParams({
        limit: String(limit),
        minCts: String(minCts),
        minSms: String(minSms),
      });

      if (tier !== 'all') {
        params.set('tier', tier);
      }

      const res = await fetch(`/api/smart-money/dashboard?${params.toString()}`, {
        cache: 'no-store',
      });

      const data = (await res.json()) as SmartMoneyDashboardResponse | { error?: string };

      if (!res.ok) {
        const errorPayload = data as { error?: string };
        setItems([]);
        setDashboardMeta({ source: 'unknown', warning: null, stats: null });
        setError(errorPayload.error || 'Failed to load smart money dashboard');
        return;
      }

      const payload = data as SmartMoneyDashboardResponse;
      setItems(Array.isArray(payload.items) ? payload.items : []);
      setGeneratedAt(payload.generatedAt || new Date().toISOString());
      setDashboardMeta({
        source: payload.universe?.source || 'unknown',
        warning: payload.warning || null,
        stats: payload.stats || null,
      });
    } catch (err) {
      console.error('[smart-money/page] load error:', err);
      setItems([]);
      setDashboardMeta({ source: 'unknown', warning: null, stats: null });
      setError('Failed to load smart money dashboard');
    } finally {
      setLoading(false);
    }
  }, [limit, minCts, minSms, tier]);

  useEffect(() => {
    if (!smartMoneyEnabled) {
      setItems([]);
      setError('Smart Money is currently disabled for this environment.');
      return;
    }
    fetchDashboard();
  }, [fetchDashboard, smartMoneyEnabled]);

  return (
    <div className="min-h-screen bg-[#0b0f16] text-white">
      <TopNav activePage="smart-money" />

      <div className="p-4 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-5">
          <header className="rounded-3xl border border-white/5 bg-[#11151C] p-5">
            <h1 className="text-2xl font-semibold sm:text-3xl">Smart Money Dashboard</h1>
            <p className="mt-2 text-sm text-gray-400">
              Discovery engine for institutional activity blended with CTS alignment.
            </p>
            <p className="mt-2 text-xs text-gray-500">
              Status labels: Ready Now (good for auto trading), Watch Closely (track in watchlist), Not Ready Yet (needs more confirmation).
            </p>
            <p className="mt-3 text-xs text-gray-500">
              Last refreshed: {generatedAt ? new Date(generatedAt).toLocaleString() : '—'}
            </p>
          </header>

          <FilterToolbar
            limit={limit}
            minCts={minCts}
            minSms={minSms}
            tier={tier}
            loading={loading}
            onLimitChange={(value) => setLimit(Math.max(1, Math.min(30, value || 20)))}
            onMinCtsChange={(value) => setMinCts(Math.max(0, Math.min(100, value || 45)))}
            onMinSmsChange={(value) => setMinSms(Math.max(0, Math.min(100, value || 35)))}
            onTierChange={setTier}
            onRefresh={fetchDashboard}
          />

          <TierSummaryPanel tierCounts={tierCounts} count={items.length} />

          {dashboardMeta.stats ? (
            <section className="rounded-2xl border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-xs text-sky-100">
              <p>
                Universe source: <span className="font-semibold">{dashboardMeta.source}</span>. Universe had{' '}
                <span className="font-semibold">{dashboardMeta.stats.universeCount}</span> symbols, evaluated{' '}
                <span className="font-semibold">{dashboardMeta.stats.evaluatedCount}</span>, passed filters{' '}
                <span className="font-semibold">{dashboardMeta.stats.passedCount}</span>, filtered out{' '}
                <span className="font-semibold">{dashboardMeta.stats.filteredOutCount}</span>, and failed to score{' '}
                <span className="font-semibold">{dashboardMeta.stats.failedCount}</span>.
              </p>
              {dashboardMeta.warning ? (
                <p className="mt-1 text-[11px] text-sky-200/90">{dashboardMeta.warning}</p>
              ) : null}
            </section>
          ) : null}

          {error ? (
            <section className="rounded-3xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </section>
          ) : null}

          {loading ? (
            <section className="rounded-3xl border border-white/5 bg-[#11151C] p-6 text-sm text-gray-400">
              Loading smart money candidates...
            </section>
          ) : (
            <SmartMoneyStockGrid items={items} />
          )}
        </div>
      </div>
    </div>
  );
}
