import { getCtsForSymbol } from '@/app/lib/evaluateAi/evaluateHelpers/getCtsForSymbol';
import { getMomentumState } from '../evaluateHelpers/getMomentumState';
import { getTrendStage } from '../evaluateHelpers/getTrendStage';
import { isFakeBreakout } from '../evaluateHelpers/isFakeBreakout';
// Smart Sell Decision - Uses real AI call with structured prompt
export const evaluateSellDecision = async (
  symbol: string,
  currentPosition: any,
  currentPriceStock: number
) => {
  try {
    if (currentPriceStock <= 0) {
      return { shouldSell: false, reason: 'Invalid price' };
    }

    const currentPrice = Number(currentPriceStock);

    const pnl =
      (currentPrice - currentPosition.entryPrice) * currentPosition.shares;

    const pnlPercent =
      ((currentPrice - currentPosition.entryPrice) /
        currentPosition.entryPrice) *
      100;

    const indicatorData = await getCtsForSymbol(symbol);

    const ctsScore = Number(indicatorData.ctsScore || 55);
    const dailyCTS = Number(indicatorData.dailyCTS || ctsScore);
    const intradayCTS = Number(indicatorData.intradayCTS || ctsScore);
    const alignment = indicatorData.alignment || 'mixed';

    const normalizeCloses = (data: any) => {
      if (Array.isArray(data)) return data.map(Number);
      if (typeof data === 'string') return data.split(',').map(Number);
      return [];
    };

    const recentCloses = normalizeCloses(
      indicatorData.intradayCloses || indicatorData.recentCloses
    );

    const intradayMacdArr =
      indicatorData.intradayMacdArr || [];
    const intradaySignalArr =
      indicatorData.intradaySignalArr || [];
    const intradayVolumes =
      indicatorData.intradayVolumes || [];

    const momentumState = getMomentumState(
      intradayMacdArr,
      intradaySignalArr
    );

    const trendStage = getTrendStage(
      recentCloses,
      Number(indicatorData.ema200)
    );

    const fakeBreakout = isFakeBreakout(recentCloses, intradayVolumes);

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

    // =========================
    // AI PROMPT - DUAL TIMEFRAME SELL
    // =========================
    const prompt = `You are a disciplined trading risk manager working alongside a systematic trading engine.

The system calculates:
- Daily CTS = higher timeframe trend/regime anchor
- 15-minute CTS = execution/timing strength
- Final CTS = weighted result used by the app

Your role is to decide whether to EXIT (SELL) or HOLD based on:
- higher timeframe trend quality
- short-term timing weakness or strength
- support / resistance / breakdown / reclaim behavior
- profit protection and capital preservation

CORE RULES:
1. Daily CTS is the PRIMARY anchor.
2. 15-minute CTS determines whether weakness is actionable now.
3. If daily and 15-minute CTS are both weak, bias toward SELL.
4. If daily CTS is strong and 15-minute CTS is weak, prefer HOLD unless there is clear breakdown, exhaustion, or profit-protection reason.
5. If daily CTS is weak but 15-minute CTS is strong, be cautious about selling into a bounce unless key support has clearly failed.
6. In the final sentence, state whether current price is near support, near resistance, below breakdown, or still being defended.

Current Position:
Stock: ${symbol}
Entry Price: $${currentPosition.entryPrice.toFixed(2)}
Current Price: $${currentPrice.toFixed(2)}
Unrealized P&L: $${pnl.toFixed(2)} (${pnlPercent.toFixed(1)}%)

Final CTS: ${ctsScore}
Daily CTS: ${dailyCTS}
15m CTS: ${intradayCTS}
Alignment: ${alignment}

Momentum State: ${momentumState}
Trend Stage: ${trendStage}
Fake Breakout Risk: ${fakeBreakout ? 'Yes' : 'No'}

Support: ${support ?? 'N/A'}
Resistance: ${resistance ?? 'N/A'}
Reclaim Level: ${reclaimLevel ?? 'N/A'}
Breakdown Level: ${breakdownLevel ?? 'N/A'}

IMPORTANT INTERPRETATION:
- bullish_confirmed = daily + 15m aligned bullish
- bullish_timing_weak = daily bullish but short-term timing weak
- countertrend_bounce = short-term strength inside weaker daily structure
- bearish_confirmed = both weak
- mixed = uncertain

Format exactly:
ACTION: Sell or Hold
REASON: [4-5 sentences. Sentence 1 must mention Stock ${symbol}, Final CTS, Daily CTS, and 15m CTS with alignment. Sentence 2 should explain higher timeframe context. Sentence 3 should explain current timing/momentum. Sentence 4 should explain risk or profit-protection. Sentence 5 should mention whether support is holding, reclaim failed, breakdown triggered, or resistance is nearby.]
CONFIDENCE: [0-100]

Decide now.`;

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
    });

    let text = await res.text();
    const textClean = text.trim().replace(/\s+/g, ' ');

    const actionMatch = textClean.match(/ACTION:\s*(Sell|Hold)/i);
    const reasonMatch = textClean.match(/REASON:\s*(.+?)(?=CONFIDENCE:|$)/is);
    const confMatch = textClean.match(/CONFIDENCE:\s*(\d+)/i);

    const action = actionMatch ? actionMatch[1] : 'Hold';
    const reason = reasonMatch ? reasonMatch[1].trim() : '';
    const confidence = confMatch ? Number(confMatch[1]) : 50;

    // =========================
    // SYSTEM SELL SCORE
    // =========================
    let sellScore = 0;

    // Hard stop
    if (pnlPercent <= -6) {
      sellScore += 80;
    }

    // Final CTS baseline
    if (ctsScore < 50) sellScore += 35;
    else if (ctsScore < 55) sellScore += 20;
    else if (ctsScore >= 75) sellScore -= 10;

    // Daily anchor
    if (dailyCTS < 50) sellScore += 25;
    else if (dailyCTS < 55) sellScore += 12;
    else if (dailyCTS >= 75) sellScore -= 12;

    // Intraday timing
    if (intradayCTS < 50) sellScore += 20;
    else if (intradayCTS < 55) sellScore += 10;
    else if (intradayCTS >= 75) sellScore -= 6;

    // Alignment
    if (alignment === 'bearish_confirmed') sellScore += 20;
    if (alignment === 'bullish_confirmed') sellScore -= 15;
    if (alignment === 'bullish_timing_weak') sellScore += 8;
    if (alignment === 'countertrend_bounce') sellScore -= 4;

    // Momentum / structure state
    if (momentumState === 'slowing_down') sellScore += 22;
    if (momentumState === 'rolling_over') sellScore += 18;
    if (momentumState === 'accelerating_up') sellScore -= 10;

    if (trendStage === 'late_trend') sellScore += 15;
    if (trendStage === 'early_trend') sellScore -= 8;

    // Structure / price-level logic
    if (fakeBreakout) sellScore += 35;

    if (breakdownLevel && currentPrice < breakdownLevel) {
      sellScore += 20;
    }

    if (support && currentPrice < support) {
      sellScore += 15;
    }

    if (reclaimLevel && currentPrice < reclaimLevel && intradayCTS < 55) {
      sellScore += 10;
    }

    if (resistance && currentPrice >= resistance * 0.985 && pnlPercent > 0) {
      sellScore += 6;
    }

    // Trend-state helpers
    const isTrendStrong =
      trendStage === 'early_trend' &&
      momentumState === 'accelerating_up' &&
      dailyCTS >= 70;

    const isHealthyPullback =
      momentumState === 'slowing_up' &&
      trendStage !== 'late_trend' &&
      dailyCTS >= 65;

    const isExhaustion =
      momentumState === 'slowing_up' &&
      trendStage === 'late_trend';

    const makingHigherHighs =
      recentCloses.length >= 3 &&
      recentCloses
        .slice(-3)
        .every((v: number, i: number, arr: number[]) => i === 0 || v > arr[i - 1]);

    if (makingHigherHighs && isTrendStrong) {
      sellScore -= 15;
    }

    // Profit protection
    if (pnlPercent >= 6 && pnlPercent < 12) {
      if (isHealthyPullback) {
        sellScore += 8;
      }
      if (alignment === 'bearish_confirmed') {
        sellScore += 10;
      }
    }

    if (pnlPercent >= 12) {
      if (isTrendStrong) {
        sellScore -= 20;
      } else if (isHealthyPullback) {
        sellScore += 12;
      } else if (isExhaustion) {
        sellScore += 28;
      }
    }

    // Trailing protection
    if (currentPosition) {
      const peakPrice = currentPosition.peakPrice || currentPrice;
      const drawdownPercent =
        ((currentPrice - peakPrice) / peakPrice) * 100;
      const peakPnL = currentPosition.peakPnLPercent || 0;

      if (peakPnL >= 20 && drawdownPercent <= -5) {
        sellScore += 40;
      } else if (peakPnL >= 12 && drawdownPercent <= -7) {
        sellScore += 30;
      } else if (peakPnL >= 6 && drawdownPercent <= -10) {
        sellScore += 20;
      }
    }

    // Avoid instant noise exits
    const timeInTradeMinutes =
      (Date.now() - new Date(currentPosition.entryTime).getTime()) / (1000 * 60);

    if (timeInTradeMinutes < 30 && pnlPercent > 0) {
      sellScore -= 10;
    }

    // AI influence
    if (action === 'Sell') sellScore += 8;
    if (action === 'Hold') sellScore -= 6;
    if (confidence >= 80 && action === 'Sell') sellScore += 5;

    const shouldSell = sellScore >= 50;

    const ctsBreakdown = {
      ...(indicatorData.breakdown || {}),
      meta: {
        ctsScore,
        dailyCTS,
        intradayCTS,
        alignment,
        sellScore,
        levels,
        momentumState,
        trendStage,
        fakeBreakout,
        pnlPercent,
      },
    };

    return {
      shouldSell,
      reason,
      confidence,
      ctsScore,
      dailyCTS,
      intradayCTS,
      alignment,
      sellScore,
      ctsBreakdown,
      levels,
    };
  } catch (err) {
    console.error(`Sell evaluation failed for ${symbol}`, err);
    return { shouldSell: false, reason: 'Evaluation error' };
  }
};