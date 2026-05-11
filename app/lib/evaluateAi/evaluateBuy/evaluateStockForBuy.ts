import {getCtsForSymbol} from '@/app/lib/evaluateAi/evaluateHelpers/getCtsForSymbol';
import {getNoTradeReasons} from '@/app/lib/evaluateAi/evaluateHelpers/getNoTradeReasons';
import { getTrendStage } from '../evaluateHelpers/getTrendStage';
import { getMomentumState } from '../evaluateHelpers/getMomentumState';
import { isFakeBreakout } from '../evaluateHelpers/isFakeBreakout';
import { detectBullishDivergence, type DivergenceResult } from '../evaluateHelpers/detectBullishDivergence';
import { detectVolumeAcceleration, type VolumeAccelerationResult } from '../evaluateHelpers/detectVolumeAcceleration';
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

function getBuyPriceState(price: number, levels: { support: number | null; resistance: number | null; reclaimLevel: number | null; breakdownLevel: number | null; }) {
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

// Final evaluateStockForBuy - Rich Prompt + Early Cash Check
export const evaluateStockForBuy = async (
  symbol: string,
  autoStocks: any[],
  currentPrice: number,
  preloadedIndicatorData?: any,
  decisionContext?: DecisionContext
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
    const indicatorData = preloadedIndicatorData ?? await getCtsForSymbol(symbol);

    if (indicatorData.failed) {
      return { shouldBuy: false, reason: 'Indicator data unavailable — skipping evaluation' };
    }

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
    const priceState = getBuyPriceState(currentPrice, levels);
    const nowMs = decisionContext?.nowMs ?? Date.now();
    const cachedDecision = decisionContext?.lastAiDecision;
    const cachedMeta = cachedDecision?.ctsBreakdown?.meta || {};

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

    const dailyMacdArr =
      indicatorData.dailyMacdArr || [];
    const dailyCloses =
      indicatorData.dailyCloses || [];
    const dailyVolumes =
      indicatorData.dailyVolumes || [];

    const momentumState = getMomentumState(
      intradayMacdArr,
      intradaySignalArr
    );

    const trendStage = getTrendStage(
      intradayCloses,
      Number(ema200)
    );

    const fakeBreakout = isFakeBreakout(intradayCloses, intradayVolumes);

    // NEW: Early-entry enhancement detectors (graded strength 0–1)
    const divergenceResult: DivergenceResult = detectBullishDivergence(
      dailyCloses,
      dailyMacdArr,
      20
    );
    const bullishDivergence = divergenceResult.detected;
    const divergenceStrength = divergenceResult.strength;

    const volumeResult: VolumeAccelerationResult = detectVolumeAcceleration(
      intradayCloses,
      intradayVolumes,
      5
    );
    const volumeAcceleration = volumeResult.detected;
    const volumeStrength = volumeResult.strength;

    const priceDriftPct =
      Number.isFinite(Number(cachedDecision?.price)) && Number(cachedDecision?.price) > 0
        ? Math.abs((currentPrice - Number(cachedDecision.price)) / Number(cachedDecision.price)) * 100
        : 999;

    const canReuseCachedBuyDecision =
      cachedDecision?.decisionType === 'buy' &&
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
      cachedMeta.volumeAcceleration === volumeAcceleration &&
      cachedMeta.volumeStrength === volumeStrength &&
      cachedMeta.priceState === priceState &&
      priceDriftPct <= 0.75;

    if (canReuseCachedBuyDecision) {
      const cachedBuyScore = Number(cachedMeta.buyScore ?? 0);
      const cachedAction = String(cachedDecision.action || 'Hold');
      const cachedShouldBuy = cachedAction === 'Buy' || cachedAction === 'Buy More';
      const cachedBreakdown = {
        ...(indicatorData.breakdown || {}),
        meta: {
          ...cachedMeta,
          priceState,
        },
      };

      const noTradeReasons = getNoTradeReasons(
        ctsScore,
        Number(lastRSI),
        Number(lastMACD)
      );

      if (alignment === 'countertrend_bounce') {
        noTradeReasons.push('15-minute strength is fighting a weaker daily trend');
      }
      if (resistance && currentPrice >= resistance * 0.985) {
        noTradeReasons.push('Price is very close to resistance');
      }
      if (breakdownLevel && currentPrice < breakdownLevel) {
        noTradeReasons.push('Price is below the recent breakdown level');
      }

      return {
        shouldBuy: cachedShouldBuy,
        entryPrice: cachedShouldBuy ? currentPrice : undefined,
        reason: cachedDecision.reason || 'Cached AI recommendation reused.',
        thesis: 'Cached AI recommendation reused.',
        confidence: Number(cachedDecision.confidence ?? 50),
        ctsScore,
        dailyCTS,
        intradayCTS,
        alignment,
        levels,
        breakdown: cachedBreakdown,
        buyScore: cachedBuyScore,
        noTradeReasons,
        cached: true,
      };
    }

    // =========================
    // 2. AI PROMPT - NOW DUAL TIMEFRAME
    // =========================
    const prompt = `You are a disciplined trading analyst assisting a systematic trading engine.

The system already calculates:
- Daily CTS = higher timeframe trend/regime anchor
- 15-minute CTS = execution/timing quality
- Final CTS = weighted blended result (65% daily + 35% intraday)

Your role is ADVISORY: validate or flag risk. The deterministic engine makes the final execution decision.
A "Hold" from you applies a -12 penalty to buyScore. A high-confidence "Buy" adds +6. You cannot override the score threshold.

CORE RULES:
1. Daily CTS is the PRIMARY anchor. Strong daily CTS = strong foundation.
2. 15-minute CTS is the timing layer. Weak intraday = wait for alignment, not necessarily avoid.
3. If daily and 15-minute CTS align bullishly (bullish_confirmed), default to BUY unless a genuine red flag exists.
4. If daily CTS is strong but 15-minute weak (bullish_timing_weak): prefer Hold — timing is not right yet.
5. If 15-minute strong but daily weak (countertrend_bounce): lower conviction; mention risk explicitly.
6. Bullish Divergence = MACD making higher low while price makes lower low; treat as early reversal confirmation.
7. Volume Acceleration = surge in volume on upward reversal; treat as high-conviction participation signal.
8. Mention key price levels clearly: support, resistance, reclaim level, or breakdown risk.
9. Final sentence: state whether current price is favorable, too extended, or should wait.

CONFIDENCE RUBRIC:
- 80-100: Confluence is clear — strong CTS, alignment, positive signals, no red flags
- 65-79: Good setup with one mixed condition but tradable
- 50-64: Uncertain or one risky element; prefer Hold
- <50: Significant risk present; use Hold

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
Bullish Divergence: ${bullishDivergence ? `Yes — strength ${(divergenceStrength * 100).toFixed(0)}% (MACD higher low while price made lower low)` : 'No'}
Volume Acceleration: ${volumeAcceleration ? `Yes — strength ${(volumeStrength * 100).toFixed(0)}% (volume surge on reversal)` : 'No'}

ALIGNMENT GUIDE:
- bullish_confirmed = daily + 15m both bullish → strong entry window
- bullish_timing_weak = daily bullish but 15m weak → wait for timing
- countertrend_bounce = 15m strong but daily weak → risky, lower conviction
- bearish_confirmed = both weak → avoid
- mixed = uncertain → caution

Format exactly:
ACTION: Buy or Hold
REASON: [4-5 sentences. Sentence 1: mention ${symbol}, Final CTS, Daily CTS, 15m CTS, and alignment. Sentence 2: higher timeframe context. Sentence 3: execution timing and momentum. Sentence 4: support/resistance/reclaim/breakdown. Sentence 5: whether divergence/volume signals support or weaken the case, and whether entry is favorable or should wait.]
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

    // Higher timeframe anchor (reduced: finalCTS already embeds 65% of daily)
    if (dailyCTS >= 75) buyScore += 12;
    else if (dailyCTS >= 65) buyScore += 7;
    else if (dailyCTS < 55) buyScore -= 12;

    // Intraday timing (reduced: finalCTS already embeds 35% of intraday)
    if (intradayCTS >= 75) buyScore += 10;
    else if (intradayCTS >= 65) buyScore += 6;
    else if (intradayCTS < 55) buyScore -= 8;

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
    if (momentumState === 'slowing_down') buyScore -= 10;

    // Trend stage
    if (trendStage === 'early_trend') buyScore += 10;
    if (trendStage === 'late_trend') buyScore -= 12;
    if (trendStage === 'neutral') buyScore -= 8;
    if (trendStage === 'downtrend') buyScore -= 10;

    // Fake breakout risk (context-aware: strong confirmed daily structure gets a softer penalty)
    const fakeBreakoutPenalty = fakeBreakout
      ? (dailyCTS >= 70 && alignment === 'bullish_confirmed' ? 15 : 30)
      : 0;
    buyScore -= fakeBreakoutPenalty;

    // NEW: Early-entry enhancements (graded by signal strength)
    if (bullishDivergence) buyScore += Math.round(8 * divergenceStrength);
    if (volumeAcceleration) buyScore += Math.round(6 * volumeStrength);

    // Price-vs-level context
    if (reclaimLevel && currentPrice > reclaimLevel) buyScore += 6;
    if (support && currentPrice <= support * 1.02 && currentPrice >= support)
      buyScore += 5;
    if (resistance && currentPrice >= resistance * 0.985) buyScore -= 8;
    if (breakdownLevel && currentPrice < breakdownLevel) buyScore -= 18;

    // AI veto softness
    if (action === 'Hold') buyScore -= 12;
    if (confidence >= 80 && action === 'Buy') buyScore += 6;

    // Saturation cap keeps score distribution interpretable and prevents runaway stacking.
    const rawBuyScore = buyScore;
    buyScore = Math.min(buyScore, 100);

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
        fakeBreakoutPenalty,
        rawBuyScore,
        priceState,
        bullishDivergence,
        divergenceStrength,
        volumeAcceleration,
        volumeStrength,
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
