export const calculateStructureScore = (
  closes: number[],
  volumes: number[] = [],
  levels: {
    support: number | null;
    resistance: number | null;
    reclaimLevel: number | null;
    breakdownLevel: number | null;
  }
) => {
  if (!closes || closes.length < 10) return { score: 0, signals: {} };

  const lastClose = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];

  const avgVol =
    volumes.length >= 20
      ? volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
      : 0;

  const recentVol =
    volumes.length >= 3
      ? volumes.slice(-3).reduce((a, b) => a + b, 0) / 3
      : 0;

  const highVolume = avgVol > 0 && recentVol > avgVol * 1.2;

  let score = 0;
  const signals: Record<string, number> = {};

  // Support bounce
  if (levels.support !== null) {
    const distToSupport = ((lastClose - levels.support) / levels.support) * 100;
    if (distToSupport >= 0 && distToSupport <= 2 && lastClose > prevClose) {
      const pts = highVolume ? 4 : 2;
      score += pts;
      signals.supportBounce = pts;
    }
  }

  // Breakout retest hold / reclaim
  if (levels.reclaimLevel !== null) {
    const reclaimed =
      prevClose < levels.reclaimLevel && lastClose > levels.reclaimLevel;
    const holdingAbove = lastClose > levels.reclaimLevel;

    if (reclaimed) {
      const pts = highVolume ? 5 : 3;
      score += pts;
      signals.reclaim = pts;
    } else if (holdingAbove) {
      const pts = 2;
      score += pts;
      signals.holdingReclaim = pts;
    }
  }

  // Failed breakdown reclaim
  if (levels.breakdownLevel !== null) {
    const failedBreakdown =
      prevClose < levels.breakdownLevel && lastClose > levels.breakdownLevel;

    if (failedBreakdown) {
      const pts = highVolume ? 5 : 3;
      score += pts;
      signals.failedBreakdown = pts;
    }
  }

  // Near resistance penalty
  if (levels.resistance !== null) {
    const distToResistance =
      ((levels.resistance - lastClose) / levels.resistance) * 100;

    if (distToResistance >= 0 && distToResistance <= 1.5) {
      const pts = -3;
      score += pts;
      signals.nearResistance = pts;
    }
  }

  return {
    score: Math.max(-8, Math.min(8, score)),
    signals,
  };
};