"use client";

import { useState } from "react";
import { toast } from "sonner";

export default function SyncAlpacaButton({
  onSynced,
}: {
  onSynced?: () => void | Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSync() {
    const processingToastId = toast.loading(
      "Refreshing broker positions. System is syncing with Alpaca, please wait..."
    );

    try {
      setLoading(true);
      setMessage(null);

      const res = await fetch("/api/broker/alpaca/sync", {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to sync Alpaca");
      }

      setMessage("Positions refreshed");
      await onSynced?.();
      toast.success("Positions refreshed successfully.", { id: processingToastId });
    } catch (err: any) {
      setMessage(err?.message || "Sync failed");
      toast.error(err?.message || "Sync failed", { id: processingToastId });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={handleSync}
        disabled={loading}
        className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Refreshing..." : "Refresh Positions"}
      </button>

      {message ? <div className="text-xs text-gray-400">{message}</div> : null}
    </div>
  );
}