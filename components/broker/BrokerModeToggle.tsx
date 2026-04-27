"use client";

import { useEffect, useState } from "react";

type BrokerMode = "paper" | "live";

export default function BrokerModeToggle({
  onChanged,
}: {
  onChanged?: () => void | Promise<void>;
}) {
  const [mode, setMode] = useState<BrokerMode>("paper");
  const [connected, setConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("unknown");
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLiveConfirm, setShowLiveConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    loadMode();
  }, []);

  async function loadMode() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/broker/mode", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to load broker mode");
      }

      setMode(data.mode || "paper");
      setConnected(Boolean(data.connected));
      setConnectionStatus(data.connectionStatus || "unknown");
    } catch (err: any) {
      setError(err?.message || "Failed to load broker mode");
    } finally {
      setLoading(false);
    }
  }

  async function updateMode(nextMode: BrokerMode) {
    try {
      setSwitching(true);
      setError(null);

      const res = await fetch("/api/broker/mode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode: nextMode }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to update broker mode");
      }

      setMode(nextMode);
      await onChanged?.();
    } catch (err: any) {
      setError(err?.message || "Failed to update broker mode");
    } finally {
      setSwitching(false);
      setShowLiveConfirm(false);
      setConfirmText("");
    }
  }

  function handleLiveClick() {
    if (mode === "live") return;
    setShowLiveConfirm(true);
  }

  function handlePaperClick() {
    if (mode === "paper") return;
    updateMode("paper");
  }

  const disabled = loading || switching || !connected;

  return (
    <>
      <section className="rounded-3xl border border-white/5 bg-[#11151C] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Trading Mode</h2>
            <p className="mt-1 text-sm text-gray-400">
              Start with paper trading. Enable live trading only when you are ready.
            </p>
          </div>

          <div
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              connected
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-red-500/30 bg-red-500/10 text-red-300"
            }`}
          >
            {connected ? "Broker Connected" : `Broker ${connectionStatus}`}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={handlePaperClick}
            disabled={disabled || mode === "paper"}
            className={`rounded-2xl border px-4 py-4 text-left transition disabled:cursor-not-allowed ${
              mode === "paper"
                ? "border-emerald-500/40 bg-emerald-500/10"
                : "border-white/10 bg-[#1A1F2B] hover:bg-white/[0.06]"
            }`}
          >
            <div className="text-sm font-semibold text-white">Paper Trading</div>
            <div className="mt-1 text-xs leading-5 text-gray-400">
              Practice with Alpaca paper funds. Recommended for testing and training.
            </div>
          </button>

          <button
            type="button"
            onClick={handleLiveClick}
            disabled={disabled || mode === "live"}
            className={`rounded-2xl border px-4 py-4 text-left transition disabled:cursor-not-allowed ${
              mode === "live"
                ? "border-red-500/40 bg-red-500/10"
                : "border-white/10 bg-[#1A1F2B] hover:bg-white/[0.06]"
            }`}
          >
            <div className="text-sm font-semibold text-white">Live Trading</div>
            <div className="mt-1 text-xs leading-5 text-gray-400">
              Uses real Alpaca account funds. Requires explicit confirmation.
            </div>
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-white/5 bg-[#1A1F2B] p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">
            Current Mode
          </div>
          <div
            className={`mt-1 text-lg font-semibold ${
              mode === "live" ? "text-red-300" : "text-emerald-300"
            }`}
          >
            {mode === "live" ? "Live Trading Active" : "Paper Trading Active"}
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}
      </section>

      {showLiveConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-red-500/30 bg-[#11151C] p-5 shadow-2xl">
            <h3 className="text-xl font-semibold text-white">
              Enable Live Trading?
            </h3>

            <p className="mt-3 text-sm leading-6 text-gray-300">
              You are about to enable real-money trading through your Alpaca account.
              Luckmi AI may place live buy and sell orders when the trading engine runs.
            </p>

            <div className="mt-4 space-y-2 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
              <p>• Real money may be used.</p>
              <p>• Losses are possible.</p>
              <p>• Paper trading should be tested first.</p>
              <p>• You are responsible for reviewing your broker account.</p>
            </div>

            <label className="mt-5 block text-sm text-gray-400">
              Type <span className="font-semibold text-white">ENABLE LIVE</span> to confirm.
            </label>

            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-[#1A1F2B] px-4 py-3 text-white outline-none focus:border-red-400"
              placeholder="ENABLE LIVE"
            />

            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowLiveConfirm(false);
                  setConfirmText("");
                }}
                disabled={switching}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => updateMode("live")}
                disabled={switching || confirmText.trim() !== "ENABLE LIVE"}
                className="rounded-2xl bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {switching ? "Enabling..." : "Enable Live Trading"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}