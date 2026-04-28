import {getCtsForSymbol} from '@/app/lib/evaluateAi/evaluateHelpers/getCtsForSymbol';
import {getNoTradeReasons} from '@/app/lib/evaluateAi/evaluateHelpers/getNoTradeReasons';
import { getTrendStage } from '../evaluateHelpers/getTrendStage';
import { getMomentumState } from '../evaluateHelpers/getMomentumState';
import { isFakeBreakout } from '../evaluateHelpers/isFakeBreakout';
import { getBaseUrl } from '@/app/lib/utils/get-base-url';

// Final evaluateStockForBuy - Rich Prompt + Early Cash Check
export const evaluateStockForBuy = async (
  symbol: string,
  autoStocks: any[],
  currentPrice: number
) => {
  try {
    if (currentPrice <= 0) {
      return { shouldBuy: false, reason: 'Invalid price' };
    }

    const autoStock = autoStocks.find((s: any) => s.symbol === symbol);
    if (!autoStock) {
      return { shouldBuy: false, reason: 'Stock not found' };
    }

    const investedSoFar =
      (autoStock.currentPosition?.shares || 0) *
      (autoStock.currentPosition?.entryPrice || 0);

    const availableCash = (autoStock.allocation || 0) - investedSoFar;

    if (availableCash < currentPrice) {
      return { shouldBuy: false, reason: 'Insufficient remaining cash' };
    }

    // =========================
    // 1. LOAD NEW COMBINED CTS
    // =========================
    const indicatorData = await getCtsForSymbol(symbol);

    const ctsScore = Number(indicatorData.ctsScore || 55);
    const dailyCTS = Number(indicatorData.dailyCTS || ctsScore);
    const intradayCTS = Number(indicatorData.intradayCTS || ctsScore);
    const alignment = indicatorData.alignment || 'mixed';

    const lastRSI = indicatorData.rsi;
    const lastMACD = indicatorData.macd;
    const lastSignal = indicatorData.signal;
    const ema200 = indicatorData.ema200;
    const recentCloses = indicatorData.recentCloses;

    const levels = indicatorData.levels || {
      support: null,
      resistance: null,
      reclaimLevel: null,
      breakdownLevel: null,
    };

    const support = levels.support;
    const resistance = levels.resistance;
    const reclaimLevel = levels.reclaimLevel;
    const breakdownLevel = levels.breakdownLevel;

    const customGuidance =
      autoStock.customGuidance || 'No special instruction.';

    const intradayMacdArr =
      indicatorData.intradayMacdArr || [];
    const intradaySignalArr =
      indicatorData.intradaySignalArr || [];
    const intradayCloses =
      indicatorData.intradayCloses || [];
    const intradayVolumes =
      indicatorData.intradayVolumes || [];

    const momentumState = getMomentumState(
      intradayMacdArr,
      intradaySignalArr
    );

    const trendStage = getTrendStage(
      intradayCloses,
      Number(ema200)
    );

    const fakeBreakout = isFakeBreakout(intradayCloses, intradayVolumes);

    // =========================
    // 2. AI PROMPT - NOW DUAL TIMEFRAME
    // =========================
    const prompt = `You are a disciplined trading analyst assisting a systematic trading engine.

The system already calculates:
- Daily CTS = higher timeframe trend/regime anchor
- 15-minute CTS = execution/timing quality
- Final CTS = weighted result used by the app

Your role is NOT to choose position size. Your role is to VALIDATE or BLOCK a trade based on alignment, timing, and risk.

CORE RULES:
1. Daily CTS is the PRIMARY anchor.
2. 15-minute CTS is the timing layer.
3. If daily and 15-minute CTS align bullishly, default to BUY unless a real red flag exists.
4. If daily CTS is strong but 15-minute CTS is weak, be cautious about chasing and prefer waiting.
5. If 15-minute CTS is strong but daily CTS is weak, treat it as a lower-conviction bounce unless there is unusually strong confirmation.
6. Mention key price levels clearly: support, resistance, reclaim level, or breakdown risk.
7. In the final sentence, state whether current price is favorable for entry/add, too extended, or should wait for reclaim/support hold.

Current Data:
Stock: ${symbol}
Final CTS: ${ctsScore}
Daily CTS: ${dailyCTS}
15m CTS: ${intradayCTS}
Alignment: ${alignment}

Price: $${currentPrice.toFixed(2)}
RSI: ${lastRSI}
MACD: ${lastMACD} (Signal: ${lastSignal})
200 EMA: ${ema200}
Recent closes: ${recentCloses}

Support: ${support ?? 'N/A'}
Resistance: ${resistance ?? 'N/A'}
Reclaim Level: ${reclaimLevel ?? 'N/A'}
Breakdown Level: ${breakdownLevel ?? 'N/A'}

User Guidance: ${customGuidance}
Position Status: ${
      autoStock.currentPosition
        ? 'Already in position (considering add)'
        : 'New position'
    }
Momentum State: ${momentumState}
Trend Stage: ${trendStage}
Fake Breakout Risk: ${fakeBreakout ? 'Yes' : 'No'}

IMPORTANT INTERPRETATION:
- bullish_confirmed = daily + 15m aligned
- bullish_timing_weak = daily bullish but 15m weak
- countertrend_bounce = 15m strong but daily weak
- bearish_confirmed = both weak
- mixed = uncertain

Format exactly:
ACTION: Buy or Hold
REASON: [4-5 sentences. Sentence 1 must mention Stock ${symbol}, Final CTS, Daily CTS, and 15m CTS with alignment. Sentence 2 should explain higher timeframe context. Sentence 3 should explain execution timing. Sentence 4 should mention support/resistance/reclaim/breakdown risk. Sentence 5 should say whether current price is favorable, extended, or should wait.]
TRADE THESIS: [1 sentence]
CONFIDENCE: [0-100]

Decide now.`;

    const chatUrl = `${getBaseUrl().replace(/\/$/, '')}/api/chat`;
    const res = await fetch(chatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
    });

    const raw = await res.text();
    if (!res.ok) {
      throw new Error(`Chat API ${res.status}: ${raw.slice(0, 180)}`);
    }

    let text = raw;
    try {
      const parsed = JSON.parse(raw);
      text = parsed?.content || parsed?.message || raw;
    } catch {
      // Keep raw text when response is not JSON.
    }

    const textClean = text.trim().replace(/\s+/g, ' ');

    const actionMatch = textClean.match(/ACTION:\s*(Buy|Hold)/i);
    const reasonMatch = textClean.match(
      /REASON:\s*(.+?)(?=TRADE THESIS:|CONFIDENCE:|$)/is
    );
    const thesisMatch = textClean.match(
      /TRADE THESIS:\s*(.+?)(?=CONFIDENCE:|$)/is
    );
    const confMatch = textClean.match(/CONFIDENCE:\s*(\d+)/i);

    const action = actionMatch ? actionMatch[1] : 'Hold';
    const reason = reasonMatch ? reasonMatch[1].trim() : '';
    const thesis = thesisMatch
      ? thesisMatch[1].trim()
      : 'Multi-timeframe confluence detected.';
    const confidence = confMatch ? Number(confMatch[1]) : 60;

    // =========================
    // 3. SYSTEM BUY SCORE
    //    (AI validates, system decides)
    // =========================
    let buyScore = 0;

    // Final CTS baseline
    if (ctsScore >= 75) buyScore += 45;
    else if (ctsScore >= 65) buyScore += 35;
    else if (ctsScore >= 55) buyScore += 15;
    else buyScore -= 20;

    // Higher timeframe anchor
    if (dailyCTS >= 75) buyScore += 20;
    else if (dailyCTS >= 65) buyScore += 12;
    else if (dailyCTS < 55) buyScore -= 18;

    // Intraday timing
    if (intradayCTS >= 75) buyScore += 18;
    else if (intradayCTS >= 65) buyScore += 10;
    else if (intradayCTS < 55) buyScore -= 12;

    // Alignment logic
    if (alignment === 'bullish_confirmed') buyScore += 15;
    if (alignment === 'bullish_timing_weak') buyScore -= 10;
    if (alignment === 'countertrend_bounce') buyScore -= 12;
    if (alignment === 'bearish_confirmed') buyScore -= 25;
    if (alignment === 'mixed') buyScore -= 6;

    // Intraday momentum / execution
    if (momentumState === 'accelerating_up') buyScore += 12;
    if (momentumState === 'slowing_up') buyScore -= 6;
    if (momentumState === 'rolling_over') buyScore -= 18;

    // Trend stage
    if (trendStage === 'early_trend') buyScore += 10;
    if (trendStage === 'late_trend') buyScore -= 12;
    if (trendStage === 'neutral') buyScore -= 8;

    // Fake breakout risk
    if (fakeBreakout) buyScore -= 30;

    // Price-vs-level context
    if (reclaimLevel && currentPrice > reclaimLevel) buyScore += 6;
    if (support && currentPrice <= support * 1.02 && currentPrice >= support)
      buyScore += 5;
    if (resistance && currentPrice >= resistance * 0.985) buyScore -= 8;
    if (breakdownLevel && currentPrice < breakdownLevel) buyScore -= 18;

    // AI veto softness
    if (action === 'Hold') buyScore -= 12;
    if (confidence >= 80 && action === 'Buy') buyScore += 6;

    const shouldBuy = buyScore >= 50;

    const breakdown = {
      ...(indicatorData.breakdown || {}),
      meta: {
        ctsScore,
        dailyCTS,
        intradayCTS,
        alignment,
        buyScore,
        levels,
        momentumState,
        trendStage,
        fakeBreakout,
      },
    };

    const noTradeReasons = getNoTradeReasons(
      ctsScore,
      Number(lastRSI),
      Number(lastMACD)
    );

    if (alignment === 'countertrend_bounce') {
      noTradeReasons.push(
        '15-minute strength is fighting a weaker daily trend'
      );
    }
    if (resistance && currentPrice >= resistance * 0.985) {
      noTradeReasons.push('Price is very close to resistance');
    }
    if (breakdownLevel && currentPrice < breakdownLevel) {
      noTradeReasons.push('Price is below the recent breakdown level');
    }

    return {
      shouldBuy,
      entryPrice: shouldBuy ? currentPrice : undefined,
      reason: reason.substring(0, 700),
      thesis: thesis.substring(0, 240),
      confidence,
      ctsScore,
      dailyCTS,
      intradayCTS,
      alignment,
      levels,
      breakdown,
      buyScore,
      noTradeReasons,
    };
  } catch (err) {
    console.error(`Buy evaluation failed for ${symbol}`, err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { shouldBuy: false, reason: `Evaluation error: ${message}` };
  }
};
