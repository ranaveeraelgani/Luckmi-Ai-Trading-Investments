import { getCtsForSymbol } from '@/app/lib/evaluateAi/evaluateHelpers/getCtsForSymbol';

export type MarketRegime = {
  spyCts: number;
  spyAlignment: string;
  isChoppy: boolean;    // SPY signal is weak/mixed — raise entry bar slightly
  isBearish: boolean;   // SPY is confirmed bearish — raise entry bar significantly
  volatilityStress: number; // 0-1 composite of intraday chop + CTS divergence
  volatilityBoost: number;   // extra points added when the market is unstable
  entryScoreBoost: number; // Points added to BUY_EXECUTION_SCORE_MIN
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function computeFlipRate(closes: number[]) {
  if (closes.length < 4) return 0.5;

  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    const curr = closes[i];
    if (!Number.isFinite(prev) || !Number.isFinite(curr) || prev === 0) continue;
    returns.push((curr - prev) / prev);
  }

  if (returns.length < 3) return 0.5;

  let flips = 0;
  let lastSign = 0;

  for (const r of returns) {
    const sign = r > 0 ? 1 : r < 0 ? -1 : 0;
    if (sign === 0) continue;
    if (lastSign !== 0 && sign !== lastSign) flips += 1;
    lastSign = sign;
  }

  return clamp(flips / Math.max(1, returns.length - 1), 0, 1);
}

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
    volatilityStress: 0,
    volatilityBoost: 0,
    entryScoreBoost: 0,
  };

  try {
    const spy = await getCtsForSymbol('SPY');

    if (!spy || spy.failed) return neutral;

    const spyCts = typeof spy.ctsScore === 'number' ? spy.ctsScore : 55;
    const spyAlignment = String(spy.alignment || 'mixed').toLowerCase();
    const spyDailyCts = typeof spy.dailyCTS === 'number' ? spy.dailyCTS : spyCts;
    const spyIntradayCts = typeof spy.intradayCTS === 'number' ? spy.intradayCTS : spyCts;
    const spyCloses = Array.isArray(spy.intradayCloses) ? spy.intradayCloses.map(Number).filter(Number.isFinite) : [];

    const isChoppy =
      spyCts < 50 ||
      spyAlignment === 'mixed' ||
      spyAlignment === 'countertrend_bounce' ||
      spyAlignment === 'bullish_timing_weak';

    const isBearish =
      spyCts < 42 ||
      spyAlignment === 'bearish_confirmed';

    const ctsDivergence = clamp(Math.abs(spyDailyCts - spyIntradayCts) / 35, 0, 1);
    const flipRate = computeFlipRate(spyCloses.slice(-24));
    const volatilityStress = clamp(ctsDivergence * 0.6 + flipRate * 0.4, 0, 1);

    const volatilityBoost =
      volatilityStress >= 0.75 ? 5 :
      volatilityStress >= 0.5 ? 3 :
      0;

    // +5 for choppy market, +10 for confirmed bearish
    const baseBoost = isBearish ? 10 : isChoppy ? 5 : 0;
    const entryScoreBoost = baseBoost + volatilityBoost;

    console.log(`[regime] SPY CTS: ${spyCts}, alignment: ${spyAlignment}, volatility: ${volatilityStress.toFixed(2)}, boost: +${entryScoreBoost}`);

    return { spyCts, spyAlignment, isChoppy, isBearish, volatilityStress, volatilityBoost, entryScoreBoost };
  } catch (err) {
    console.warn('[regime] failed to fetch SPY regime, using neutral', err);
    return neutral;
  }
}
