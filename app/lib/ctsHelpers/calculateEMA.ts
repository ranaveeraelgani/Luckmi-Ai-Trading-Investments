export const calculateEMA = (data: number[], period: number): number[] => {
    const k = 2 / (period + 1);
    const ema: number[] = [];
    let sma = data.slice(0, period).reduce((a, b) => a + b, 0) / period;

    ema.push(sma);
    for (let i = period; i < data.length; i++) {
        sma = data[i] * k + sma * (1 - k);
        ema.push(sma);
    }
    return ema;
};