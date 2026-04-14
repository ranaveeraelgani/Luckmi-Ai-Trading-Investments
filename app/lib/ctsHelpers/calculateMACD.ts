import { calculateEMA } from "./calculateEMA";
export const calculateMACD = (closes: number[]) => {
    if (closes.length < 26) return { macd: [], signal: [], histogram: [] };

    const ema12 = calculateEMA(closes, 12);
    const ema26 = calculateEMA(closes, 26);

    const macd: number[] = [];
    for (let i = 0; i < ema12.length; i++) {
        macd.push(ema12[i] - ema26[i + (ema26.length - ema12.length)]);
    }

    const signal = calculateEMA(macd, 9);
    const histogram = macd.slice(-signal.length).map((m, i) => m - signal[i]);

    return { macd: macd.slice(-signal.length), signal, histogram };
};
