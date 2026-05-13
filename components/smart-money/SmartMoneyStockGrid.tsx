import SmartMoneyStockCard from '@/components/smart-money/SmartMoneyStockCard';
import type { SmartMoneyDashboardItem } from '@/components/smart-money/types';

type SmartMoneyStockGridProps = {
  items: SmartMoneyDashboardItem[];
};

export default function SmartMoneyStockGrid({ items }: SmartMoneyStockGridProps) {
  if (items.length === 0) {
    return (
      <section className="rounded-3xl border border-white/5 bg-[#11151C] p-6 text-center text-sm text-gray-400">
        No stocks match the current filters.
      </section>
    );
  }

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <SmartMoneyStockCard key={item.symbol} item={item} />
      ))}
    </section>
  );
}
