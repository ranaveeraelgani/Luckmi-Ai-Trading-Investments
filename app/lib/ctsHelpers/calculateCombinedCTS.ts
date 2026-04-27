export const calculateCombinedCTS = (
  daily: {
    cts: number;
    breakdown: Record<string, number>;
    levels: {
      support: number | null;
      resistance: number | null;
      reclaimLevel: number | null;
      breakdownLevel: number | null;
    };
  },
  intraday: {
    cts: number;
    breakdown: Record<string, number>;
    levels: {
      support: number | null;
      resistance: number | null;
      reclaimLevel: number | null;
      breakdownLevel: number | null;
    };
  }
) => {
  let alignmentBoost = 0;
  let alignment: CombinedCTSResult['alignment'] = 'mixed';

  if (daily.cts >= 65 && intraday.cts >= 65) {
    alignmentBoost = 5;
    alignment = 'bullish_confirmed';
  } else if (daily.cts >= 65 && intraday.cts < 55) {
    alignmentBoost = -4;
    alignment = 'bullish_timing_weak';
  } else if (daily.cts < 55 && intraday.cts >= 65) {
    alignmentBoost = -3;
    alignment = 'countertrend_bounce';
  } else if (daily.cts < 50 && intraday.cts < 50) {
    alignmentBoost = -5;
    alignment = 'bearish_confirmed';
  }

  let finalCTS = Math.round(daily.cts * 0.65 + intraday.cts * 0.35 + alignmentBoost);

  // Cap countertrend enthusiasm
  if (daily.cts < 55 && finalCTS > 68) {
    finalCTS = 68;
  }

  finalCTS = Math.max(20, Math.min(95, finalCTS));

  return {
    dailyCTS: daily.cts,
    intradayCTS: intraday.cts,
    finalCTS,
    alignment,
    levels: {
      // Daily levels are stronger anchor
      support: daily.levels.support,
      resistance: daily.levels.resistance,
      reclaimLevel: intraday.levels.reclaimLevel ?? daily.levels.reclaimLevel,
      breakdownLevel: intraday.levels.breakdownLevel ?? daily.levels.breakdownLevel,
    },
    breakdown: {
      daily: daily.breakdown,
      intraday: intraday.breakdown,
      alignmentBoost,
    },
  };
};