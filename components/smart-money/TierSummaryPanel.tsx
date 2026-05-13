import type { SmartMoneyDashboardResponse } from '@/components/smart-money/types';
import { getTierLabel } from '@/components/smart-money/tierLabels';

type TierSummaryPanelProps = {
  tierCounts: SmartMoneyDashboardResponse['tierCounts'];
  count: number;
};

function Box({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#1A1F2B] px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${accent}`}>{value}</div>
    </div>
  );
}

export default function TierSummaryPanel({ tierCounts, count }: TierSummaryPanelProps) {
  return (
    <section className="rounded-3xl border border-white/5 bg-[#11151C] p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Tier Summary</h2>
        <span className="text-sm text-gray-400">{count} stocks</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Box label={getTierLabel('tier_1')} value={tierCounts.tier_1} accent="text-emerald-300" />
        <Box label={getTierLabel('tier_2')} value={tierCounts.tier_2} accent="text-amber-300" />
        <Box label={getTierLabel('tier_3')} value={tierCounts.tier_3} accent="text-gray-300" />
      </div>
    </section>
  );
}
