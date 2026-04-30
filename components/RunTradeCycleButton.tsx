"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

function subscriptionsEnforced(): boolean {
  return String(process.env.NEXT_PUBLIC_SUBSCRIPTIONS_ENFORCED).toLowerCase() === "true";
}

const COOLDOWN_SECONDS = subscriptionsEnforced() ? 180 : 60;

function getStorageKey() {
  return "user-run-cycle-cooldown";
}

type RunTradeCycleButtonProps = {
  fetchAutoStocks: () => Promise<void>;
  fetchLastRun: () => Promise<void>;
  addToAutoLog: (message: string) => void;
  setIsAiThinking: (value: boolean) => void;
  className?: string;
};

export default function RunTradeCycleButton({
  fetchAutoStocks,
  fetchLastRun,
  addToAutoLog,
  setIsAiThinking,
  className = "",
}: RunTradeCycleButtonProps) {
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [cooldownStarted, setCooldownStarted] = useState(false);

  useEffect(() => {
    function syncCooldown() {
      const raw = window.localStorage.getItem(getStorageKey());

      if (!raw) {
        setRemainingSeconds(0);
        return;
      }

      const cooldownUntil = Number(raw);

      if (!cooldownUntil || Number.isNaN(cooldownUntil)) {
        window.localStorage.removeItem(getStorageKey());
        setRemainingSeconds(0);
        return;
      }

      const secondsLeft = Math.max(
        0,
        Math.ceil((cooldownUntil - Date.now()) / 1000)
      );

      if (secondsLeft <= 0) {
        window.localStorage.removeItem(getStorageKey());
        setRemainingSeconds(0);
        return;
      }

      setRemainingSeconds(secondsLeft);
    }

    syncCooldown();

    const interval = window.setInterval(syncCooldown, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const isCoolingDown = remainingSeconds > 0;

  const buttonLabel = useMemo(() => {
    if (cooldownStarted && isCoolingDown) {
      return `🔄 Wait ${remainingSeconds}s`;
    }

    if (isCoolingDown) {
      return `🔄 Wait ${remainingSeconds}s`;
    }

    return "🔄 Run Trade Cycle";
  }, [cooldownStarted, isCoolingDown, remainingSeconds]);

  async function handleRun() {
    if (isCoolingDown) {
      addToAutoLog(`Manual cycle blocked: cooldown active (${remainingSeconds}s left)`);
      return;
    }

    const processingToastId = toast.loading(
      "Running trade cycle. Luckmi AI is evaluating and processing your stocks, please wait..."
    );

    try {
      setIsAiThinking(true);
      setCooldownStarted(false);

      const res = await fetch("/api/engine/run-cycle-user");

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        // ignore json parse failure
      }

      if (!res.ok) {
        throw new Error(data?.message || data?.error || "Manual cycle failed");
      }

      const status = data?.status || "success";
      const message = data?.message || "";
      const processed = data?.processed ?? 0;
      const tradesExecuted = data?.tradesExecuted ?? 0;

      if (status === "success" || status === "blocked") {
        const cooldownUntil = Date.now() + COOLDOWN_SECONDS * 1000;
        window.localStorage.setItem(getStorageKey(), String(cooldownUntil));
        setRemainingSeconds(COOLDOWN_SECONDS);
        setCooldownStarted(true);
      }

      await fetchAutoStocks();
      await fetchLastRun();

      if (status === "success") {
        addToAutoLog(
          `Manual cycle completed • ${processed} stocks processed • ${tradesExecuted} trades executed`
        );
        toast.success("Trade cycle completed.", { id: processingToastId });
      } else if (status === "blocked") {
        addToAutoLog(
          `Manual cycle blocked${message ? ` • ${message}` : ""}`
        );
        toast(message || "Trade cycle blocked.", { id: processingToastId });
      } else {
        addToAutoLog("Manual cycle finished");
        toast.success("Trade cycle finished.", { id: processingToastId });
      }
    } catch (err: any) {
      console.error("Manual cycle failed:", err);
      addToAutoLog(err?.message || "Manual cycle failed");
      toast.error(err?.message || "Manual cycle failed", { id: processingToastId });
    } finally {
      setIsAiThinking(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleRun}
        disabled={isCoolingDown}
        className={`rounded-2xl px-6 py-3 font-medium flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-purple-600 hover:bg-purple-700 ${className}`}
      >
        {buttonLabel}
      </button>

      {isCoolingDown && (
        <p className="text-sm text-amber-300">
          Cooldown active. You can run another manual cycle in {remainingSeconds}s.
        </p>
      )}
    </div>
  );
}