"use client";

import { useState } from "react";

type AddAutoStockModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (createdStock: any) => void | Promise<void>;
};

export default function AddAutoStockModal({
  isOpen,
  onClose,
  onCreated,
}: AddAutoStockModalProps) {
  const [symbol, setSymbol] = useState("");
  const [allocation, setAllocation] = useState("1000");
  const [compoundProfits, setCompoundProfits] = useState(true);
  const [rinseRepeat, setRinseRepeat] = useState(true);
  const [maxRepeats, setMaxRepeats] = useState("5");
  const [customGuidance, setCustomGuidance] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  function resetForm() {
    setSymbol("");
    setAllocation("1000");
    setCompoundProfits(true);
    setRinseRepeat(true);
    setMaxRepeats("5");
    setCustomGuidance("");
    setError(null);
  }

  function handleClose() {
    if (loading) return;
    resetForm();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmedSymbol = symbol.trim().toUpperCase();
    const parsedAllocation = Number(allocation);
    const parsedMaxRepeats = Number(maxRepeats);

    if (!trimmedSymbol) {
      setError("Please enter a stock symbol.");
      return;
    }

    if (!Number.isFinite(parsedAllocation) || parsedAllocation < 100) {
      setError("Initial allocation must be at least $100.");
      return;
    }

    if (rinseRepeat && (!Number.isFinite(parsedMaxRepeats) || parsedMaxRepeats < 1)) {
      setError("Max repeats must be at least 1.");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/auto-stocks/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          symbol: trimmedSymbol,
          allocation: parsedAllocation,
          compound_profits: compoundProfits,
          rinse_repeat: rinseRepeat,
          max_repeats: rinseRepeat ? parsedMaxRepeats : 0,
          custom_guidance: customGuidance.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to add auto stock");
      }

      await onCreated?.(data);
      resetForm();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to add auto stock");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-gray-700 bg-[#11151c]">
        <div className="border-b border-gray-700 px-6 pb-4 pt-6">
          <h2 className="text-xl font-semibold text-white">Add Stock to Auto Trading</h2>
          <p className="mt-1 text-sm text-gray-400">
            AI will monitor and trade this stock for you.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div>
            <label className="mb-2 block text-sm text-gray-400">Stock Symbol</label>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="e.g. TSLA"
              maxLength={10}
              className="w-full rounded-2xl border border-gray-700 bg-[#1a1f2e] px-4 py-2 text-lg font-medium text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-gray-400">
              Initial Allocation Amount ($)
            </label>
            <input
              type="number"
              min="100"
              value={allocation}
              onChange={(e) => setAllocation(e.target.value)}
              className="w-full rounded-2xl border border-gray-700 bg-[#1a1f2e] px-4 py-2 font-mono text-lg text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between rounded-2xl bg-[#1a1f2e] p-4">
            <div>
              <div className="font-medium text-white">♻️ Compound Profits</div>
              <div className="text-xs text-gray-400">
                Add realized profits back to allocation automatically
              </div>
            </div>

            <button
              type="button"
              onClick={() => setCompoundProfits((prev) => !prev)}
              className={`flex h-7 w-14 items-center rounded-full px-1 transition-colors ${
                compoundProfits ? "bg-emerald-500" : "bg-gray-600"
              }`}
            >
              <div
                className={`h-5 w-5 rounded-full bg-white transition-transform ${
                  compoundProfits ? "translate-x-7" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={rinseRepeat}
              onChange={(e) => setRinseRepeat(e.target.checked)}
              className="mt-1 h-4 w-4 accent-blue-500"
            />
            <div>
              <div className="font-medium text-white">🔄 Repeat</div>
              <div className="text-xs text-gray-400">
                Continue trading this stock after each sell
              </div>
            </div>
          </div>

          {rinseRepeat ? (
            <div>
              <label className="mb-2 block text-sm text-gray-400">Maximum Repeats</label>
              <select
                value={maxRepeats}
                onChange={(e) => setMaxRepeats(e.target.value)}
                className="w-full rounded-2xl border border-gray-700 bg-[#1a1f2e] px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
              >
                {[3, 5, 7, 10].map((n) => (
                  <option key={n} value={n}>
                    {n} times
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div>
            <label className="mb-2 block text-sm text-gray-400">
              Custom AI Guidance (Optional)
            </label>
            <textarea
              value={customGuidance}
              onChange={(e) => setCustomGuidance(e.target.value)}
              placeholder="e.g. Be more aggressive on momentum, avoid trading during earnings"
              className="h-20 w-full resize-y rounded-2xl border border-gray-700 bg-[#1a1f2e] px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <div className="flex gap-3 border-t border-gray-700 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 rounded-2xl py-2.5 font-medium text-gray-400 transition-colors hover:text-white"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={!symbol.trim() || loading}
              className="flex-1 rounded-2xl bg-blue-600 py-2.5 font-medium text-white transition-colors hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500"
            >
              {loading ? "Adding..." : "Add to Auto Trading"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}