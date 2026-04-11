
// =========================
// helper
// =========================
// Safe number parsing with fallback
const toNumber = (value: string | number | undefined): number => {
    if (value === undefined || value === null) return 0;
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return isNaN(num) ? 0 : num;
};
// MACD (12, 26, 9)
const calculateMACD = (closes: number[]) => {
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
// Simple EMA calculation
const calculateEMA = (data: number[], period: number): number[] => {
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
const calculateNewsSentiment = (news: any[]) => {
    if (!news || news.length === 0) return 8; // neutral base

    let score = 8; // start with neutral base

    const positiveKeywords = [
        'beat', 'raise', 'upgrade', 'strong', 'buy', 'bullish',
        'record', 'growth', 'outperform', 'surge', 'rally', 'positive'
    ];

    const negativeKeywords = [
        'miss', 'cut', 'downgrade', 'weak', 'sell', 'bearish',
        'decline', 'drop', 'loss', 'disappoint', 'negative', 'warn'
    ];

    news.forEach(n => {
        const text = (n.headline + ' ' + (n.summary || '')).toLowerCase();

        // Count positive matches
        const posMatches = positiveKeywords.filter(w => text.includes(w)).length;
        score += posMatches * 4;   // +4 per strong positive keyword

        // Count negative matches
        const negMatches = negativeKeywords.filter(w => text.includes(w)).length;
        score -= negMatches * 5;   // -5 per negative keyword (stronger penalty)
    });

    // Cap the sentiment contribution
    score = Math.max(-10, Math.min(20, score));

    return score;
};
// MAIN SCORER – exact to your 15-factor model
export const calculateFinalCTS = (
    ohlc: any[],
    closes: number[],
    macdData: any[] = [],
    rsiData: number[] = [],
    ema200Data: number[] = [],
    volumes: number[] = [],
    breakout: any = null,
    news: any[] = [],
    spyCloses: number[] = []
) => {

    if (closes.length < 30) {
        return {
            finalScore: 50,
            rawBaseScore: 50,
            recommendation: 'Hold',
            filtersApplied: {},
            lastRSI: 50,
            lastMACD: 'N/A',
            lastSignal: 'N/A',
            ema200Last: 'N/A',
            recentCloses: closes.slice(-10),
            lastClose: closes.at(-1)
        };
    }

    let rawBaseScore = 50;
    let trendScore = 0;
    let emaScore = 0;
    let momentumScore = 0;
    let relativeScore = 0;
    let penaltyScore = 0;
    const lastClose = toNumber(closes.at(-1));
    const ema200Last = toNumber(ema200Data.length > 0 ? ema200Data.at(-1) : lastClose);
    const lastRSI = toNumber(rsiData.length > 0 ? rsiData.at(-1) : 50);

    // -------------------
    // 1. TREND (balanced)
    // -------------------
    const isAboveEMA200 = lastClose > ema200Last;
    emaScore = isAboveEMA200 ? 8 : -8;
    rawBaseScore += emaScore;

    const isUptrend = lastClose > toNumber(closes.at(-20));
    trendScore = isUptrend ? 6 : -6;
    rawBaseScore += trendScore;

    // -------------------
    // 2. MOMENTUM (RSI improved)
    // -------------------
    let momentum = 0;

    if (lastRSI >= 55 && lastRSI <= 65) momentum = 8;
    else if (lastRSI > 65 && lastRSI <= 75) momentum = 5;
    else if (lastRSI > 75) momentum = -4;
    else if (lastRSI < 45) momentum = -6;
    momentumScore = momentum;
    rawBaseScore += momentumScore;

    if (lastRSI >= 55 && lastRSI <= 65 && isAboveEMA200) {
        rawBaseScore += 3; // strong trend continuation zone
    }
    // -------------------
    // 3. MACD (added properly)
    // -------------------
    const macdResult = calculateMACD(closes);

    let macdScore = 0;

    if (macdResult.signal.length > 1) {
        const macdLine = macdResult.macd.slice(-macdResult.signal.length);

        const curr = {
            macd: macdLine.at(-1),
            signal: macdResult.signal.at(-1),
            histogram: macdResult.histogram.at(-1)
        };

        const prev = {
            macd: macdLine.at(-2),
            signal: macdResult.signal.at(-2),
            histogram: macdResult.histogram.at(-2)
        };

        if (
            curr.macd !== undefined &&
            curr.signal !== undefined &&
            curr.histogram !== undefined &&
            prev.macd !== undefined &&
            prev.signal !== undefined &&
            prev.histogram !== undefined
        ) {

            // -------------------
            // 1. Trend Bias
            // -------------------
            if (curr.macd > 0) macdScore += 3;
            else macdScore -= 3;

            // -------------------
            // 2. Crossover
            // -------------------
            if (curr.macd > curr.signal) macdScore += 3;
            else macdScore -= 3;

            // -------------------
            // 3. Momentum (Histogram slope)
            // -------------------
            if (curr.histogram > prev.histogram) macdScore += 2;
            else macdScore -= 2;

            // -------------------
            // 4. Strong crossover bonus (optional but good)
            // -------------------
            if (
                prev.macd < prev.signal &&
                curr.macd > curr.signal &&
                curr.macd > 0
            ) {
                macdScore += 2;
            }

            // -------------------
            // 5. Noise filter (sideways market)
            // -------------------
            if (Math.abs(curr.macd) < 0.1) {
                macdScore *= 0.5;
            }
        }
    }
    rawBaseScore += macdScore;

    // -------------------
    // 4. VOLUME (fixed bias)
    // -------------------
    let volumeScore = 0;

    if (volumes.length >= 20) {
        const avgPeriod = Math.min(20, volumes.length);
        const recentPeriod = Math.min(5, volumes.length);
        const avgVol =
            volumes.slice(-avgPeriod).reduce((a, b) => a + b, 0) / avgPeriod;

        const recentVol =
            volumes.slice(-recentPeriod).reduce((a, b) => a + b, 0) / recentPeriod;

        if (recentVol > avgVol * 1.25) volumeScore = 6;
        else if (recentVol > avgVol * 1.1) volumeScore = 3;
        else if (recentVol < avgVol * 0.85) volumeScore = -3;
        else volumeScore = 0;
    }

    rawBaseScore += volumeScore;

    // -------------------
    // 5. NEWS (capped)
    // -------------------
    const newsScore = Math.max(-5, Math.min(5, calculateNewsSentiment(news)));
    rawBaseScore += newsScore;

    // -------------------
    // 6. RELATIVE STRENGTH
    // -------------------
    if (spyCloses.length > 15 && closes.length > 15) {
        const stockReturn = lastClose / toNumber(closes.at(-16)) - 1;
        const spyReturn = toNumber(spyCloses.at(-1)) / toNumber(spyCloses.at(-16)) - 1;

        const relative = stockReturn - spyReturn;

        if (relative > 0.05) relativeScore += 6;
        else if (relative < -0.05) relativeScore -= 6;
        rawBaseScore += relativeScore;
    }

    // -------------------
    // 7. CHOP PENALTY (reduced)
    // -------------------
    const range10 = Math.max(...closes.slice(-10)) - Math.min(...closes.slice(-10));
    const isChoppy = range10 < 2;

    if (isChoppy) penaltyScore -= 5;
    rawBaseScore += penaltyScore;

    // -------------------
    // Timeframe bonus (reduced)
    // -------------------
    const isShortTerm = closes.length < 80;
    if (!isShortTerm) rawBaseScore += 3;

    // -------------------
    // divergence score
    // -------------------
    let divergenceScore = 0;

    if (closes.length > 30 && rsiData.length > 30 && macdResult.macd.length > 30) {

        const lookback = 14;

        const priceRecent = closes.slice(-lookback);
        const rsiRecent = rsiData.slice(-lookback);

        const macdLine = macdResult.macd.slice(-macdResult.signal.length);
        const macdRecent = macdLine.slice(-lookback);

        const priceLow1 = Math.min(...priceRecent.slice(0, lookback / 2));
        const priceLow2 = Math.min(...priceRecent.slice(lookback / 2));

        const rsiLow1 = Math.min(...rsiRecent.slice(0, lookback / 2));
        const rsiLow2 = Math.min(...rsiRecent.slice(lookback / 2));

        const macdLow1 = Math.min(...macdRecent.slice(0, lookback / 2));
        const macdLow2 = Math.min(...macdRecent.slice(lookback / 2));

        const priceHigh1 = Math.max(...priceRecent.slice(0, lookback / 2));
        const priceHigh2 = Math.max(...priceRecent.slice(lookback / 2));

        const rsiHigh1 = Math.max(...rsiRecent.slice(0, lookback / 2));
        const rsiHigh2 = Math.max(...rsiRecent.slice(lookback / 2));

        const macdHigh1 = Math.max(...macdRecent.slice(0, lookback / 2));
        const macdHigh2 = Math.max(...macdRecent.slice(lookback / 2));

        // Bullish RSI divergence
        if (priceLow2 < priceLow1 && rsiLow2 > rsiLow1) {
            divergenceScore += 4;
        }

        // Bullish MACD divergence
        if (priceLow2 < priceLow1 && macdLow2 > macdLow1) {
            divergenceScore += 3;
        }

        // Bearish RSI divergence
        if (priceHigh2 > priceHigh1 && rsiHigh2 < rsiHigh1) {
            divergenceScore -= 4;
        }

        // Bearish MACD divergence
        if (priceHigh2 > priceHigh1 && macdHigh2 < macdHigh1) {
            divergenceScore -= 3;
        }
    }
    rawBaseScore += divergenceScore;

    //-------------
    // breakout score (new)
    //-------------
    let breakoutScore = 0;

    if (closes.length > 20) {
        const recentHigh = Math.max(...closes.slice(-20, -1));
        const lastClose = toNumber(closes.at(-1));

        const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
        const recentVol = volumes.slice(-3).reduce((a, b) => a + b, 0) / 3;

        const isBreakout = lastClose > recentHigh;
        const strongVolume = recentVol > avgVol * 1.4;

        if (isBreakout && strongVolume) breakoutScore += 8;     // strong breakout
        else if (isBreakout) breakoutScore += 5;                // weak breakout
    }
    rawBaseScore += breakoutScore;
    //---------------
    // volatility score (new)
    //---------------
    let volatilityScore = 0;

    const rangeRecent = Math.max(...closes.slice(-5)) - Math.min(...closes.slice(-5));
    const rangePast = Math.max(...closes.slice(-20, -5)) - Math.min(...closes.slice(-20, -5));

    if (rangeRecent > rangePast * 1.3) volatilityScore += 4;   // expansion
    else if (rangeRecent < rangePast * 0.7) volatilityScore -= 3; // contraction

    rawBaseScore += volatilityScore;

    //-------------------
    // market score (new)
    //-------------------
    let marketScore = 0;

    if (spyCloses.length > 50) {
        const spyEMA50 = spyCloses.slice(-50).reduce((a, b) => a + b, 0) / 50;
        const spyLast = spyCloses.at(-1);

        if (toNumber(spyLast) > spyEMA50) marketScore += 3;
        else marketScore -= 4;
    }
    rawBaseScore += marketScore;

    //-------------------
    // exaustion score (new)
    //-------------------
    let exhaustionScore = 0;

    const recentMove = (lastClose / toNumber(closes.at(-10))) - 1;

    if (recentMove > 0.18 && lastRSI > 75) {
        exhaustionScore -= 6; // overextended
    }
    rawBaseScore += exhaustionScore;
    // -------------------
    // FINAL SCORE
    // -------------------
    let finalScore = Math.round(rawBaseScore);
    finalScore = Math.max(20, Math.min(95, finalScore));

    const recommendation =
        finalScore >= 80 ? 'Strong Buy' :
            finalScore >= 65 ? 'Buy' :
                finalScore >= 50 ? 'Hold' :
                    finalScore >= 35 ? 'Avoid' : 'Sell';

    // -------------------
    // MACD outputs (fixed)
    // -------------------
    const lastMACD = macdData.length > 0 ? macdData.at(-1) : 'N/A';
    const lastSignal = macdData.length > 0 ? macdData.at(-1) : 'N/A'; // (replace if you store signal separately)
        
    return {
        finalScore,
        rawBaseScore: Math.round(rawBaseScore),
        recommendation,

        filtersApplied: {
            lowVolatility: isChoppy,
            structure: !isUptrend
        },

        lastRSI: Math.round(lastRSI),

        lastMACD: typeof lastMACD === 'number' ? lastMACD.toFixed(4) : 'N/A',
        lastSignal: typeof lastSignal === 'number' ? lastSignal.toFixed(4) : 'N/A',

        ema200Last: ema200Last ? ema200Last.toFixed(2) : 'N/A',
        recentCloses: closes.slice(-10),
        lastClose,
        ctsBreakdown: {
            trend: trendScore,
            ema: emaScore,
            momentum: momentumScore,
            volume: volumeScore,
            relative: relativeScore,
            penalty: penaltyScore
        }
    };
};