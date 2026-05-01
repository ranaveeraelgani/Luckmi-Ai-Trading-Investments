'use client';

import { useEffect, useState } from 'react';
import TopNav from '@/components/TopNav';
import LuckmiAiIcon from '@/components/brand/LuckmiAiIcon';

type Plan = {
  planCode: string;
  name: string;
  priceMonthly: number;
  maxAutoStocks: number;
  allowManualCycle: boolean;
  allowCronAutomation: boolean;
  allowBrokerConnect: boolean;
  allowAdvancedAnalytics: boolean;
  sortOrder: number;
};

type CurrentSubscription = {
  planCode: string;
  status: string;
  enforced: boolean;
};

const PLAN_FEATURES: Record<string, string[]> = {
  free:  ['1 auto stock', 'Full automation', 'Broker connect', 'Basic analytics'],
  basic: ['3 auto stocks', 'Full automation', 'Broker connect', 'Advanced analytics'],
  pro:   ['10 auto stocks', 'Full automation', 'Broker connect', 'Advanced analytics'],
  elite: ['30 auto stocks', 'Full automation', 'Broker connect', 'Advanced analytics'],
};

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-[#F5C76E] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

export default function SubscriptionPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [current, setCurrent] = useState<CurrentSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [plansRes, meRes] = await Promise.all([
        fetch('/api/subscription/plans'),
        fetch('/api/subscription/me'),
      ]);
      const plansJson = await plansRes.json();
      const meJson = await meRes.json();
      setPlans(plansJson?.plans ?? []);
      setCurrent({
        planCode: meJson?.planCode ?? 'free',
        status: meJson?.status ?? 'active',
        enforced: meJson?.enforced ?? false,
      });
    } catch {
      setMessage({ type: 'error', text: 'Failed to load subscription data.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSelect = async (planCode: string) => {
    if (selecting || planCode === current?.planCode) return;
    setSelecting(planCode);
    setMessage(null);
    try {
      const res = await fetch('/api/subscription/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planCode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Failed to update plan');
      setCurrent((prev) => prev ? { ...prev, planCode } : prev);
      setMessage({ type: 'success', text: `Switched to ${planCode.charAt(0).toUpperCase() + planCode.slice(1)} plan.` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message ?? 'Something went wrong.' });
    } finally {
      setSelecting(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0f16] text-white p-6">
        <TopNav activePage="profile" />
        <div className="max-w-5xl mx-auto mt-10 text-gray-400">Loading plans...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0f16] text-white">
      <TopNav activePage="profile" />

      <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">

        {/* Header */}
        <div className="flex items-center gap-3">
          <LuckmiAiIcon size={36} />
          <div>
            <h1 className="text-2xl font-semibold">Subscription Plans</h1>
            <p className="text-sm text-gray-400 mt-0.5">Choose the plan that fits your trading style.</p>
          </div>
        </div>

        {/* Test mode banner */}
        {current && !current.enforced && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            <span className="font-medium">Test mode active</span> — plan limits are not enforced yet. You can select a plan now and it will activate when enforcement is turned on.
          </div>
        )}

        {/* Feedback message */}
        {message && (
          <div className={`rounded-2xl px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border border-green-500/30 bg-green-500/10 text-green-300'
              : 'border border-red-500/30 bg-red-500/10 text-red-300'
          }`}>
            {message.text}
          </div>
        )}

        {/* Plan cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((plan) => {
            const isCurrent = current?.planCode === plan.planCode;
            const isSelecting = selecting === plan.planCode;
            const features = PLAN_FEATURES[plan.planCode] ?? [];

            return (
              <div
                key={plan.planCode}
                className={`relative flex flex-col rounded-3xl border p-5 transition-all ${
                  isCurrent
                    ? 'border-[#F5C76E]/60 bg-[#F5C76E]/5'
                    : 'border-white/10 bg-[#11151c] hover:border-white/20'
                }`}
              >
                {isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#F5C76E] px-3 py-0.5 text-xs font-semibold text-black">
                    Current
                  </div>
                )}

                <div className="mb-4">
                  <div className="text-lg font-semibold">{plan.name}</div>
                  <div className="mt-1 flex items-end gap-1">
                    {plan.priceMonthly === 0 ? (
                      <span className="text-3xl font-bold text-white">Free</span>
                    ) : (
                      <>
                        <span className="text-3xl font-bold text-white">${plan.priceMonthly}</span>
                        <span className="text-sm text-gray-400 mb-1">/mo</span>
                      </>
                    )}
                  </div>
                </div>

                <ul className="flex-1 space-y-2 mb-5">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-300">
                      <CheckIcon />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSelect(plan.planCode)}
                  disabled={isCurrent || !!selecting}
                  className={`w-full rounded-xl py-2 text-sm font-medium transition-all ${
                    isCurrent
                      ? 'bg-[#F5C76E]/20 text-[#F5C76E] cursor-default'
                      : selecting === plan.planCode
                      ? 'bg-white/5 text-gray-400 cursor-wait'
                      : 'bg-white/10 text-white hover:bg-[#F5C76E]/20 hover:text-[#F5C76E] disabled:opacity-40'
                  }`}
                >
                  {isCurrent ? 'Active' : isSelecting ? 'Updating…' : plan.priceMonthly === 0 ? 'Select Free' : `Select ${plan.name}`}
                </button>
              </div>
            );
          })}
        </div>

        {/* Feature comparison table */}
        <div className="bg-[#11151c] border border-white/10 rounded-3xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5">
            <h2 className="text-base font-semibold">Feature Comparison</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left px-6 py-3 text-gray-400 font-normal">Feature</th>
                  {plans.map((p) => (
                    <th
                      key={p.planCode}
                      className={`px-4 py-3 font-medium text-center ${
                        current?.planCode === p.planCode ? 'text-[#F5C76E]' : 'text-gray-300'
                      }`}
                    >
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {[
                  { label: 'Auto Stocks', key: 'maxAutoStocks', format: (v: any) => v >= 999 ? 'Unlimited' : String(v) },
                  { label: 'Manual Cycle', key: 'allowManualCycle', format: (v: any) => v ? '✓' : '—' },
                  { label: 'Cron Automation', key: 'allowCronAutomation', format: (v: any) => v ? '✓' : '—' },
                  { label: 'Broker Connect', key: 'allowBrokerConnect', format: (v: any) => v ? '✓' : '—' },
                  { label: 'Advanced Analytics', key: 'allowAdvancedAnalytics', format: (v: any) => v ? '✓' : '—' },
                  { label: 'Price / mo', key: 'priceMonthly', format: (v: any) => v === 0 ? 'Free' : `$${v}` },
                ].map((row) => (
                  <tr key={row.key}>
                    <td className="px-6 py-3 text-gray-400">{row.label}</td>
                    {plans.map((p) => (
                      <td
                        key={p.planCode}
                        className={`px-4 py-3 text-center ${
                          current?.planCode === p.planCode ? 'text-[#F5C76E]' : 'text-white'
                        }`}
                      >
                        {row.format((p as any)[row.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
