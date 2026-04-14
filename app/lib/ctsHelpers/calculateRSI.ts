  // RSI (14)
  export const calculateRSI = (closes: number[], period = 14) => {
    if (closes.length < period + 1) return [];

    const gains: number[] = [];
    const losses: number[] = [];

    for (let i = 1; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }

    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

    const rsi: number[] = [];
    rsi.push(100 - (100 / (1 + avgGain / (avgLoss || 1))));

    for (let i = period; i < gains.length; i++) {
      avgGain = ((avgGain * (period - 1)) + gains[i]) / period;
      avgLoss = ((avgLoss * (period - 1)) + losses[i]) / period;
      rsi.push(100 - (100 / (1 + avgGain / (avgLoss || 1))));
    }

    return rsi;
  };