  // ← NEW: Rectangle Breakout Detector
  export const detectRectangleBreakout = (
    ohlc: { o: number; h: number; l: number; c: number; x: Date }[],
    volumes: number[],
    lookback = 40
  ) => {
    if (ohlc.length < lookback + 5) return null;

    const recent = ohlc.slice(-lookback);
    const highs = recent.map((c) => c.h);
    const lows = recent.map((c) => c.l);
    const closes = recent.map((c) => c.c);
    const vols = volumes.slice(-lookback);

    const resistance = Math.max(...highs);
    const support = Math.min(...lows);
    const range = resistance - support;
    if (range < 0.01) return null;

    // Count touches (within 1% of level)
    let upperTouches = 0, lowerTouches = 0;
    for (let i = 0; i < recent.length - 3; i++) {
      if (Math.abs(recent[i].h - resistance) / range < 0.015) upperTouches++;
      if (Math.abs(recent[i].l - support) / range < 0.015) lowerTouches++;
    }

    const isValidRectangle = upperTouches >= 2 && lowerTouches >= 2;

    if (!isValidRectangle) return null;

    // Breakout check on last candle + volume spike
    const lastClose = closes[closes.length - 1];
    const prevClose = closes[closes.length - 2];
    const lastVol = vols[vols.length - 1];
    const avgVol = vols.slice(0, -5).reduce((a, b) => a + b, 0) / Math.max(1, vols.length - 5);

    let type: 'bullish' | 'bearish' | null = null;
    if (lastClose > resistance && prevClose <= resistance && lastVol > avgVol * 1.5) {
      type = 'bullish';
    } else if (lastClose < support && prevClose >= support && lastVol > avgVol * 1.5) {
      type = 'bearish';
    }

    if (!type) return null;

    return {
      type,
      support: Number(support.toFixed(2)),
      resistance: Number(resistance.toFixed(2)),
      breakoutPrice: Number(lastClose.toFixed(2)),
      strength: lastVol > avgVol * 2 ? 85 : 65,
      reason: `${type} rectangle breakout – price broke ${type === 'bullish' ? 'above resistance' : 'below support'} with strong volume`,
    };
  };