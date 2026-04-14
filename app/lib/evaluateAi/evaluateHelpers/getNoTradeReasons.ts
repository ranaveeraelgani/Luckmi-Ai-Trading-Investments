// Get top 2 reasons for not buying (for user feedback)
export const getNoTradeReasons = (ctsScore: number, rsi: any, macd: any) => {
    const reasons: string[] = [];

    if (ctsScore < 65) reasons.push('CTS below buy threshold');

    if (typeof rsi === 'number' && rsi < 50)
        reasons.push('Weak momentum (RSI < 50)');

    if (typeof macd === 'number' && macd < 0)
        reasons.push('Bearish MACD');

    return reasons.slice(0, 2); // keep clean
};