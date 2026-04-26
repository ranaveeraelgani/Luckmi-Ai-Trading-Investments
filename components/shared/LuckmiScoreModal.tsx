"use client";

import LuckmiAiIcon from "@/components/brand/LuckmiAiIcon";

type LuckmiScoreModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

function ScoreZone({
  range,
  title,
  description,
  className,
}: {
  range: string;
  title: string;
  description: string;
  className: string;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${className}`}>
      <div className="text-sm font-semibold">{range}</div>
      <div className="mt-1 font-medium text-white">{title}</div>
      <div className="mt-1 text-xs leading-5 text-gray-400">{description}</div>
    </div>
  );
}

export default function LuckmiScoreModal({
  isOpen,
  onClose,
}: LuckmiScoreModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4 sm:p-6">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/10 bg-[#11151C] shadow-2xl">
        <div className="p-5 sm:p-7">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <LuckmiAiIcon size={42} />
              <div>
                <h2 className="text-2xl font-semibold text-white sm:text-3xl">
                  How Luckmi Score Works
                </h2>
                <p className="mt-1 text-sm text-gray-400">
                  A simple way to understand trend quality, timing, and AI confidence.
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="rounded-xl px-3 py-1 text-2xl text-gray-400 transition hover:bg-white/5 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="space-y-6 text-gray-300">
            <section className="rounded-3xl border border-white/5 bg-[#1A1F2B] p-5">
              <h3 className="text-lg font-semibold text-white">
                What is Luckmi Score?
              </h3>
              <p className="mt-3 text-sm leading-6 text-gray-400">
                Luckmi Score is a 0–100 setup rating. It combines technical trend
                quality, momentum, daily direction, intraday timing, support/resistance
                awareness, and AI interpretation into one easier-to-read number.
              </p>
            </section>

            <section>
              <h3 className="mb-3 text-lg font-semibold text-white">
                Score Zones
              </h3>

              <div className="grid gap-3 sm:grid-cols-2">
                <ScoreZone
                  range="85–100"
                  title="Elite Setup"
                  description="Strong trend, strong timing, and clean confirmation. These are the highest-quality opportunities."
                  className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                />

                <ScoreZone
                  range="70–84"
                  title="Strong / Buy Watch"
                  description="Good setup with favorable alignment. Usually worth watching closely or validating with AI."
                  className="border-blue-500/30 bg-blue-500/10 text-blue-300"
                />

                <ScoreZone
                  range="55–69"
                  title="Mixed / Wait"
                  description="Some good signs, but not enough confirmation. Often means wait for cleaner timing."
                  className="border-[#F5C76E]/30 bg-[#F5C76E]/10 text-[#F5C76E]"
                />

                <ScoreZone
                  range="Below 55"
                  title="Weak / Avoid"
                  description="Lower-quality setup, weak timing, or higher risk. Usually not ideal unless conditions improve."
                  className="border-red-500/30 bg-red-500/10 text-red-300"
                />
              </div>
            </section>

            <section className="rounded-3xl border border-[#F5C76E]/15 bg-[#F5C76E]/[0.04] p-5">
              <div className="flex items-center gap-2">
                <LuckmiAiIcon size={30} />
                <h3 className="text-lg font-semibold text-white">
                  How AI Analysis Fits In
                </h3>
              </div>

              <p className="mt-3 text-sm leading-6 text-gray-400">
                The score tells you how strong the setup looks. The AI analysis explains
                the “why” in plain English — whether the stock is trending cleanly, if
                timing is weak, where risk may be, and whether the move looks early,
                mature, or overextended.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-[#11151C] p-4">
                  <div className="text-xs uppercase tracking-wide text-gray-500">
                    Daily CTS
                  </div>
                  <div className="mt-1 text-sm font-medium text-white">
                    Big-picture trend
                  </div>
                </div>

                <div className="rounded-2xl bg-[#11151C] p-4">
                  <div className="text-xs uppercase tracking-wide text-gray-500">
                    Intraday CTS
                  </div>
                  <div className="mt-1 text-sm font-medium text-white">
                    Entry timing
                  </div>
                </div>

                <div className="rounded-2xl bg-[#11151C] p-4">
                  <div className="text-xs uppercase tracking-wide text-gray-500">
                    Alignment
                  </div>
                  <div className="mt-1 text-sm font-medium text-white">
                    Agreement level
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-white/5 bg-[#1A1F2B] p-5">
              <h3 className="text-lg font-semibold text-white">
                What the alignment means
              </h3>

              <div className="mt-4 space-y-3 text-sm text-gray-400">
                <p>
                  <span className="font-medium text-emerald-300">
                    Bullish Confirmed:
                  </span>{" "}
                  daily trend and intraday timing agree.
                </p>
                <p>
                  <span className="font-medium text-[#F5C76E]">
                    Bullish Timing Weak:
                  </span>{" "}
                  bigger trend may be positive, but the short-term entry is not ideal yet.
                </p>
                <p>
                  <span className="font-medium text-blue-300">
                    Countertrend Bounce:
                  </span>{" "}
                  short-term bounce against a weaker larger trend.
                </p>
                <p>
                  <span className="font-medium text-red-300">
                    Bearish Confirmed:
                  </span>{" "}
                  trend and timing are both weak or defensive.
                </p>
              </div>
            </section>

            <section className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-5">
              <h3 className="text-lg font-semibold text-white">
                How to use it
              </h3>

              <div className="mt-3 space-y-2 text-sm leading-6 text-gray-300">
                <p>
                  Start with the score, then read the AI reason. A high score with
                  bullish alignment is usually stronger than a high score with weak
                  timing.
                </p>
                <p>
                  If the score is mixed, the best move may be patience. Luckmi is designed
                  to help users avoid guessing from headlines or random stock tips.
                </p>
              </div>
            </section>

            <section className="rounded-3xl border border-red-500/20 bg-red-500/10 p-5 text-sm">
              <p className="mb-2 font-semibold text-red-300">
                Important Disclaimer
              </p>
              <p className="leading-6 text-gray-400">
                Luckmi Score and AI recommendations are for educational and informational
                purposes only. They are not financial advice. Trading involves risk,
                including possible loss of capital. Always review decisions before acting.
              </p>
            </section>
          </div>
        </div>

        <div className="flex justify-end border-t border-white/5 p-5">
          <button
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