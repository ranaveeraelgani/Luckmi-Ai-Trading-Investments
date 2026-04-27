"use client";

import { useEffect, useState } from "react";

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function statusClass(status: string) {
  if (status === "success") return "text-emerald-300 bg-emerald-500/10 border-emerald-500/20";
  if (status === "failed") return "text-red-300 bg-red-500/10 border-red-500/20";
  if (status === "skipped") return "text-[#F5C76E] bg-[#F5C76E]/10 border-[#F5C76E]/20";
  return "text-gray-300 bg-white/5 border-white/10";
}

export default function CronRunsCard() {
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRuns();
  }, []);

  async function loadRuns() {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/cron-runs", { cache: "no-store" });
      const data = await res.json();
      setRuns(data?.runs || []);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-3xl border border-white/5 bg-[#11151C]">
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Cron Runs</h2>
          <p className="mt-1 text-sm text-gray-400">
            Recent scheduled market-cycle executions.
          </p>
        </div>

        <button
          onClick={loadRuns}
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10"
        >
          Refresh
        </button>
      </div>

      <div className="p-5">
        {loading ? (
          <div className="text-sm text-gray-400">Loading cron runs...</div>
        ) : runs.length === 0 ? (
          <div className="text-sm text-gray-400">No cron runs logged yet.</div>
        ) : (
          <div className="space-y-3">
            {runs.map((run) => (
              <div
                key={run.id}
                className="rounded-2xl border border-white/5 bg-[#1A1F2B] p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="font-medium text-white">{run.job_name}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      {formatDate(run.started_at)}
                    </div>
                  </div>

                  <span
                    className={`w-fit rounded-full border px-3 py-1 text-xs font-medium ${statusClass(
                      run.status
                    )}`}
                  >
                    {run.status}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-xl bg-[#11151C] p-3">
                    <div className="text-[10px] uppercase text-gray-500">Users</div>
                    <div className="text-sm font-semibold text-white">
                      {run.users_processed}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#11151C] p-3">
                    <div className="text-[10px] uppercase text-gray-500">Stocks</div>
                    <div className="text-sm font-semibold text-white">
                      {run.stocks_processed}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#11151C] p-3">
                    <div className="text-[10px] uppercase text-gray-500">Trades</div>
                    <div className="text-sm font-semibold text-white">
                      {run.trades_executed}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#11151C] p-3">
                    <div className="text-[10px] uppercase text-gray-500">Duration</div>
                    <div className="text-sm font-semibold text-white">
                      {run.duration_ms ? `${run.duration_ms}ms` : "—"}
                    </div>
                  </div>
                </div>

                {run.skip_reason && (
                  <div className="mt-3 text-sm text-[#F5C76E]">
                    Skipped: {run.skip_reason}
                  </div>
                )}

                {run.error_message && (
                  <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                    {run.error_message}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}