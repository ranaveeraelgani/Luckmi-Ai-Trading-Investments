export const getTrendStage = (closes: number[], ema200: number) => {
  const LOOKBACK = 20;
  const recent = closes.slice(-LOOKBACK);

  if (recent.length < LOOKBACK) return 'neutral';
  if (!Number.isFinite(ema200) || ema200 <= 0) return 'neutral';

  const current = closes[closes.length - 1];
  if (!Number.isFinite(current) || current <= 0) return 'neutral';

  // EMA buffer avoids fast state flips when price is hovering around EMA200.
  const emaDistance = (current - ema200) / ema200;
  const clearlyAboveEMA = emaDistance >= 0.005;
  const clearlyBelowEMA = emaDistance <= -0.01;

  const higherHighs =
    recent[19] > recent[15] &&
    recent[15] > recent[11];

  const flattening =
    recent[19] < recent[18] &&
    recent[18] < recent[17] &&
    recent[17] <= recent[15];

    //console.log('getTrendStage', { recent, emaDistance, clearlyAboveEMA, clearlyBelowEMA, higherHighs, flattening });
  if (clearlyBelowEMA) return "downtrend";
  if (clearlyAboveEMA && higherHighs) return "early_trend";
  if (clearlyAboveEMA && flattening) return "late_trend";

  return "neutral";
};