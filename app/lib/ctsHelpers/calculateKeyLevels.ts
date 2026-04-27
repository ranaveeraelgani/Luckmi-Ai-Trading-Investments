export const calculateKeyLevels = (closes: number[]) => {
  if (!closes || closes.length < 20) {
    return {
      support: null,
      resistance: null,
      reclaimLevel: null,
      breakdownLevel: null,
    };
  }

  const recent20 = closes.slice(-20);
  const recent10 = closes.slice(-10);
  const recent5 = closes.slice(-5);

  const support = Math.min(...recent20);
  const resistance = Math.max(...recent20);

  // More tactical short-term levels
  const reclaimLevel = Math.max(...recent10.slice(0, 7));
  const breakdownLevel = Math.min(...recent10.slice(0, 7));

  // Slight smoothing so levels are not too raw
  const lastClose = closes[closes.length - 1];

  return {
    support: Number(support.toFixed(2)),
    resistance: Number(resistance.toFixed(2)),
    reclaimLevel: Number(
      Math.min(reclaimLevel, Math.max(...recent5, lastClose)).toFixed(2)
    ),
    breakdownLevel: Number(
      Math.max(breakdownLevel, Math.min(...recent5, lastClose)).toFixed(2)
    ),
  };
};