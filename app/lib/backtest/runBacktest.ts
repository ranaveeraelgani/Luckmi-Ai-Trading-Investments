import { calculateMACD } from "../ctsHelpers/calculateMACD";
import { calculateEMA } from "../ctsHelpers/calculateEMA";
import { calculateRSI } from "../ctsHelpers/calculateRSI";
import { detectRectangleBreakout } from "../ctsHelpers/detectRectangleBreakout";

type BacktestTrade = {
  entryPrice: number;
  exitPrice?: number;
  shares: number;
  entryTime: Date;
  exitTime?: Date;
  pnl?: number;
  pnlPercent?: number;
  ctsAtEntry: number;
};

type BacktestResult = {
  trades: BacktestTrade[];
  totalReturn: number;
  winRate: number;
  maxDrawdown: number;
  symbol: string;
};
import { calculateFinalCTS } from "@/app/lib/calculateScore/calculateFinalCTS";
import { getNewsSentiment } from "../ctsHelpers/getNewsSentiment";
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
  var news = await getNewsSentiment(symbol) as any[] || [];
  //console.log(`Fetched ${news.length} news items for backtest of ${symbol}`, news);
  for (let i = 50; i < closes.length; i++) {
    // Slice historical data up to this candle
    const sliceCloses = closes.slice(0, i + 1);
    const sliceOhlc = ohlc.slice(0, i + 1);
    const sliceVolumes = volumes.slice(0, i + 1);
    const { macd, signal, histogram } = calculateMACD(closes);
    const rsi = calculateRSI(closes, 14);
    const ema200 = closes.length >= 200 ? calculateEMA(closes, 200) : [];

    const breakoutResult = detectRectangleBreakout(ohlc, volumes);
    const result =  await calculateFinalCTS(
      sliceOhlc,
      sliceCloses,
      macd,
      rsi,
      ema200,
      sliceVolumes,
      null,
      news || [],
      [],
      symbol
    );

    const ctsScore = result.finalScore;
    const price = closes[i];
    const time = ohlc[i].x;

    // === POSITION SIZING (CTS-based)
    const getAllocationPercent = (cts: number) => {
      if (cts >= 85) return 1.0;
      if (cts >= 75) return 0.75;
      if (cts >= 65) return 0.5;
      return 0;
    };

    // === BUY LOGIC
    if (!position) {
      const allocationPercent = getAllocationPercent(ctsScore);
      const amountToInvest = cash * allocationPercent;

      if (ctsScore >= 65 && amountToInvest > price) {
        const shares = Math.floor(amountToInvest / price);

        position = {
          entryPrice: price,
          shares,
          entryTime: time,
          ctsAtEntry: ctsScore
        };

        cash -= shares * price;
      }
    }

    // === SELL LOGIC
    else if (position) {
      const pnlPercent = ((price - position.entryPrice) / position.entryPrice) * 100;

      const shouldSell =
        ctsScore < 50 ||         // CTS breakdown
        pnlPercent >= 15 ||      // take profit
        pnlPercent <= -8;        // stop loss

      if (shouldSell) {
        const exitValue = position.shares * price;
        const pnl = exitValue - (position.shares * position.entryPrice);

        const trade: BacktestTrade = {
          ...position,
          exitPrice: price,
          exitTime: time,
          pnl,
          pnlPercent
        };

        trades.push(trade);
        cash += exitValue;
        position = null;
      }
    }

    // === EQUITY TRACKING
    const equity = position
      ? cash + (position.shares * price)
      : cash;

    if (equity > peakEquity) peakEquity = equity;

    const drawdown = (peakEquity - equity) / peakEquity;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  // === METRICS
  const totalReturn = ((cash - 10000) / 10000) * 100;

  const wins = trades.filter(t => (t.pnl || 0) > 0).length;
  const winRate = trades.length ? (wins / trades.length) * 100 : 0;
  console.log(`Backtest completed for ${symbol} - Total Return: ${totalReturn.toFixed(2)}%, Win Rate: ${winRate.toFixed(1)}%, Max Drawdown: ${(maxDrawdown * 100).toFixed(1)}%`);
  console.log(`Trades:`, trades);
  return {
    trades,
    totalReturn,
    winRate,
    maxDrawdown,
    symbol
  };
};