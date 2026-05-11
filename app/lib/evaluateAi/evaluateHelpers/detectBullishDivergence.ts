/**
 * Bullish Divergence Detection
 * Identifies when MACD makes a higher low while price makes a lower low.
 * Returns { detected, strength } where strength ∈ [0, 1]:
 *   - strength reflects how significant the divergence is (price drop depth × MACD recovery magnitude)
 *   - strength 0.1 = minimum detected; 1.0 = large price drop with strong MACD recovery
 */

export type DivergenceResult = { detected: boolean; strength: number };

export const detectBullishDivergence = (
  closes: number[],
  macdArr: number[],
  lookback: number = 20
): DivergenceResult => {
  const NOT_DETECTED: DivergenceResult = { detected: false, strength: 0 };

  if (closes.length < lookback || macdArr.length < lookback) {
    return NOT_DETECTED;
  }

  const recentCloses = closes.slice(-lookback);
  const recentMacd = macdArr.slice(-lookback);

  // Find the lowest close and lowest MACD in the lookback window
  let priceLowIndex = 0;
  let macdLowIndex = 0;
  let priceLowestValue = recentCloses[0];
  let macdLowestValue = recentMacd[0];

  for (let i = 1; i < recentCloses.length; i++) {
    if (recentCloses[i] < priceLowestValue) {
      priceLowestValue = recentCloses[i];
      priceLowIndex = i;
    }
    if (recentMacd[i] < macdLowestValue) {
      macdLowestValue = recentMacd[i];
      macdLowIndex = i;
    }
  }

  // Need at least 2 lows to compare (current + prior)
  if (priceLowIndex === 0 && macdLowIndex === 0) {
    return NOT_DETECTED;
  }

  // Find the PREVIOUS low (before the most recent one)
  let prevPriceLowValue = recentCloses[0];
  let prevMacdLowValue = recentMacd[0];
  let prevPriceLowIndex = 0;
  let prevMacdLowIndex = 0;

  for (let i = 0; i < priceLowIndex; i++) {
    if (recentCloses[i] < prevPriceLowValue) {
      prevPriceLowValue = recentCloses[i];
      prevPriceLowIndex = i;
    }
  }

  for (let i = 0; i < macdLowIndex; i++) {
    if (recentMacd[i] < prevMacdLowValue) {
      prevMacdLowValue = recentMacd[i];
      prevMacdLowIndex = i;
    }
  }

  // Bullish divergence: price lower low BUT MACD higher low
  const priceMakingLowerLow = priceLowestValue < prevPriceLowValue * 0.99; // at least 1% lower
  const macdMakingHigherLow = macdLowestValue > prevMacdLowValue * 1.01; // at least 1% higher

  // Also check that the second low occurred AFTER the first (chronologically later in the lookback)
  const chronoOrderCorrect = priceLowIndex > prevPriceLowIndex && macdLowIndex > prevMacdLowIndex;

  if (!priceMakingLowerLow || !macdMakingHigherLow || !chronoOrderCorrect) {
    return NOT_DETECTED;
  }

  // === Compute signal strength ===
  // Price drop depth: 0→0 at 1%, 1→1 at 8% or more
  const priceDropPct = Math.max(0, (prevPriceLowValue - priceLowestValue) / prevPriceLowValue);
  const normalizedPriceDrop = Math.min(priceDropPct / 0.08, 1);

  // MACD recovery: relative to prior low magnitude; 0→0, 1→1 at 50% recovery
  const macdDenominator = Math.abs(prevMacdLowValue) || 0.001;
  const macdRecoveryPct = Math.max(0, (macdLowestValue - prevMacdLowValue) / macdDenominator);
  const normalizedMacdRecovery = Math.min(macdRecoveryPct / 0.50, 1);

  const strength = Math.max(0.1, Math.min((normalizedPriceDrop + normalizedMacdRecovery) / 2, 1));

  return { detected: true, strength };
};
