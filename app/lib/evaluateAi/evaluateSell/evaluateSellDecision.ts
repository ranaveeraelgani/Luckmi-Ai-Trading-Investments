import { getCtsForSymbol } from '@/app/lib/evaluateAi/evaluateHelpers/getCtsForSymbol';
import { getMomentumState } from '../evaluateHelpers/getMomentumState';
import { getTrendStage } from '../evaluateHelpers/getTrendStage';
import { isFakeBreakout } from '../evaluateHelpers/isFakeBreakout';
import { detectBullishDivergence, type DivergenceResult } from '../evaluateHelpers/detectBullishDivergence';
import { getBaseUrl } from '@/app/lib/utils/get-base-url';

type DecisionContext = {
  lastAiDecision?: any;
  nowMs?: number;
};

const AI_DECISION_CACHE_TTL_MS = 25 * 60 * 1000;

function getLevelState(price: number, level: number | null | undefined, nearPct = 0.015) {
  if (!Number.isFinite(price) || !Number.isFinite(Number(level))) return 'n/a';
  const normalizedLevel = Number(level);
  if (price < normalizedLevel) return 'below';
  if (price <= normalizedLevel * (1 + nearPct)) return 'near';
  return 'above';
}

function getSellPriceState(price: number, levels: { support: number | null; resistance: number | null; reclaimLevel: number | null; breakdownLevel: number | null; }) {
  return [
    `S:${getLevelState(price, levels.support)}`,
    `R:${getLevelState(price, levels.resistance)}`,
    `RC:${getLevelState(price, levels.reclaimLevel)}`,
    `BD:${getLevelState(price, levels.breakdownLevel, 0.01)}`,
  ].join('|');
}

function isFreshCachedDecision(decision: any, nowMs: number) {
  if (!decision?.timestamp) return false;
  const decisionTime = new Date(decision.timestamp).getTime();
  return Number.isFinite(decisionTime) && nowMs - decisionTime <= AI_DECISION_CACHE_TTL_MS;
}
// Smart Sell Decision - Uses real AI call with structured prompt
export const evaluateSellDecision = async (
  symbol: string,
  currentPosition: any,
  currentPriceStock: number,
  preloadedIndicatorData?: any,
  decisionContext?: DecisionContext
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

    const indicatorData = preloadedIndicatorData ?? await getCtsForSymbol(symbol);

    if (indicatorData.failed) {
      return { shouldSell: false, reason: 'Indicator data unavailable — skipping evaluation' };
    }

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

  // Early-reversal awareness: detect bullish divergence forming while in-position
  const dailyMacdArr = indicatorData.dailyMacdArr || [];
  const dailyCloses = indicatorData.dailyCloses || [];
  const divergenceResult: DivergenceResult = detectBullishDivergence(dailyCloses, dailyMacdArr, 20);
  const bullishDivergence = divergenceResult.detected;
  const divergenceStrength = divergenceResult.strength;

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
    const priceState = getSellPriceState(currentPrice, levels);
    const nowMs = decisionContext?.nowMs ?? Date.now();
    const cachedDecision = decisionContext?.lastAiDecision;
    const cachedMeta = cachedDecision?.ctsBreakdown?.meta || {};

    const priceDriftPct =
      Number.isFinite(Number(cachedDecision?.price)) && Number(cachedDecision?.price) > 0
        ? Math.abs((currentPrice - Number(cachedDecision.price)) / Number(cachedDecision.price)) * 100
        : 999;

    const canReuseCachedSellDecision =
      cachedDecision?.decisionType === 'sell' &&
      isFreshCachedDecision(cachedDecision, nowMs) &&
      cachedMeta.ctsScore === ctsScore &&
      cachedMeta.dailyCTS === dailyCTS &&
      cachedMeta.intradayCTS === intradayCTS &&
      cachedMeta.alignment === alignment &&
      cachedMeta.momentumState === momentumState &&
      cachedMeta.trendStage === trendStage &&
      cachedMeta.fakeBreakout === fakeBreakout &&
      cachedMeta.bullishDivergence === bullishDivergence &&
      cachedMeta.divergenceStrength === divergenceStrength &&
      cachedMeta.priceState === priceState &&
      priceDriftPct <= 0.75;

    if (canReuseCachedSellDecision) {
      const cachedSellScore = Number(cachedMeta.sellScore ?? 0);
      const cachedShouldSell = String(cachedDecision.action || 'Hold') === 'Sell';
      return {
        shouldSell: cachedShouldSell,
        reason: cachedDecision.reason || 'Cached AI recommendation reused.',
        confidence: Number(cachedDecision.confidence ?? 50),
        ctsScore,
        dailyCTS,
        intradayCTS,
        alignment,
        sellScore: cachedSellScore,
        ctsBreakdown: {
          ...(indicatorData.breakdown || {}),
          meta: {
            ...cachedMeta,
            priceState,
          },
        },
        levels,
        cached: true,
      };
    }

    // =========================
    // AI PROMPT - DUAL TIMEFRAME SELL
    // =========================
    const prompt = `You are a disciplined trading risk manager working alongside a systematic trading engine.

  The system calculates:
  - Daily CTS = higher timeframe trend/regime anchor
  - 15-minute CTS = execution/timing strength
  - Final CTS = weighted result used by the app

  IMPORTANT — ADVISORY ROLE:
  Your output directly adjusts the deterministic sellScore:
  - ACTION: Sell → adds +8 to sellScore (or +13 if confidence >= 80)
  - ACTION: Hold → subtracts -6 from sellScore
  The system still enforces its own threshold (sellScore >= 50 to execute). You cannot override it.
  Default to Hold unless there is a clear, specific reason to exit NOW. Avoid spurious Sells near support or on minor pullbacks.

  CORE RULES:
  1. Daily CTS is the PRIMARY anchor.
  2. 15-minute CTS determines whether weakness is actionable now.
  3. If daily and 15-minute CTS are both weak, bias toward SELL.
  4. If daily CTS is strong and 15-minute CTS is weak, prefer HOLD unless there is clear breakdown, exhaustion, or profit-protection reason.
  5. If daily CTS is weak but 15-minute CTS is strong, be cautious about selling into a bounce unless key support has clearly failed.
  6. Bullish Divergence = MACD making a higher low while price makes a lower low. If present, this signals a potential reversal forming — strongly prefer Hold unless other hard stops override.
  7. In Sentence 5, state whether support is holding, reclaim failed, breakdown triggered, resistance is nearby, or whether divergence suggests patience.

  CONFIDENCE RUBRIC:
  - 80-100: Clear exit — trend breakdown, both CTS weak, meaningful drawdown from peak, no support nearby
  - 65-79: Elevated risk but one red flag only; prefer Hold with close monitoring
  - 50-64: Mixed or uncertain; lean Hold unless hard stop triggered
  - <50: Bullish structure intact or reversal forming; Hold

  Current Position:
  Stock: ${symbol}
  Entry Price: $${currentPosition.entryPrice.toFixed(2)}
  Current Price: $${currentPrice.toFixed(2)}
  Unrealized P&L: $${pnl.toFixed(2)} (${pnlPercent.toFixed(1)}%)
  Peak P&L Reached: ${(currentPosition.peakPnLPercent ?? 0).toFixed(1)}%

  Final CTS: ${ctsScore}
  Daily CTS: ${dailyCTS}
  15m CTS: ${intradayCTS}
  Alignment: ${alignment}

  Momentum State: ${momentumState}
  Trend Stage: ${trendStage}
  Fake Breakout Risk: ${fakeBreakout ? 'Yes' : 'No'}
  Bullish Divergence: ${bullishDivergence ? `Yes — strength ${(divergenceStrength * 100).toFixed(0)}% (early reversal signal — caution on exits)` : 'No'}

  Support: ${support ?? 'N/A'}
  Resistance: ${resistance ?? 'N/A'}
  Reclaim Level: ${reclaimLevel ?? 'N/A'}
  Breakdown Level: ${breakdownLevel ?? 'N/A'}

  ALIGNMENT GUIDE:
  - bullish_confirmed = daily + 15m aligned bullish → strong hold bias
  - bullish_timing_weak = daily bullish but short-term timing weak → hold unless exhaustion
  - countertrend_bounce = 15m strong inside weaker daily → risky hold, watch closely
  - bearish_confirmed = both weak → exit bias
  - mixed = uncertain → evaluate individual signals

  Format exactly:
  ACTION: Sell or Hold
  REASON: [4-5 sentences. Sentence 1 must mention Stock ${symbol}, Final CTS, Daily CTS, 15m CTS, and alignment. Sentence 2 should explain higher timeframe context. Sentence 3 should explain current timing/momentum. Sentence 4 should explain risk or profit-protection including peak P&L context. Sentence 5 must state whether support is holding, reclaim failed, breakdown triggered, resistance is nearby, or whether divergence suggests patience.]
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

    // Bullish divergence discount: early reversal forming — reduce sell urgency
    if (bullishDivergence) {
      sellScore -= Math.round(10 * divergenceStrength);
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

      // Tier 1: Drawdown from peak price (protects against sharp reversals)
      if (peakPnL >= 20 && drawdownPercent <= -5) {
        sellScore += 40;
      } else if (peakPnL >= 12 && drawdownPercent <= -7) {
        sellScore += 30;
      } else if (peakPnL >= 6 && drawdownPercent <= -10) {
        sellScore += 20;
      }

      // Tier 2: Profit-giveback protection — catches P&L erosion before price drawdown threshold hits
      // e.g. was +12% open profit, now at +6% → gave back 6 points → protect it
      if (peakPnL >= 15 && pnlPercent < peakPnL - 8) {
        sellScore += 28;
      } else if (peakPnL >= 8 && pnlPercent < peakPnL - 5) {
        sellScore += 18;
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
        priceState,
        bullishDivergence,
        divergenceStrength,
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
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { shouldSell: false, reason: `Evaluation error: ${message}` };
  }
};