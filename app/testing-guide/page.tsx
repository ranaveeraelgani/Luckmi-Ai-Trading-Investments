"use client";

import Link from "next/link";
import TopNav from "@/components/TopNav";

function Step({
  number,
  title,
  body,
}: {
  number: number;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#141926] p-4">
      <div className="mb-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-500/20 text-sm font-semibold text-blue-300">
        {number}
      </div>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="mt-1 text-sm text-gray-300">{body}</p>
    </div>
  );
}

export default function TestingGuidePage() {
  return (
    <div className="min-h-screen bg-[#0b0f16] text-white">
      <TopNav activePage="testing-guide" />

      <main className="mx-auto max-w-6xl p-4 sm:p-6">
        <section className="rounded-3xl border border-white/10 bg-[#11151c] p-6 sm:p-8">
          <p className="inline-flex items-center rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-300">
            Testing Guide
          </p>
          <h1 className="mt-4 text-3xl font-semibold leading-tight sm:text-4xl">
            How Auto Trading Works in Luckmi
          </h1>
          <p className="mt-4 max-w-3xl text-sm text-gray-300 sm:text-base">
            This guide explains the full flow: add stocks, run the run Trade cycle, review AI decisions,
            and connect Alpaca so executions can run through your broker account.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/auto"
              className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20"
            >
              Open Auto Trading
            </Link>
            <Link
              href="/alpaca"
              className="rounded-2xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-300 transition hover:bg-blue-500/20"
            >
              Open Alpaca Setup
            </Link>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-[#11151c] p-5">
            <h2 className="text-lg font-semibold">1. Add Auto Stocks</h2>
            <p className="mt-2 text-sm text-gray-300">
              In Auto Trading, add symbols and assign allocation. The engine tracks only stocks in
              active statuses: idle, monitoring, or in-position.
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-[#11151c] p-5">
            <h2 className="text-lg font-semibold">2. Run Cycle</h2>
            <p className="mt-2 text-sm text-gray-300">
              A cycle fetches fresh quotes, evaluates buy and sell conditions, and updates each
              stock with AI action, reason, confidence, and CTS context.
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-[#11151c] p-5">
            <h2 className="text-lg font-semibold">3. Persist + Execute</h2>
            <p className="mt-2 text-sm text-gray-300">
              Hold and non-trade state updates are saved. If trades are generated and broker mode
              is enabled, orders are sent through Alpaca and then state is reconciled.
            </p>
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-white/10 bg-[#11151c] p-6 sm:p-8">
          <h2 className="text-2xl font-semibold">How the Auto Trading Engine Decides</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-[#141926] p-4">
              <h3 className="text-sm font-semibold text-emerald-300">Buy Side</h3>
              <p className="mt-2 text-sm text-gray-300">
                For symbols not currently in position, the engine scores trend and setup quality.
                If the signal qualifies, it computes size and opens or adds to position.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#141926] p-4">
              <h3 className="text-sm font-semibold text-rose-300">Sell Side</h3>
              <p className="mt-2 text-sm text-gray-300">
                For open positions, the engine checks risk and momentum. It can fully exit, partial
                sell, buy more on strong continuation, or hold with updated reasoning.
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-200">
            Notes: Hold decisions are saved daily so you can review why the engine stayed patient
            without flooding the history table every cycle.
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-white/10 bg-[#11151c] p-6 sm:p-8">
          <h2 className="text-2xl font-semibold">Connect Alpaca Keys</h2>
          <p className="mt-2 text-sm text-gray-300">
            Use paper trading first. Make sure you generate keys from your Alpaca paper account,
            not live, unless you intentionally want live execution and it is enabled on platform.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Step
              number={1}
              title="Create or open your Alpaca account"
              body="Sign in at Alpaca and switch to Paper environment."
            />
            <Step
              number={2}
              title="Generate API Key + Secret"
              body="In Alpaca dashboard, create API credentials and copy both values once."
            />
            <Step
              number={3}
              title="Open Luckmi Alpaca page"
              body="Go to the Alpaca screen in this app and paste key and secret."
            />
            <Step
              number={4}
              title="Save and test connection"
              body="Use Test Connection. You should see connected status and paper mode."
            />
            <Step
              number={5}
              title="Run one manual cycle"
              body="Run cycle from Auto Trading and verify decisions and trades update correctly."
            />
            <Step
              number={6}
              title="Monitor broker sync"
              body="Keep checking broker status and order reconciliation before larger allocations."
            />
          </div>
        </section>

        <section className="mt-6 mb-10 rounded-3xl border border-white/10 bg-[#11151c] p-6 sm:p-8">
          <h2 className="text-2xl font-semibold">Quick Troubleshooting</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-[#141926] p-4">
              <h3 className="text-sm font-semibold text-white">No trades executed</h3>
              <p className="mt-1 text-sm text-gray-300">
                This can be normal. If conditions do not pass thresholds, the engine records Hold
                with reason and confidence.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#141926] p-4">
              <h3 className="text-sm font-semibold text-white">Broker blocked</h3>
              <p className="mt-1 text-sm text-gray-300">
                Check Alpaca connection status and broker mode flags. Hold-only cycles still save,
                but trade execution requires broker availability.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#141926] p-4">
              <h3 className="text-sm font-semibold text-white">Manual cycle blocked</h3>
              <p className="mt-1 text-sm text-gray-300">
                Manual cooldown may still be active. Wait for cooldown timer and rerun.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#141926] p-4">
              <h3 className="text-sm font-semibold text-white">No auto positions in portfolio</h3>
              <p className="mt-1 text-sm text-gray-300">
                Auto portfolio tab shows actual open positions only. Monitoring stocks appear in
                Auto Trading, not in positions list.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
