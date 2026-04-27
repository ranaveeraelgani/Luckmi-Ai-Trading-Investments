"use client";

import { useMemo, useState } from "react";

type RefreshAiAnalysisModalProps = {
  isOpen: boolean;
  symbol: string;
  loading?: boolean;
  onClose: () => void;
  onRefresh: (instruction?: string) => Promise<void> | void;
};

const PRESET_OPTIONS = [
  "Be more conservative",
  "Focus on downside risk",
  "Compare to SPY",
  "Explain the volume",
  "Look at longer-term trend",
  "Highlight risks",
  "Be more aggressive",
  "Focus on momentum",
  "Consider recent news",
];

export default function RefreshAiAnalysisModal({
  isOpen,
  symbol,
  loading = false,
  onClose,
  onRefresh,
}: RefreshAiAnalysisModalProps) {
  const [selectedPresets, setSelectedPresets] = useState<string[]>([]);
  const [customInstruction, setCustomInstruction] = useState("");

  const canSubmit = useMemo(() => {
    return selectedPresets.length > 0 || customInstruction.trim().length > 0;
  }, [selectedPresets, customInstruction]);

  if (!isOpen) return null;

  function resetState() {
    setSelectedPresets([]);
    setCustomInstruction("");
  }

  function handleClose() {
    if (loading) return;
    resetState();
    onClose();
  }

  async function handleRefresh() {
    const combinedInstruction = [...selectedPresets, customInstruction.trim()]
      .filter(Boolean)
      .join(". ");

    await onRefresh(combinedInstruction || undefined);
    resetState();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-gray-700 bg-[#11151c]">
        <div className="border-b border-gray-700 px-6 pb-4 pt-6">
          <h2 className="text-xl font-semibold text-white">Refresh AI Analysis</h2>
          <p className="mt-1 text-sm text-gray-400">
            For <span className="font-medium text-white">{symbol}</span>
          </p>
        </div>

        <div className="space-y-6 p-6">
          <div>
            <p className="mb-3 text-sm text-gray-400">
              Quick focus areas (select up to 3):
            </p>

            <div className="flex flex-wrap gap-2">
              {PRESET_OPTIONS.map((option) => {
                const isSelected = selectedPresets.includes(option);

                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setSelectedPresets((prev) => prev.filter((p) => p !== option));
                        return;
                      }

                      if (selectedPresets.length < 3) {
                        setSelectedPresets((prev) => [...prev, option]);
                      }
                    }}
                    className={`rounded-2xl border px-4 py-2 text-sm transition-all ${
                      isSelected
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-gray-700 bg-[#1a1f2e] text-gray-300 hover:bg-[#242a3a]"
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>

            {selectedPresets.length > 0 ? (
              <p className="mt-2 text-xs text-blue-400">
                Selected: {selectedPresets.length}/3
              </p>
            ) : null}
          </div>

          <div>
            <label className="mb-2 block text-sm text-gray-400">
              Or type your own instruction (optional, max 100 characters)
            </label>

            <input
              type="text"
              value={customInstruction}
              onChange={(e) => setCustomInstruction(e.target.value)}
              placeholder="e.g. Focus more on risk management"
              maxLength={100}
              className="w-full rounded-2xl border border-gray-700 bg-[#1a1f2e] px-4 py-3 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            />

            <div className="mt-1 text-right text-xs text-gray-500">
              {customInstruction.length}/100
            </div>
          </div>
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
            onClick={handleRefresh}
            disabled={!canSubmit || loading}
            className="flex-1 rounded-2xl bg-blue-600 py-3.5 font-medium text-white transition-colors hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500"
          >
            {loading ? "Refreshing..." : "Refresh Analysis"}
          </button>
        </div>
      </div>
    </div>
  );
}