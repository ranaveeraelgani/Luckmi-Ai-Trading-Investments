"use client";

import LuckmiAiIcon from "@/components/brand/LuckmiAiIcon";

type AutoTradingGuideModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

function GuideBlock({
  title,
  description,
  className = "",
}: {
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-[#0F141E] p-4 ${className}`}>
      <div className="text-sm font-semibold text-white">{title}</div>
      <p className="mt-2 text-sm leading-6 text-gray-300">{description}</p>
    </div>
  );
}

export default function AutoTradingGuideModal({
  isOpen,
  onClose,
}: AutoTradingGuideModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/80 p-4 sm:p-6">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-white/10 bg-[#11151C] shadow-2xl">
        <div className="p-5 sm:p-7">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <LuckmiAiIcon size={40} />
              <div>
                <h2 className="text-2xl font-semibold text-white sm:text-3xl">
                  How Auto Trading Works
                </h2>
                <p className="mt-1 text-sm text-gray-400">
                  Understand every card, where to click, and how the engine cycle behaves.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-3 py-1 text-2xl text-gray-400 transition hover:bg-white/5 hover:text-white"
              aria-label="Close auto trading guide"
            >
              ✕
            </button>
          </div>

          <div className="space-y-6">
            <section className="grid gap-3 lg:grid-cols-2">
              <GuideBlock
                title="1) Auto Portfolio Summary"
                description="Shows total allocated capital, open positions, unrealized P/L, and latest run result. Use this as your top-level health check before drilling into symbols."
              />
              <GuideBlock
                title="2) Engine Control"
                description="Run a manual cycle anytime with Run Trade Cycle. The countdown estimates time to the next automated cycle. Use manual run after adding stocks or changing allocation if you want immediate evaluation."
              />
              <GuideBlock
                title="3) Broker Status"
                description="Confirms broker connectivity and account state. If broker is disconnected, the system can still score, but execution-related actions can be limited."
              />
              <GuideBlock
                title="4) Auto Stock List"
                description="Each symbol card shows status, allocation, position metrics, and AI action. Use filters for In Position, Sell, and Idle, then sort by Allocation, P/L, or Symbol."
              />
              <GuideBlock
                title="5) Tap a Stock for Details"
                description="Clicking a stock opens the detail sheet. Overview shows position metrics and latest AI reasoning. Trades shows symbol-level trade history."
              />
              <GuideBlock
                title="6) Expandable Trade AI Analysis"
                description="In Trades, click Show AI Decision on any row to expand confidence, score tags, and the reasoning text captured at buy or sell time."
              />
            </section>

            <section className="rounded-3xl border border-[#F5C76E]/20 bg-[#F5C76E]/[0.06] p-5">
              <h3 className="text-lg font-semibold text-white">Why the core engine runs every 20 minutes</h3>
              <p className="mt-3 text-sm leading-6 text-gray-300">
                20 minutes is a balance between responsiveness and stability. It is fast enough to react during market hours, while reducing overtrading noise, API pressure, and repeated churn from short-lived price flickers.
              </p>
              <p className="mt-2 text-sm leading-6 text-gray-300">
                If you need immediate evaluation between automated cycles, use manual run from Engine Control.
              </p>
            </section>

            <section className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-5">
              <h3 className="text-lg font-semibold text-white">Common actions</h3>
              <p className="mt-3 text-sm leading-6 text-gray-300">
                Add Auto Stock to start tracking, Add Capital to increase allocation, Sell to close an open position, and Remove to stop tracking a symbol with no open position.
              </p>
              <p className="mt-2 text-sm leading-6 text-gray-300">
                Activity Log captures these events so users can quickly verify what happened on this page.
              </p>
            </section>
          </div>
        </div>

        <div className="flex justify-end border-t border-white/5 p-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-black transition hover:bg-emerald-400"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
