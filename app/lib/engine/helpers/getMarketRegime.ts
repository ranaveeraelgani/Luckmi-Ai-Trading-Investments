import { getCtsForSymbol } from '@/app/lib/evaluateAi/evaluateHelpers/getCtsForSymbol';

export type MarketRegime = {
  spyCts: number;
  spyAlignment: string;
  isChoppy: boolean;    // SPY signal is weak/mixed — raise entry bar slightly
  isBearish: boolean;   // SPY is confirmed bearish — raise entry bar significantly
  entryScoreBoost: number; // Points added to BUY_EXECUTION_SCORE_MIN
};

/**
 * Fetches SPY CTS once per cycle and returns a regime descriptor.
 * Used to raise entry standards when the index is in a choppy or bearish state.
 * Fails safe: if SPY data can't be fetched, returns a neutral regime.
 */
export async function getMarketRegime(): Promise<MarketRegime> {
  const neutral: MarketRegime = {
    spyCts: 55,
    spyAlignment: 'mixed',
    isChoppy: false,
    isBearish: false,
    entryScoreBoost: 0,
  };

  try {
    const spy = await getCtsForSymbol('SPY');

    if (!spy || spy.failed) return neutral;

    const spyCts = typeof spy.ctsScore === 'number' ? spy.ctsScore : 55;
    const spyAlignment = String(spy.alignment || 'mixed').toLowerCase();

    const isChoppy =
      spyCts < 50 ||
      spyAlignment === 'mixed' ||
      spyAlignment === 'countertrend_bounce' ||
      spyAlignment === 'bullish_timing_weak';

    const isBearish =
      spyCts < 42 ||
      spyAlignment === 'bearish_confirmed';

    // +5 for choppy market, +10 for confirmed bearish
    const entryScoreBoost = isBearish ? 10 : isChoppy ? 5 : 0;

    console.log(`[regime] SPY CTS: ${spyCts}, alignment: ${spyAlignment}, boost: +${entryScoreBoost}`);

    return { spyCts, spyAlignment, isChoppy, isBearish, entryScoreBoost };
  } catch (err) {
    console.warn('[regime] failed to fetch SPY regime, using neutral', err);
    return neutral;
  }
}
