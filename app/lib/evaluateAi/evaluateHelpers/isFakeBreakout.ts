export const isFakeBreakout = (closes: number[], volumes: number[]) => {
  const len = closes.length;
  if (len < 5) return false;

  const recentHigh = Math.max(...closes.slice(-5, -1));
  const breakout = closes[len - 1] > recentHigh;

  const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const lastVol = volumes[len - 1];

  const weakVolume = lastVol < avgVol * 0.9;

  return breakout && weakVolume;
};