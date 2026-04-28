import { calculateMACD } from '@/app/lib/ctsHelpers/calculateMACD'
import { calculateEMA } from '@/app/lib/ctsHelpers/calculateEMA'
import { calculateRSI } from '@/app/lib/ctsHelpers/calculateRSI'
import { detectRectangleBreakout } from '@/app/lib/ctsHelpers/detectRectangleBreakout'
import { calculateFinalCTS } from '@/app/lib/calculateScore/calculateFinalCTS';
import { getNewsSentiment } from '../../ctsHelpers/getNewsSentiment';
import { getBaseUrl } from '@/app/lib/utils/get-base-url';

const toNumber = (value: string | number | undefined): number => {
  if (value === undefined || value === null) return 0;
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return isNaN(num) ? 0 : num;
};

const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getCtsForSymbol = async (symbol: string) => {
  try {
    const baseUrl = getBaseUrl().replace(/\/$/, '');
    const now = new Date();

    const intradayFrom = formatLocalDate(
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    );
    const dailyFrom = formatLocalDate(
      new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    );
    const toDate = formatLocalDate(now);

    // =========================
    // 1. FETCH INTRADAY 15m
    // =========================
    const intradayRes = await fetch(
      `${baseUrl}/api/polygon-candles?symbol=${symbol}&multiplier=15&timespan=minute&from=${intradayFrom}&to=${toDate}`
    );

    if (!intradayRes.ok) {
      throw new Error(`Intraday candle fetch failed: ${intradayRes.status}`);
    }

    const intradayData = await intradayRes.json();

    if (!intradayData.c || intradayData.c.length < 30) {
      return {
        ctsScore: 55,
        dailyCTS: 55,
        intradayCTS: 55,
        alignment: 'mixed',
        rsi: 'N/A',
        macd: 'N/A',
        signal: 'N/A',
        ema200: 'N/A',
        recentCloses: [],
        levels: null,
        breakdown: null,
      };
    }

    const intradayMaxPoints = 500;
    const intradayStartIndex = Math.max(0, intradayData.t.length - intradayMaxPoints);

    const intradaySliced = {
      t: intradayData.t.slice(intradayStartIndex),
      o: intradayData.o.slice(intradayStartIndex),
      h: intradayData.h.slice(intradayStartIndex),
      l: intradayData.l.slice(intradayStartIndex),
      c: intradayData.c.slice(intradayStartIndex),
      v: intradayData.v.slice(intradayStartIndex),
    };

    const intradayCloses = intradaySliced.c;
    const intradayVolumes = intradaySliced.v || [];

    // =========================
    // 2. FETCH DAILY
    // =========================
    const dailyRes = await fetch(
      `${baseUrl}/api/polygon-candles?symbol=${symbol}&multiplier=1&timespan=day&from=${dailyFrom}&to=${toDate}`
    );

    if (!dailyRes.ok) {
      throw new Error(`Daily candle fetch failed: ${dailyRes.status}`);
    }

    const dailyData = await dailyRes.json();

    if (!dailyData.c || dailyData.c.length < 40) {
      return {
        ctsScore: 55,
        dailyCTS: 55,
        intradayCTS: 55,
        alignment: 'mixed',
        rsi: 'N/A',
        macd: 'N/A',
        signal: 'N/A',
        ema200: 'N/A',
        recentCloses: [],
        levels: null,
        breakdown: null,
      };
    }

    const dailyCloses = dailyData.c;
    const dailyVolumes = dailyData.v || [];

    // =========================
    // 3. OPTIONAL SPY DAILY
    // =========================
    let spyDailyCloses: number[] = [];
    try {
      const spyRes = await fetch(
        `${baseUrl}/api/polygon-candles?symbol=SPY&multiplier=1&timespan=day&from=${dailyFrom}&to=${toDate}`
      );
      if (spyRes.ok) {
        const spyData = await spyRes.json();
        spyDailyCloses = spyData?.c || [];
      }
    } catch {
      spyDailyCloses = [];
    }

    // =========================
    // 4. INDICATORS - INTRADAY
    // =========================
    const {
      macd: intradayMacd,
      signal: intradaySignal,
    } = calculateMACD(intradayCloses);

    const intradayRsi = calculateRSI(intradayCloses, 14);
    const intradayEma20 =
      intradayCloses.length >= 20 ? calculateEMA(intradayCloses, 20) : [];
    const intradayEma50 =
      intradayCloses.length >= 50 ? calculateEMA(intradayCloses, 50) : [];

    // =========================
    // 5. INDICATORS - DAILY
    // =========================
    const {
      macd: dailyMacd,
      signal: dailySignal,
    } = calculateMACD(dailyCloses);

    const dailyRsi = calculateRSI(dailyCloses, 14);
    const dailyEma50 =
      dailyCloses.length >= 50 ? calculateEMA(dailyCloses, 50) : [];
    const dailyEma200 =
      dailyCloses.length >= 200 ? calculateEMA(dailyCloses, 200) : [];

    // =========================
    // 6. COMBINED CTS
    // =========================
    const result = calculateFinalCTS({
      dailyCloses,
      dailyVolumes,
      intradayCloses,
      intradayVolumes,
      dailyRsi,
      intradayRsi,
      dailyMacd,
      dailySignal,
      intradayMacd,
      intradaySignal,
      dailyEma50,
      dailyEma200,
      intradayEma20,
      intradayEma50,
      spyDailyCloses,
    });

    const ctsScore =
      typeof result?.finalScore === 'number' ? result.finalScore : 55;

    const lastRSI =
      result?.lastRSI !== undefined && result.lastRSI !== null
        ? toNumber(result.lastRSI)
        : 'N/A';

    const lastMACD =
      result?.lastMACD !== undefined && result.lastMACD !== null
        ? toNumber(result.lastMACD)
        : 'N/A';

    const lastSignal =
      result?.lastSignal !== undefined && result.lastSignal !== null
        ? toNumber(result.lastSignal)
        : 'N/A';

    const ema200Last =
      result?.ema200Last !== undefined && result.ema200Last !== null
        ? toNumber(result.ema200Last).toFixed(2)
        : 'N/A';

    const recentCloses = intradayCloses
      .slice(-10)
      .map((close: number) => Number(close))
      .filter((close: number) => Number.isFinite(close));

    return {
      ctsScore,
      dailyCTS: result.dailyCTS,
      intradayCTS: result.intradayCTS,
      alignment: result.alignment,

      rsi: lastRSI,
      macd: lastMACD,
      signal: lastSignal,
      ema200: ema200Last,
      recentCloses,

      levels: result.levels,
      breakdown: result.ctsBreakdown,

      intradayCloses,
      dailyCloses,
      intradayVolumes,
      dailyVolumes,

      intradayMacdArr: intradayMacd,
      intradaySignalArr: intradaySignal,
      dailyMacdArr: dailyMacd,
      dailySignalArr: dailySignal,
    };
  } catch (err) {
    console.error(`Failed to calculate indicators for ${symbol}`, err);
    return {
      ctsScore: 55,
      dailyCTS: 55,
      intradayCTS: 55,
      alignment: 'mixed',
      rsi: 'N/A',
      macd: 'N/A',
      signal: 'N/A',
      ema200: 'N/A',
      recentCloses: [],
      levels: null,
      breakdown: null,
    };
  }
};