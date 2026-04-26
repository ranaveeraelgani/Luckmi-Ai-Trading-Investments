"use client";

import { useMemo, useState } from "react";

type BuyMoreModalProps = {
  isOpen: boolean;
  stock: {
    symbol: string;
    allocation?: number;
    open_position?: {
      shares?: number;
      entry_price?: number;
    } | null;
  } | null;
  currentPrice?: number | string | null;
  onClose: () => void;
  onConfirm: (amount: number) => Promise<void> | void;
};

function toNumber(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export default function BuyMoreModal({
  isOpen,
  stock,
  currentPrice,
  onClose,
  onConfirm,
}: BuyMoreModalProps) {
  const [buyMoreAmount, setBuyMoreAmount] = useState("0");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalAllocation = toNumber(stock?.allocation);
  const invested = toNumber(stock?.open_position?.shares) * toNumber(stock?.open_position?.entry_price);
  const remaining = Math.max(0, totalAllocation - invested);

  const parsedBuyMoreAmount = useMemo(() => Number(buyMoreAmount), [buyMoreAmount]);

  if (!isOpen || !stock) return null;

  function resetState() {
    setBuyMoreAmount("0");
    setError(null);
  }

  function handleClose() {
    if (loading) return;
    resetState();
    onClose();
  }

  async function handleConfirm() {
    if (!Number.isFinite(parsedBuyMoreAmount) || parsedBuyMoreAmount <= 0) {
      setError("Please enter a valid amount greater than 0.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await onConfirm(parsedBuyMoreAmount);
      resetState();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to add capital");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-gray-700 bg-[#11151c]">
        <div className="border-b border-gray-700 px-6 pb-4 pt-6">
          <h2 className="text-xl font-semibold text-white">Buy More {stock.symbol}</h2>
          <p className="mt-1 text-sm text-gray-400">
            Add more capital to this auto trading position
          </p>
        </div>

        <div className="space-y-6 p-6">
          <div className="rounded-2xl bg-[#1a1f2e] p-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-xs text-gray-400">Total Allocation</div>
                <div className="mt-1 font-mono font-medium text-white">
                  ${totalAllocation.toLocaleString()}
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-400">Invested</div>
                <div className="mt-1 font-mono text-white">${invested.toFixed(0)}</div>
              </div>

              <div>
                <div className="text-xs text-gray-400">Remaining</div>
                <div className="mt-1 font-mono text-emerald-400">
                  ${remaining.toFixed(0)}
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm text-gray-400">
              Additional Allocation Amount ($)
            </label>
            <input
              type="number"
              min="100"
              value={buyMoreAmount}
              onChange={(e) => setBuyMoreAmount(e.target.value)}
              placeholder="5000"
              className="w-full rounded-2xl border border-gray-700 bg-[#1a1f2e] px-5 py-4 font-mono text-2xl text-white focus:border-blue-500 focus:outline-none"
            />
            <p className="mt-2 text-xs text-gray-500">
              This will increase the total capital the AI can use for {stock.symbol}.
            </p>
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex gap-3 border-t border-gray-700 p-4">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 rounded-2xl py-3.5 font-medium text-gray-400 transition-colors hover:text-white"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 rounded-2xl bg-blue-600 py-3 font-medium text-white transition-colors hover:bg-blue-700"
          >
            {loading ? "Adding..." : "Confirm Add Capital"}
          </button>
        </div>
      </div>
    </div>
  );
}