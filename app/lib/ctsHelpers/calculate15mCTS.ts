import { calculateKeyLevels } from "./calculateKeyLevels";
import { calculateStructureScore } from "./calculateStructureScore";

export const calculate15mCTS = (
  closes: number[],
  rsiData: number[] = [],
  macd: number[] = [],
  signal: number[] = [],
  ema20Data: number[] = [],
  ema50Data: number[] = [],
  volumes: number[] = []
) => {
  if (!closes || closes.length < 30) {
    return {
      cts: 50,
      breakdown: {},
      levels: calculateKeyLevels(closes || []),
    };
  }

  const lastClose = closes[closes.length - 1];
  const prev10 = closes[Math.max(0, closes.length - 11)];
  const ema20 = ema20Data.length ? ema20Data[ema20Data.length - 1] : lastClose;
  const ema50 = ema50Data.length ? ema50Data[ema50Data.length - 1] : lastClose;

  const lastRSI = rsiData.length ? rsiData[rsiData.length - 1] : 50;
  const lastMACD = macd.length ? macd[macd.length - 1] : 0;
  const lastSignal = signal.length ? signal[signal.length - 1] : 0;

  const levels = calculateKeyLevels(closes);
  const structure = calculateStructureScore(closes, volumes, levels);

  let score = 50;
  const breakdown: Record<string, number> = {};

  if (lastClose > ema50) {
    score += 8;
    breakdown.aboveEMA50 = 8;
  } else {
    score -= 6;
    breakdown.aboveEMA50 = -6;
  }

  if (lastClose > ema20) {
    score += 6;
    breakdown.aboveEMA20 = 6;
  } else {
    score -= 4;
    breakdown.aboveEMA20 = -4;
  }

  if (lastClose > prev10) {
    score += 7;
    breakdown.shortTrend = 7;
  } else {
    score -= 6;
    breakdown.shortTrend = -6;
  }

  if (lastRSI >= 55 && lastRSI <= 70) {
    score += 7;
    breakdown.rsi = 7;
  } else if (lastRSI > 70) {
    score += 3;
    breakdown.rsi = 3;
  } else if (lastRSI < 42) {
    score -= 8;
    breakdown.rsi = -8;
  }

  if (lastMACD > lastSignal) {
    score += 8;
    breakdown.macd = 8;
  } else {
    score -= 6;
    breakdown.macd = -6;
  }

  // Volume impulse
  const avgVol =
    volumes.length >= 20
      ? volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
      : 0;

  const recentVol =
    volumes.length >= 5
      ? volumes.slice(-5).reduce((a, b) => a + b, 0) / 5
      : 0;

  if (avgVol > 0 && recentVol > avgVol * 1.25) {
    score += 5;
    breakdown.volume = 5;
  } else if (avgVol > 0 && recentVol < avgVol * 0.8) {
    score -= 4;
    breakdown.volume = -4;
  }

  score += structure.score;
  breakdown.structure = structure.score;

  score = Math.max(20, Math.min(95, Math.round(score)));

  return {
    cts: score,
    breakdown,
    levels,
  };
};