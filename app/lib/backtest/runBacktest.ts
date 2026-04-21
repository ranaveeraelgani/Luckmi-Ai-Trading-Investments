import { calculateMACD } from "../ctsHelpers/calculateMACD";
import { calculateEMA } from "../ctsHelpers/calculateEMA";
import { calculateRSI } from "../ctsHelpers/calculateRSI";
import { detectRectangleBreakout } from "../ctsHelpers/detectRectangleBreakout";
import { calculateFinalCTS } from "@/app/lib/calculateScore/calculateFinalCTS";
import { getNewsSentiment } from "../ctsHelpers/getNewsSentiment";

type BacktestTrade = {
  entryPrice: number;
  exitPrice?: number;
  shares: number;
  entryTime: Date;
  exitTime?: Date;
  pnl?: number;
  pnlPercent?: number;
  ctsAtEntry: number;
  dailyCTSAtEntry?: number;
  intradayCTSAtEntry?: number;
};

type BacktestResult = {
  trades: BacktestTrade[];
  totalReturn: number;
  winRate: number;
  maxDrawdown: number;
  symbol: string;
};

const toDateSafe = (value: any) => {
  return value instanceof Date ? value : new Date(value);
};

export const runBacktest = async (
  ohlc: any[],
  closes: number[],
  volumes: number[],
  symbol: string
): Promise<BacktestResult> => {
  let cash = 10000;
  let position: BacktestTrade | null = null;
  let trades: BacktestTrade[] = [];

  let peakEquity = cash;
  let maxDrawdown = 0;

  const news = ((await getNewsSentiment(symbol)) as any[]) || [];

  // Need enough bars for daily-style context + intraday signal quality
  const startIndex = Math.max(60, 200);

  for (let i = startIndex; i < closes.length; i++) {
    // =========================
    // Slice historical data up to this point only
    // =========================
    const sliceCloses = closes.slice(0, i + 1);
    const sliceOhlc = ohlc.slice(0, i + 1);
    const sliceVolumes = volumes.slice(0, i + 1);

    // =========================
    // Indicators based on sliced data
    // =========================
    const { macd, signal } = calculateMACD(sliceCloses);
    const rsi = calculateRSI(sliceCloses, 14);
    const ema20 = sliceCloses.length >= 20 ? calculateEMA(sliceCloses, 20) : [];
    const ema50 = sliceCloses.length >= 50 ? calculateEMA(sliceCloses, 50) : [];
    const ema200 = sliceCloses.length >= 200 ? calculateEMA(sliceCloses, 200) : [];

    const breakoutResult = detectRectangleBreakout(sliceOhlc, sliceVolumes);

    // =========================
    // Approximation inside single-series backtest:
    // treat the same series as both daily + intraday if you only have one dataset
    // You can later improve this by passing separate daily/intraday arrays.
    // =========================
    const result = calculateFinalCTS({
      dailyCloses: sliceCloses,
      dailyVolumes: sliceVolumes,
      intradayCloses: sliceCloses,
      intradayVolumes: sliceVolumes,
      dailyRsi: rsi,
      intradayRsi: rsi,
      dailyMacd: macd,
      dailySignal: signal,
      intradayMacd: macd,
      intradaySignal: signal,
      dailyEma50: ema50,
      dailyEma200: ema200,
      intradayEma20: ema20,
      intradayEma50: ema50,
      spyDailyCloses: [],
    });

    const ctsScore = Number(result.finalScore || 50);
    const dailyCTS = Number(result.dailyCTS || ctsScore);
    const intradayCTS = Number(result.intradayCTS || ctsScore);

    const price = Number(closes[i]);
    const time = toDateSafe(ohlc[i]?.x);

    // =========================
    // Position sizing
    // =========================
    const getAllocationPercent = (cts: number) => {
      if (cts >= 85) return 1.0;
      if (cts >= 75) return 0.75;
      if (cts >= 65) return 0.5;
      if (cts >= 55) return 0.25;
      return 0;
    };

    // =========================
    // BUY LOGIC
    // =========================
    if (!position) {
      const allocationPercent = getAllocationPercent(ctsScore);
      const amountToInvest = cash * allocationPercent;

      const strongEnoughToEnter =
        ctsScore >= 65 &&
        dailyCTS >= 60 &&
        intradayCTS >= 60;

      if (strongEnoughToEnter && amountToInvest > price) {
        const shares = Math.floor(amountToInvest / price);

        if (shares > 0) {
          position = {
            entryPrice: price,
            shares,
            entryTime: time,
            ctsAtEntry: ctsScore,
            dailyCTSAtEntry: dailyCTS,
            intradayCTSAtEntry: intradayCTS,
          };

          cash -= shares * price;
        }
      }
    }

    // =========================
    // SELL LOGIC
    // =========================
    else {
      const pnlPercent =
        ((price - position.entryPrice) / position.entryPrice) * 100;

      const shouldSell =
        ctsScore < 50 ||              // overall breakdown
        dailyCTS < 50 ||              // higher timeframe weak
        intradayCTS < 45 ||           // timing breaks hard
        pnlPercent >= 15 ||           // take profit
        pnlPercent <= -8;             // stop loss

      if (shouldSell) {
        const exitValue = position.shares * price;
        const pnl = exitValue - position.shares * position.entryPrice;

        const trade: BacktestTrade = {
          ...position,
          exitPrice: price,
          exitTime: time,
          pnl,
          pnlPercent,
        };

        trades.push(trade);
        cash += exitValue;
        position = null;
      }
    }

    // =========================
    // EQUITY TRACKING
    // =========================
    const equity = position
      ? cash + position.shares * price
      : cash;

    if (equity > peakEquity) peakEquity = equity;

    const drawdown = peakEquity > 0 ? (peakEquity - equity) / peakEquity : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  // =========================
  // FORCE CLOSE ANY OPEN POSITION AT FINAL BAR
  // =========================
  if (position && closes.length > 0) {
    const finalPrice = Number(closes[closes.length - 1]);
    const finalTime = toDateSafe(ohlc[ohlc.length - 1]?.x);

    const exitValue = position.shares * finalPrice;
    const pnl = exitValue - position.shares * position.entryPrice;
    const pnlPercent =
      ((finalPrice - position.entryPrice) / position.entryPrice) * 100;

    trades.push({
      ...position,
      exitPrice: finalPrice,
      exitTime: finalTime,
      pnl,
      pnlPercent,
    });

    cash += exitValue;
    position = null;
  }

  // =========================
  // FINAL METRICS
  // =========================
  const totalReturn = ((cash - 10000) / 10000) * 100;

  const wins = trades.filter((t) => (t.pnl || 0) > 0).length;
  const winRate = trades.length ? (wins / trades.length) * 100 : 0;

  console.log(
    `Backtest completed for ${symbol} - Total Return: ${totalReturn.toFixed(
      2
    )}%, Win Rate: ${winRate.toFixed(1)}%, Max Drawdown: ${(
      maxDrawdown * 100
    ).toFixed(1)}%`
  );
  console.log(`Trades:`, trades);

  return {
    trades,
    totalReturn,
    winRate,
    maxDrawdown,
    symbol,
  };
};