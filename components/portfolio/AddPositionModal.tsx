"use client";

import { useState } from "react";

type AddPositionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void | Promise<void>;
};

export default function AddPositionModal({
  isOpen,
  onClose,
  onCreated,
}: AddPositionModalProps) {
  const [symbol, setSymbol] = useState("");
  const [shares, setShares] = useState("");
  const [avgPrice, setAvgPrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  function resetForm() {
    setSymbol("");
    setShares("");
    setAvgPrice("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmedSymbol = symbol.trim().toUpperCase();
    const parsedShares = Number(shares);
    const parsedAvgPrice = Number(avgPrice);

    if (!trimmedSymbol) {
      setError("Symbol is required.");
      return;
    }

    if (!Number.isFinite(parsedShares) || parsedShares <= 0) {
      setError("Shares must be greater than 0.");
      return;
    }

    if (!Number.isFinite(parsedAvgPrice) || parsedAvgPrice <= 0) {
      setError("Average price must be greater than 0.");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/portfolio/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          symbol: trimmedSymbol,
          shares: parsedShares,
          avgPrice: parsedAvgPrice,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to add position");
      }

      await onCreated?.();
      resetForm();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to add position");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    if (loading) return;
    resetForm();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-3xl border border-gray-800 bg-[#11151c] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-800 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Add Position</h2>
            <p className="mt-1 text-sm text-gray-400">
              Add a holding to your portfolio.
            </p>
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="rounded-xl border border-gray-700 px-3 py-1.5 text-sm text-gray-300 transition hover:bg-[#161b22] disabled:opacity-50"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-5 py-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <label className="mb-2 block text-sm font-medium text-gray-300">
                Symbol
              </label>
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="AAPL"
                maxLength={10}
                disabled={loading}
                className="w-full rounded-2xl border border-gray-700 bg-[#0f141b] px-4 py-3 text-white outline-none placeholder:text-gray-500 focus:border-blue-500 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">
                Shares
              </label>
              <input
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                type="number"
                min="0"
                step="0.0001"
                placeholder="10"
                disabled={loading}
                className="w-full rounded-2xl border border-gray-700 bg-[#0f141b] px-4 py-3 text-white outline-none placeholder:text-gray-500 focus:border-blue-500 disabled:opacity-50"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-2 block text-sm font-medium text-gray-300">
                Average Price
              </label>
              <input
                value={avgPrice}
                onChange={(e) => setAvgPrice(e.target.value)}
                type="number"
                min="0"
                step="0.01"
                placeholder="185.50"
                disabled={loading}
                className="w-full rounded-2xl border border-gray-700 bg-[#0f141b] px-4 py-3 text-white outline-none placeholder:text-gray-500 focus:border-blue-500 disabled:opacity-50"
              />
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="rounded-2xl border border-gray-700 bg-[#0f141b] px-4 py-3 text-sm font-medium text-white transition hover:border-gray-500 disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading}
              className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Adding..." : "Add Position"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}