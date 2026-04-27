type CombinedCTSResult = {
  dailyCTS: number;
  intradayCTS: number;
  finalCTS: number;
  alignment: 'bullish_confirmed' | 'bullish_timing_weak' | 'countertrend_bounce' | 'bearish_confirmed' | 'mixed';
  levels: {
    support: number | null;
    resistance: number | null;
    reclaimLevel: number | null;
    breakdownLevel: number | null;
  };
  breakdown: {
    daily: Record<string, number>;
    intraday: Record<string, number>;
    alignmentBoost: number;
  };
};