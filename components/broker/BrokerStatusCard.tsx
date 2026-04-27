"use client";

import { useEffect, useState } from "react";
import SyncAlpacaButton from "@/components/broker/SyncAlpacaButton";

function formatMoney(value?: number | string | null) {
  const num = Number(value);
  return Number.isFinite(num)
    ? `$${num.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
    : "—";
}

function formatDate(value?: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

export default function BrokerStatusCard() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    try {
      setLoading(true);
      const res = await fetch("/api/broker/alpaca/status", {
        cache: "no-store",
      });
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.error("Failed to load broker status", err);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  const account = status?.account;

  return (
    <section className="rounded-3xl border border-gray-800 bg-[#11151c]">
      <div className="flex flex-col gap-3 border-b border-gray-800 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Alpaca Broker</h2>
          <p className="mt-1 text-sm text-gray-400">
            Synced account, buying power, positions, and recent orders.
          </p>
        </div>

        <SyncAlpacaButton onSynced={loadStatus} />
      </div>

      <div className="p-5">
        {loading ? (
          <div className="text-sm text-gray-400">Loading broker status...</div>
        ) : !account ? (
          <div className="rounded-2xl bg-[#1a1f2e] p-4 text-sm text-gray-400">
            No synced Alpaca account yet. Click Sync Alpaca after connecting keys.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl bg-[#1a1f2e] p-4">
                <div className="text-xs text-gray-400">Portfolio Value</div>
                <div className="mt-1 text-lg font-semibold text-white">
                  {formatMoney(account.portfolio_value)}
                </div>
              </div>

              <div className="rounded-2xl bg-[#1a1f2e] p-4">
                <div className="text-xs text-gray-400">Buying Power</div>
                <div className="mt-1 text-lg font-semibold text-white">
                  {formatMoney(account.buying_power)}
                </div>
              </div>

              <div className="rounded-2xl bg-[#1a1f2e] p-4">
                <div className="text-xs text-gray-400">Cash</div>
                <div className="mt-1 text-lg font-semibold text-white">
                  {formatMoney(account.cash)}
                </div>
              </div>

              <div className="rounded-2xl bg-[#1a1f2e] p-4">
                <div className="text-xs text-gray-400">Last Sync</div>
                <div className="mt-1 text-sm font-medium text-white">
                  {formatDate(account.last_synced_at)}
                </div>
              </div>
            </div>

            {(account.trading_blocked ||
              account.account_blocked ||
              account.transfers_blocked) && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                Alpaca account has a broker restriction. Review account status before trading.
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}