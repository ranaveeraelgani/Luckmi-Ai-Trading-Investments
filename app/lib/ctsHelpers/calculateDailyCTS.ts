import { calculateKeyLevels } from "./calculateKeyLevels";
import { calculateStructureScore } from "./calculateStructureScore";

export const calculateDailyCTS = (
  closes: number[],
  rsiData: number[] = [],
  macd: number[] = [],
  signal: number[] = [],
  ema50Data: number[] = [],
  ema200Data: number[] = [],
  volumes: number[] = [],
  spyCloses: number[] = []
) => {
  if (!closes || closes.length < 40) {
    return {
      cts: 50,
      breakdown: {},
      levels: calculateKeyLevels(closes || []),
    };
  }

  const lastClose = closes[closes.length - 1];
  const prev20 = closes[Math.max(0, closes.length - 21)];
  const ema50 = ema50Data.length ? ema50Data[ema50Data.length - 1] : lastClose;
  const ema200 = ema200Data.length ? ema200Data[ema200Data.length - 1] : lastClose;

  const lastRSI = rsiData.length ? rsiData[rsiData.length - 1] : 50;
  const lastMACD = macd.length ? macd[macd.length - 1] : 0;
  const lastSignal = signal.length ? signal[signal.length - 1] : 0;

  const levels = calculateKeyLevels(closes);
  const structure = calculateStructureScore(closes, volumes, levels);

  let score = 50;
  const breakdown: Record<string, number> = {};

  // Trend
  if (lastClose > ema200) {
    score += 10;
    breakdown.aboveEMA200 = 10;
  } else {
    score -= 8;
    breakdown.aboveEMA200 = -8;
  }

  if (lastClose > ema50) {
    score += 6;
    breakdown.aboveEMA50 = 6;
  } else {
    score -= 4;
    breakdown.aboveEMA50 = -4;
  }

  if (lastClose > prev20) {
    score += 8;
    breakdown.trend20 = 8;
  } else {
    score -= 6;
    breakdown.trend20 = -6;
  }

  // Momentum
  if (lastRSI >= 58 && lastRSI <= 72) {
    score += 8;
    breakdown.rsi = 8;
  } else if (lastRSI >= 50) {
    score += 4;
    breakdown.rsi = 4;
  } else if (lastRSI < 42) {
    score -= 8;
    breakdown.rsi = -8;
  }

  if (lastMACD > lastSignal) {
    score += 7;
    breakdown.macd = 7;
  } else {
    score -= 5;
    breakdown.macd = -5;
  }

  // Relative strength vs SPY
  if (spyCloses.length > 20 && closes.length > 20) {
    const stockReturn = closes[closes.length - 1] / closes[closes.length - 21] - 1;
    const spyReturn = spyCloses[spyCloses.length - 1] / spyCloses[spyCloses.length - 21] - 1;
    const relative = stockReturn - spyReturn;

    if (relative > 0.04) {
      score += 6;
      breakdown.relativeStrength = 6;
    } else if (relative < -0.03) {
      score -= 6;
      breakdown.relativeStrength = -6;
    }
  }

  // Structure / smart-money-like level behavior
  score += structure.score;
  breakdown.structure = structure.score;

  score = Math.max(20, Math.min(95, Math.round(score)));

  return {
    cts: score,
    breakdown,
    levels,
  };
};