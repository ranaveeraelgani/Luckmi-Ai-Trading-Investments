/**
 * CTS performance bucket computation.
 * Used in admin/reports/overview and admin/ai-system-review.
 */

import { toNumber } from "./reportHelpers";

type CtsBucketRaw = {
  count: number;
  wins: number;
  losses: number;
  totalPnl: number;
};

export type CtsBucketResult = {
  label: string;
  count: number;
  avgPnl: number;
  winRate: number;
};

export type CtsBuckets = {
  high: CtsBucketResult;   // CTS 80+
  upper: CtsBucketResult;  // CTS 70–79
  mid: CtsBucketResult;    // CTS 60–69
  low: CtsBucketResult;    // CTS <60
};

function makeBucket(raw: CtsBucketRaw, label: string): CtsBucketResult {
  const closed = raw.wins + raw.losses;
  return {
    label,
    count: raw.count,
    avgPnl: closed > 0 ? raw.totalPnl / closed : 0,
    winRate: closed > 0 ? (raw.wins / closed) * 100 : 0,
  };
}

export function computeCtsBuckets(
  trades: Array<{ cts_score?: unknown; pnl?: unknown; type?: unknown }>
): CtsBuckets {
  const raw: Record<"high" | "upper" | "mid" | "low", CtsBucketRaw> = {
    high: { count: 0, wins: 0, losses: 0, totalPnl: 0 },
    upper: { count: 0, wins: 0, losses: 0, totalPnl: 0 },
    mid: { count: 0, wins: 0, losses: 0, totalPnl: 0 },
    low: { count: 0, wins: 0, losses: 0, totalPnl: 0 },
  };

  for (const trade of trades) {
    const cts = Number(trade.cts_score);
    if (!Number.isFinite(cts) || cts <= 0) continue;

    const pnl = toNumber(trade.pnl);
    const isSell = String(trade.type || "").toLowerCase().includes("sell");
    const key: keyof typeof raw =
      cts >= 80 ? "high" : cts >= 70 ? "upper" : cts >= 60 ? "mid" : "low";

    raw[key].count += 1;
    if (isSell) {
      raw[key].totalPnl += pnl;
      if (pnl > 0) raw[key].wins += 1;
      if (pnl < 0) raw[key].losses += 1;
    }
  }

  return {
    high: makeBucket(raw.high, "CTS 80+"),
    upper: makeBucket(raw.upper, "CTS 70–79"),
    mid: makeBucket(raw.mid, "CTS 60–69"),
    low: makeBucket(raw.low, "CTS <60"),
  };
}
