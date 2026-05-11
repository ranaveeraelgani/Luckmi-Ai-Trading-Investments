/**
 * Volume Acceleration Detection
 * Identifies when volume surges on upward reversal (first 3-5 bars).
 * Returns { detected, strength } where strength ∈ [0, 1]:
 *   - strength reflects how far above baseline the surge is
 *   - 0.1 = just at threshold (1.5× baseline); 1.0 = 3× baseline or more
 */

export type VolumeAccelerationResult = { detected: boolean; strength: number };

export const detectVolumeAcceleration = (
  closes: number[],
  volumes: number[],
  lookback: number = 5
): VolumeAccelerationResult => {
  const NOT_DETECTED: VolumeAccelerationResult = { detected: false, strength: 0 };

  if (closes.length < lookback || volumes.length < lookback) {
    return NOT_DETECTED;
  }

  const recentCloses = closes.slice(-lookback);
  const recentVolumes = volumes.slice(-lookback);

  // Check if price is in an upward reversal (recent close is the highest)
  const currentClose = recentCloses[recentCloses.length - 1];
  const previousCloses = recentCloses.slice(0, -1);

  const closesLowerThanCurrent = previousCloses.filter(c => c < currentClose).length;
  if (closesLowerThanCurrent < 2) {
    return NOT_DETECTED; // Not an upward reversal
  }

  // Baseline: 20-bar average excluding the recent window
  const extendedLookback = Math.min(20, volumes.length);
  const baselineVolumes = volumes.slice(-extendedLookback, -lookback + 1);

  if (baselineVolumes.length === 0) {
    return NOT_DETECTED;
  }

  const baselineAvgVolume =
    baselineVolumes.reduce((a, b) => a + b, 0) / baselineVolumes.length;

  if (baselineAvgVolume <= 0) {
    return NOT_DETECTED;
  }

  // Recent volume average (last 3 bars)
  const recentVolumeAvg =
    recentVolumes.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, recentVolumes.length);

  const ratio = recentVolumeAvg / baselineAvgVolume;

  // Require: avg ≥1.5× baseline AND at least one bar ≥1.8× baseline
  const isAccelerating = ratio >= 1.5;
  const hasSpike = recentVolumes.some(v => v > baselineAvgVolume * 1.8);

  if (!isAccelerating || !hasSpike) {
    return NOT_DETECTED;
  }

  // Strength: 0.1 at ratio=1.5, 1.0 at ratio=3.0+
  const strength = Math.max(0.1, Math.min((ratio - 1.5) / 1.5, 1));

  return { detected: true, strength };
};
