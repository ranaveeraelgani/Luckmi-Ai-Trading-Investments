"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const COOLDOWN_SECONDS = 180;

function getStorageKey(userId: string) {
  return `admin-run-cycle-cooldown:${userId}`;
}

export function AdminRunCycleButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [isRefreshing, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"default" | "success" | "error">("default");
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  useEffect(() => {
    const key = getStorageKey(userId);

    function syncCooldown() {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        setRemainingSeconds(0);
        return;
      }

      const cooldownUntil = Number(raw);
      if (!cooldownUntil || Number.isNaN(cooldownUntil)) {
        window.localStorage.removeItem(key);
        setRemainingSeconds(0);
        return;
      }

      const secondsLeft = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));

      if (secondsLeft <= 0) {
        window.localStorage.removeItem(key);
        setRemainingSeconds(0);
        return;
      }

      setRemainingSeconds(secondsLeft);
    }

    syncCooldown();

    const interval = window.setInterval(syncCooldown, 1000);
    return () => window.clearInterval(interval);
  }, [userId]);

  const isCoolingDown = remainingSeconds > 0;
  const isBusy = loading || isRefreshing || isCoolingDown;

  const buttonLabel = useMemo(() => {
    if (loading) return "Running Engine...";
    if (isRefreshing) return "Refreshing...";
    if (isCoolingDown) return `Wait ${remainingSeconds}s`;
    return "Run Engine";
  }, [loading, isRefreshing, isCoolingDown, remainingSeconds]);

  async function handleRun() {
    if (isCoolingDown || loading || isRefreshing) return;

    try {
      setLoading(true);
      setMessage(null);
      setMessageTone("default");

      const res = await fetch(`/api/admin/users/${userId}/run-cycle`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || "Failed to run engine");
      }

      const status = data.status || "unknown";
      const tradesExecuted = data.tradesExecuted ?? 0;
      const processed = data.processed ?? 0;
      const details = data.message ? ` • ${data.message}` : "";

      if (status === "success") {
        const cooldownUntil = Date.now() + COOLDOWN_SECONDS * 1000;
        window.localStorage.setItem(getStorageKey(userId), String(cooldownUntil));
        setRemainingSeconds(COOLDOWN_SECONDS);
      }

      setMessageTone(
        status === "failed" ? "error" : status === "success" ? "success" : "default"
      );
      setMessage(
        `Run ${status} • ${processed} stocks processed • ${tradesExecuted} trades${details}`
      );

      startTransition(() => {
        router.refresh();
      });
    } catch (error: any) {
      setMessageTone("error");
      setMessage(error.message || "Run failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex w-full flex-col items-stretch gap-2 sm:items-end">
      <button
        type="button"
        onClick={handleRun}
        disabled={isBusy}
        className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {buttonLabel}
      </button>

      {message ? (
        <p
          className={`max-w-md text-sm sm:text-right ${
            messageTone === "success"
              ? "text-emerald-300"
              : messageTone === "error"
              ? "text-red-300"
              : "text-gray-400"
          }`}
        >
          {message}
        </p>
      ) : isCoolingDown ? (
        <p className="max-w-md text-sm text-amber-300 sm:text-right">
          Cooldown active. You can run this user again in {remainingSeconds}s.
        </p>
      ) : null}
    </div>
  );
}