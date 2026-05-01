'use client';

import { useEffect, useState } from 'react';
import TopNav from '@/components/TopNav';
import Link from 'next/link';

const ALL_PLANS = ['free', 'basic', 'pro', 'elite'];

type Campaign = {
  id: string;
  name: string;
  description: string | null;
  discountPercent: number;
  eligiblePlans: string[];
  maxRedemptions: number | null;
  redemptionCount: number;
  startsAt: string;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
};

const emptyForm = {
  name: '',
  description: '',
  discountPercent: 10,
  eligiblePlans: ['basic', 'pro', 'elite'] as string[],
  maxRedemptions: '' as string | number,
  startsAt: new Date().toISOString().slice(0, 16),
  expiresAt: '',
};

function StatusBadge({ campaign }: { campaign: Campaign }) {
  const now = new Date();
  const expired = campaign.expiresAt && new Date(campaign.expiresAt) < now;
  const notStarted = new Date(campaign.startsAt) > now;
  const maxed = campaign.maxRedemptions !== null && campaign.redemptionCount >= campaign.maxRedemptions;

  if (!campaign.isActive) return <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-gray-400">Inactive</span>;
  if (expired) return <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-400">Expired</span>;
  if (notStarted) return <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">Scheduled</span>;
  if (maxed) return <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-xs text-orange-400">Limit reached</span>;
  return <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-400">Active</span>;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/campaigns');
      const json = await res.json();
      setCampaigns(json?.campaigns ?? []);
    } catch {
      setMessage({ type: 'error', text: 'Failed to load campaigns.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCampaigns(); }, []);

  const togglePlan = (plan: string) => {
    setForm((f) => ({
      ...f,
      eligiblePlans: f.eligiblePlans.includes(plan)
        ? f.eligiblePlans.filter((p) => p !== plan)
        : [...f.eligiblePlans, plan],
    }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          description: form.description || null,
          discountPercent: Number(form.discountPercent),
          eligiblePlans: form.eligiblePlans,
          maxRedemptions: form.maxRedemptions === '' ? null : Number(form.maxRedemptions),
          startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
          expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Failed to create campaign');
      setMessage({ type: 'success', text: `Campaign "${json.campaign.name}" created.` });
      setForm(emptyForm);
      setShowForm(false);
      fetchCampaigns();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message ?? 'Something went wrong.' });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (campaign: Campaign) => {
    setTogglingId(campaign.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/campaigns/${campaign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !campaign.isActive }),
      });
      if (!res.ok) throw new Error('Failed to update');
      setCampaigns((prev) => prev.map((c) => c.id === campaign.id ? { ...c, isActive: !c.isActive } : c));
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message });
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete campaign "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/campaigns/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
      setMessage({ type: 'success', text: `Campaign "${name}" deleted.` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f16] text-white">
      <TopNav activePage="admin-reports" />

      <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500 mb-1">
              <Link href="/admin" className="hover:text-gray-300">Admin</Link>
              <span className="mx-1">›</span>
              <span>Campaigns</span>
            </div>
            <h1 className="text-2xl font-semibold">Subscription Campaigns</h1>
            <p className="text-sm text-gray-400 mt-0.5">Create and manage discount campaigns for subscription plans.</p>
          </div>
          <button
            onClick={() => { setShowForm((v) => !v); setMessage(null); }}
            className="rounded-xl bg-[#F5C76E]/10 border border-[#F5C76E]/30 px-4 py-2 text-sm font-medium text-[#F5C76E] hover:bg-[#F5C76E]/20 transition-all"
          >
            {showForm ? 'Cancel' : '+ New Campaign'}
          </button>
        </div>

        {/* Feedback */}
        {message && (
          <div className={`rounded-2xl px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border border-green-500/30 bg-green-500/10 text-green-300'
              : 'border border-red-500/30 bg-red-500/10 text-red-300'
          }`}>
            {message.text}
          </div>
        )}

        {/* Create form */}
        {showForm && (
          <form onSubmit={handleCreate} className="bg-[#11151c] border border-white/10 rounded-3xl p-6 space-y-5">
            <h2 className="text-base font-semibold">New Campaign</h2>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Campaign Name *</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Launch Special"
                  className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#F5C76E]/50"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Discount % *</label>
                <input
                  required
                  type="number"
                  min={1}
                  max={100}
                  value={form.discountPercent}
                  onChange={(e) => setForm((f) => ({ ...f, discountPercent: Number(e.target.value) }))}
                  className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F5C76E]/50"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Description</label>
              <input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional description shown to users"
                className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#F5C76E]/50"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-2">Eligible Plans *</label>
              <div className="flex flex-wrap gap-2">
                {ALL_PLANS.map((plan) => (
                  <button
                    key={plan}
                    type="button"
                    onClick={() => togglePlan(plan)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-medium border transition-all capitalize ${
                      form.eligiblePlans.includes(plan)
                        ? 'border-[#F5C76E]/50 bg-[#F5C76E]/10 text-[#F5C76E]'
                        : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20'
                    }`}
                  >
                    {plan}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Max Redemptions</label>
                <input
                  type="number"
                  min={1}
                  value={form.maxRedemptions}
                  onChange={(e) => setForm((f) => ({ ...f, maxRedemptions: e.target.value }))}
                  placeholder="Unlimited"
                  className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#F5C76E]/50"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Starts At</label>
                <input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                  className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F5C76E]/50"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Expires At</label>
                <input
                  type="datetime-local"
                  value={form.expiresAt}
                  onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                  placeholder="Never"
                  className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F5C76E]/50"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || form.eligiblePlans.length === 0}
                className="rounded-xl bg-[#F5C76E]/10 border border-[#F5C76E]/30 px-5 py-2 text-sm font-medium text-[#F5C76E] hover:bg-[#F5C76E]/20 disabled:opacity-40 transition-all"
              >
                {submitting ? 'Creating…' : 'Create Campaign'}
              </button>
            </div>
          </form>
        )}

        {/* Campaigns list */}
        {loading ? (
          <div className="text-sm text-gray-400">Loading campaigns…</div>
        ) : campaigns.length === 0 ? (
          <div className="bg-[#11151c] border border-white/10 rounded-3xl p-8 text-center text-sm text-gray-400">
            No campaigns yet. Create one to get started.
          </div>
        ) : (
          <div className="space-y-3">
            {campaigns.map((c) => (
              <div key={c.id} className="bg-[#11151c] border border-white/10 rounded-3xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{c.name}</span>
                      <StatusBadge campaign={c} />
                      <span className="rounded-full bg-[#F5C76E]/10 px-2 py-0.5 text-xs text-[#F5C76E] font-medium">
                        {c.discountPercent}% off
                      </span>
                    </div>
                    {c.description && <p className="text-sm text-gray-400 mt-1">{c.description}</p>}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span>Plans: <span className="text-gray-300 capitalize">{c.eligiblePlans.join(', ')}</span></span>
                      <span>
                        Redemptions: <span className="text-gray-300">{c.redemptionCount}{c.maxRedemptions !== null ? ` / ${c.maxRedemptions}` : ''}</span>
                      </span>
                      <span>Starts: <span className="text-gray-300">{new Date(c.startsAt).toLocaleDateString()}</span></span>
                      {c.expiresAt && <span>Expires: <span className="text-gray-300">{new Date(c.expiresAt).toLocaleDateString()}</span></span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => toggleActive(c)}
                      disabled={togglingId === c.id}
                      className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-40 ${
                        c.isActive
                          ? 'border-white/10 text-gray-400 hover:border-red-500/30 hover:text-red-400'
                          : 'border-green-500/30 text-green-400 hover:bg-green-500/10'
                      }`}
                    >
                      {togglingId === c.id ? '…' : c.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => handleDelete(c.id, c.name)}
                      disabled={deletingId === c.id}
                      className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-gray-500 hover:border-red-500/30 hover:text-red-400 transition-all disabled:opacity-40"
                    >
                      {deletingId === c.id ? '…' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
