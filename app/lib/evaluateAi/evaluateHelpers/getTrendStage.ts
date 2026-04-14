export const getTrendStage = (closes: number[], ema200: number) => {
  const recent = closes.slice(-10);

  const aboveEMA = closes[closes.length - 1] > ema200;

  const higherHighs =
    recent[9] > recent[7] &&
    recent[7] > recent[5];

  const flattening =
    recent[9] < recent[8] &&
    recent[8] < recent[7];

    console.log('getTrendStage', { recent, aboveEMA, higherHighs, flattening });
  if (aboveEMA && higherHighs) return "early_trend";
  if (aboveEMA && flattening) return "late_trend";
  if (!aboveEMA) return "downtrend";

  return "neutral";
};