import { calculateMACD } from '@/app/lib/ctsHelpers/calculateMACD'
import { calculateEMA } from '@/app/lib/ctsHelpers/calculateEMA'
import { calculateRSI } from '@/app/lib/ctsHelpers/calculateRSI'
import { detectRectangleBreakout } from '@/app/lib/ctsHelpers/detectRectangleBreakout'
import { calculateFinalCTS } from '@/app/lib/calculateScore/calculateFinalCTS';
import { getNewsSentiment } from '../../ctsHelpers/getNewsSentiment';

const toNumber = (value: string | number | undefined): number => {
    if (value === undefined || value === null) return 0;
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return isNaN(num) ? 0 : num;
};
// Ultra-safe getCtsForSymbol - Eliminates 'toFixed on never' error
export const getCtsForSymbol = async (symbol: string) => {
    try {
    let daysBack = 40;
    // if (timeRange === '1d') daysBack = 2;
    // if (timeRange === '1w') daysBack = 10;
    // if (timeRange === '1m') daysBack = 40;

    const fromDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = new Date().toISOString().split('T')[0];

    const multiplier = 5; // resolution === 'D' ? '1' : resolution;
    const timespan = 'minute'; // resolution === 'D' ? 'day' : 'minute';
       
        const res = await fetch(
            `/api/polygon-candles?symbol=${symbol}&multiplier=${multiplier}&timespan=${timespan}&from=${fromDate}&to=${toDate}`
        );

        if (!res.ok) throw new Error(`Candle fetch failed: ${res.status}`);

        const data = await res.json();

        if (!data.c || data.c.length < 20) {
            console.log(`Not enough data for ${symbol} (${data.c?.length || 0} bars)`);
            return {
                ctsScore: 55,
                rsi: 'N/A',
                macd: 'N/A',
                signal: 'N/A',
                ema200: 'N/A',
                recentCloses: 'N/A'
            };
        }

        const maxPoints = 500;
        const startIndex = Math.max(0, data.t.length - maxPoints);
        const slicedData = {
            t: data.t.slice(startIndex),
            o: data.o.slice(startIndex),
            h: data.h.slice(startIndex),
            l: data.l.slice(startIndex),
            c: data.c.slice(startIndex),
            v: data.v.slice(startIndex),
        };
        const closes = data.c;
        const ohlc = data.t.map((t: number, i: number) => ({
            x: new Date(t * 1000),
            o: data.o[i],
            h: data.h[i],
            l: data.l[i],
            c: data.c[i],
        }));

        const { macd, signal, histogram } = calculateMACD(closes);
        const rsi = calculateRSI(closes, 14);
        const ema200 = closes.length >= 200 ? calculateEMA(closes, 200) : [];
        const breakoutResult = detectRectangleBreakout(ohlc, slicedData.v);
        var news = await getNewsSentiment(symbol) as any[] || [];
        // check rsi, macd, ema200, breakout, news sentiment and closes on console
        console.log(`getctsForSymbol indicators for ${symbol} - RSI: ${rsi.slice(-1)[0]}, MACD: ${macd.slice(-1)[0]}, Signal: ${signal.slice(-1)[0]}, EMA200: ${ema200.slice(-1)[0]}, Breakout: ${breakoutResult ? breakoutResult.type : 'none'}, News Sentiment: ${news.length} items, Recent Closes: ${closes.slice(-5).map((c: number) => c.toFixed(2)).join(', ')}`);
        // 2. Calculate CTS
        const result = await calculateFinalCTS(
            ohlc,
            closes,
            macd,
            rsi,
            ema200,
            slicedData.v,
            breakoutResult,
            news || [],
            [],
            symbol
        );

        const ctsScore = typeof result?.finalScore === 'number' ? result.finalScore : 55;
        const breakdown = result?.ctsBreakdown || null;
        // Ultra-safe extraction
        // Ultra-safe extraction with type assertion
        const lastRSI = result?.lastRSI !== undefined && result.lastRSI !== null ? toNumber(result.lastRSI) : 'N/A';
        const lastMACD = result?.lastMACD !== undefined && result.lastMACD !== null ? toNumber(result.lastMACD) : 'N/A';
        const lastSignal = result?.lastSignal !== undefined && result.lastSignal !== null ? toNumber(result.lastSignal) : 'N/A';
        const ema200Last = result.ema200Last ? toNumber(result.ema200Last).toFixed(2) : 'N/A';

        const recentClosesStr = closes.slice(-10).map((c: number) => Number(c).toFixed(2)).join(', ');
        //console.log('ema200Last', ema200Last, 'lastsignal', lastSignal, 'lastMACD', lastMACD, 'lastRSI', lastRSI, 'ctsScore', ctsScore, 'recentClosesStr', recentClosesStr  );
        return {
            ctsScore,
            rsi: lastRSI,
            macd: lastMACD,
            signal: lastSignal,
            ema200: ema200Last,
            recentCloses: recentClosesStr,
            breakdown,
            macdArr: macd,
            signalArr: signal,
            closes,
            volumes: slicedData.v
        };

    } catch (err) {
        console.error(`Failed to calculate indicators for ${symbol}`, err);
        return {
            ctsScore: 55,
            rsi: 'N/A',
            macd: 'N/A',
            signal: 'N/A',
            ema200: 'N/A',
            recentCloses: 'N/A'
        };
    }
};