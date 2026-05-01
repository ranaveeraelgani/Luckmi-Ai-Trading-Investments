import { calculate15mCTS } from "../ctsHelpers/calculate15mCTS";
import { calculateCombinedCTS } from "../ctsHelpers/calculateCombinedCTS";
import { calculateDailyCTS } from "../ctsHelpers/calculateDailyCTS";
import { calculateMACD } from "../ctsHelpers/calculateMACD";
// =========================
// helper
// =========================
// Safe number parsing with fallback
const toNumber = (value: string | number | undefined): number => {
    if (value === undefined || value === null) return 0;
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return isNaN(num) ? 0 : num;
};

type CtsBreakdown = {
  daily: Record<string, number>;
  intraday: Record<string, number>;
  alignmentBoost: number;
};

type FinalCTSResult = {
  finalScore: number;
  dailyCTS: number;
  intradayCTS: number;
  alignment: string;
  ctsBreakdown: CtsBreakdown;
  levels: {
    support: number | null;
    resistance: number | null;
    reclaimLevel: number | null;
    breakdownLevel: number | null;
  };
  lastRSI: number | string;
  lastMACD: number | string;
  lastSignal: number | string;
  ema200Last: number | string;
  recentCloses: number[];
  lastClose: number;
};

export const calculateFinalCTS = ({
  dailyCloses,
  dailyVolumes,
  intradayCloses,
  intradayVolumes,
  dailyRsi,
  intradayRsi,
  dailyMacd,
  dailySignal,
  intradayMacd,
  intradaySignal,
  dailyEma50,
  dailyEma200,
  intradayEma20,
  intradayEma50,
  spyDailyCloses = [],
}: {
  dailyCloses: number[];
  dailyVolumes: number[];
  intradayCloses: number[];
  intradayVolumes: number[];
  dailyRsi: number[];
  intradayRsi: number[];
  dailyMacd: number[];
  dailySignal: number[];
  intradayMacd: number[];
  intradaySignal: number[];
  dailyEma50: number[];
  dailyEma200: number[];
  intradayEma20: number[];
  intradayEma50: number[];
  spyDailyCloses?: number[];
}): FinalCTSResult => {
  const daily = calculateDailyCTS(
    dailyCloses,
    dailyRsi,
    dailyMacd,
    dailySignal,
    dailyEma50,
    dailyEma200,
    dailyVolumes,
    spyDailyCloses
  );

  const intraday = calculate15mCTS(
    intradayCloses,
    intradayRsi,
    intradayMacd,
    intradaySignal,
    intradayEma20,
    intradayEma50,
    intradayVolumes
  );

  const combined = calculateCombinedCTS(daily, intraday);

  const lastRSI =
    intradayRsi.length > 0
      ? intradayRsi[intradayRsi.length - 1]
      : dailyRsi.length > 0
      ? dailyRsi[dailyRsi.length - 1]
      : 50;

  const lastMACD =
    intradayMacd.length > 0 ? intradayMacd[intradayMacd.length - 1] : 'N/A';

  const lastSignal =
    intradaySignal.length > 0 ? intradaySignal[intradaySignal.length - 1] : 'N/A';

  const ema200Last =
    dailyEma200.length > 0 ? dailyEma200[dailyEma200.length - 1] : 'N/A';

  const lastClose =
    intradayCloses.length > 0
      ? intradayCloses[intradayCloses.length - 1]
      : dailyCloses[dailyCloses.length - 1];

  return {
    finalScore: combined.finalCTS,
    dailyCTS: combined.dailyCTS,
    intradayCTS: combined.intradayCTS,
    alignment: combined.alignment,
    ctsBreakdown: combined.breakdown,
    levels: combined.levels,
    lastRSI,
    lastMACD,
    lastSignal,
    ema200Last,
    recentCloses: intradayCloses.slice(-10),
    lastClose,
  };
};