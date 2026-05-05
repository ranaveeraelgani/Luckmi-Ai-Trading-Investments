// ============================================================
// Luckmi Options Score — deterministic scoring engine
//
// Final OCS = 0.35 × Flow + 0.25 × Structure + 0.20 × VolFit + 0.20 × Execution
//
// Tuned for DEBIT SPREADS (v1 strategy family):
//  • Call debit spread = bullish direction
//  • Put debit spread  = bearish direction
//
// Ranges: each sub-score starts at 50 and is pushed up or down
// by weighted signals. Final clamped to [0, 100].
// ============================================================

import type {
  UWNetPremiumTick,
  UWOptionsFlowItem,
  UWGexData,
  UWVolatilityData,
  UWContractCandidate,
  UWDarkPoolLevel,
  OptionsScoreBreakdown,
  OptionDirection,
} from './types';

function clamp(v: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(v)));
}

// ============================================================
// 1. FLOW SCORE
// Answers: is there meaningful directional conviction from options flow?
// ============================================================
export function calculateFlowScore(
  direction: OptionDirection,
  netPremium: UWNetPremiumTick | null,
  recentFlow: UWOptionsFlowItem[],
): { score: number; detail: Record<string, number> } {
  let score = 50;
  const detail: Record<string, number> = {};

  if (!netPremium && recentFlow.length === 0) {
    return { score: 45, detail: { noData: -5 } };
  }

  // --- Net premium bias ----------------------------------------
  if (netPremium) {
    const total = netPremium.callPremium + netPremium.putPremium;
    const callRatio = total > 0 ? netPremium.callPremium / total : 0.5;

    if (direction === 'bullish') {
      if (callRatio >= 0.65) { score += 15; detail.netPremiumStrong = 15; }
      else if (callRatio >= 0.55) { score += 8; detail.netPremiumMild = 8; }
      else if (callRatio < 0.40) { score -= 12; detail.netPremiumAgainst = -12; }
    } else {
      const putRatio = 1 - callRatio;
      if (putRatio >= 0.65) { score += 15; detail.netPremiumStrong = 15; }
      else if (putRatio >= 0.55) { score += 8; detail.netPremiumMild = 8; }
      else if (putRatio < 0.40) { score -= 12; detail.netPremiumAgainst = -12; }
    }
  }

  // --- Recent unusual flow ------------------------------------
  const unusualFlows = recentFlow.filter(f => f.isUnusual);
  const directionType = direction === 'bullish' ? 'call' : 'put';
  const alignedUnusual = unusualFlows.filter(f => f.optionType === directionType);
  const oppositeUnusual = unusualFlows.filter(f => f.optionType !== directionType);

  if (alignedUnusual.length >= 3) { score += 18; detail.strongUnusualFlow = 18; }
  else if (alignedUnusual.length >= 1) { score += 10; detail.unusualFlow = 10; }

  if (oppositeUnusual.length >= 2) { score -= 8; detail.oppositeUnusualFlow = -8; }

  // --- Sweep vs block quality ---------------------------------
  const sweeps = alignedUnusual.filter(f => f.flowType === 'sweep');
  const blocks = alignedUnusual.filter(f => f.flowType === 'block');

  if (sweeps.length >= 2) { score += 8; detail.multiSweep = 8; }
  else if (sweeps.length === 1) { score += 4; detail.singleSweep = 4; }
  if (blocks.length >= 1) { score += 6; detail.blockOrder = 6; }

  // --- Premium size vs normal (ask-side = aggressive) --------
  const askSide = alignedUnusual.filter(f => f.side === 'ask');
  if (askSide.length >= 2) { score += 8; detail.askSideAggression = 8; }
  else if (askSide.length === 1) { score += 4; detail.askSideModerate = 4; }

  // --- Volume concentration check ----------------------------
  const totalAligned = recentFlow.filter(f => f.optionType === directionType).length;
  const totalOpposite = recentFlow.filter(f => f.optionType !== directionType).length;
  if (totalAligned > 0 && totalOpposite > 0) {
    const concentration = totalAligned / (totalAligned + totalOpposite);
    if (concentration >= 0.70) { score += 6; detail.flowConcentration = 6; }
    else if (concentration < 0.45) { score -= 6; detail.flowDivergence = -6; }
  }

  return { score: clamp(score), detail };
}

// ============================================================
// 2. STRUCTURE SCORE
// Answers: does the price/GEX environment support the move?
// ============================================================
export function calculateStructureScore(
  direction: OptionDirection,
  gex: UWGexData | null,
  darkPoolLevels: UWDarkPoolLevel[],
): { score: number; detail: Record<string, number> } {
  let score = 50;
  const detail: Record<string, number> = {};

  if (!gex && darkPoolLevels.length === 0) {
    return { score: 45, detail: { noData: -5 } };
  }

  if (gex) {
    // --- GEX regime context -----------------------------------
    // Negative GEX = dealers short gamma = trending environment (good for debit spreads)
    // Positive GEX = dealers long gamma = pinning/dampened moves (bad for debit spreads)
    if (gex.gexBias === 'negative') {
      score += 14;
      detail.negativeGex = 14; // trending regime, debit spreads work well
    } else if (gex.gexBias === 'neutral') {
      score += 2;
      detail.neutralGex = 2;
    } else {
      score -= 10;
      detail.positiveGex = -10; // positive GEX dampens moves
    }

    // --- Distance to nearest major GEX wall ------------------
    // Being far from a major GEX wall means less pin risk
    const nearestWall = gex.keyStrikes
      .filter(s => {
        if (direction === 'bullish') return s.strike > gex.spotPrice;
        return s.strike < gex.spotPrice;
      })
      .sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct))[0];

    if (nearestWall) {
      if (Math.abs(nearestWall.distancePct) >= 5) { score += 10; detail.clearPath = 10; }
      else if (Math.abs(nearestWall.distancePct) >= 2.5) { score += 4; detail.moderatePath = 4; }
      else { score -= 8; detail.nearGexWall = -8; } // wall is close, likely to pin
    }

    // --- Max pain context ------------------------------------
    // If price is already near max pain, move is less likely
    const maxPainDistPct = ((gex.spotPrice - gex.maxPainStrike) / gex.spotPrice) * 100;
    if (direction === 'bullish' && maxPainDistPct < -2) { score -= 6; detail.priceAboveMaxPain = -6; }
    if (direction === 'bearish' && maxPainDistPct > 2) { score -= 6; detail.priceBelowMaxPain = -6; }
  }

  // --- Dark pool support/resistance context -----------------
  if (darkPoolLevels.length > 0) {
    const nearLevels = darkPoolLevels.filter(d => Math.abs(d.distancePct) <= 3);

    // Dark pool below price = support (good for bullish)
    // Dark pool above price = resistance (bad for bullish, good for bearish)
    const supportLevels = nearLevels.filter(d => d.side === 'below');
    const resistanceLevels = nearLevels.filter(d => d.side === 'above');

    if (direction === 'bullish') {
      if (supportLevels.length >= 1) { score += 8; detail.darkPoolSupport = 8; }
      if (resistanceLevels.length >= 1) { score -= 5; detail.darkPoolResistance = -5; }
    } else {
      if (resistanceLevels.length >= 1) { score += 8; detail.darkPoolResistance = 8; }
      if (supportLevels.length >= 1) { score -= 5; detail.darkPoolSupport = -5; }
    }
  }

  return { score: clamp(score), detail };
}

// ============================================================
// 3. VOLATILITY FIT SCORE
// Answers: is it a good time to BUY a debit spread (premium must be cheap enough)?
// Debit spreads benefit from low/normal IV. High IV = expensive premium.
// ============================================================
export function calculateVolatilityFitScore(
  volData: UWVolatilityData | null,
): { score: number; detail: Record<string, number> } {
  let score = 50;
  const detail: Record<string, number> = {};

  if (!volData) {
    return { score: 50, detail: { noData: 0 } };
  }

  // --- IV Rank (primary signal for debit spreads) -----------
  // Low IV rank = cheap premium = ideal for buying debit spreads
  if (volData.ivRank <= 20) {
    score += 25; detail.veryLowIvRank = 25;
  } else if (volData.ivRank <= 35) {
    score += 16; detail.lowIvRank = 16;
  } else if (volData.ivRank <= 50) {
    score += 6; detail.normalIvRank = 6;
  } else if (volData.ivRank <= 65) {
    score -= 10; detail.elevatedIvRank = -10;
  } else {
    score -= 22; detail.highIvRank = -22; // expensive premium, debit spread value erodes fast
  }

  // --- IV Percentile secondary confirmation -----------------
  if (volData.ivPercentile <= 25) { score += 8; detail.lowIvPercentile = 8; }
  else if (volData.ivPercentile >= 75) { score -= 8; detail.highIvPercentile = -8; }

  // --- Term structure ----------------------------------------
  // Contango (future IV > near IV) = normal; fine for 21-35 DTE spreads
  // Backwardation = elevated near-term risk / event risk; penalize
  if (volData.termStructure === 'contango') { score += 5; detail.contango = 5; }
  else if (volData.termStructure === 'backwardation') { score -= 12; detail.backwardation = -12; }

  return { score: clamp(score), detail };
}

// ============================================================
// 4. EXECUTION QUALITY SCORE
// Answers: is this specific spread expression worth trading?
// ============================================================
export function calculateExecutionQualityScore(
  longLeg: UWContractCandidate | null,
  shortLeg: UWContractCandidate | null,
): { score: number; detail: Record<string, number> } {
  let score = 50;
  const detail: Record<string, number> = {};

  if (!longLeg || !shortLeg) {
    return { score: 40, detail: { noContracts: -10 } };
  }

  // --- Bid-ask spread quality on long leg -------------------
  const longSpreadPct = longLeg.ask > 0
    ? ((longLeg.ask - longLeg.bid) / longLeg.ask) * 100
    : 100;

  if (longSpreadPct <= 3) { score += 15; detail.tightLongSpread = 15; }
  else if (longSpreadPct <= 7) { score += 8; detail.okLongSpread = 8; }
  else if (longSpreadPct <= 15) { score -= 5; detail.wideLongSpread = -5; }
  else { score -= 18; detail.veryWideLongSpread = -18; }

  // --- Open interest (liquidity proxy) ----------------------
  const minOI = Math.min(longLeg.openInterest, shortLeg.openInterest);

  if (minOI >= 1000) { score += 12; detail.highOI = 12; }
  else if (minOI >= 500) { score += 7; detail.goodOI = 7; }
  else if (minOI >= 100) { score += 2; detail.fairOI = 2; }
  else { score -= 15; detail.lowOI = -15; }

  // --- Volume / OI ratio (freshness) -------------------------
  const longVolOI = longLeg.openInterest > 0
    ? longLeg.volume / longLeg.openInterest
    : 0;

  if (longVolOI >= 0.3) { score += 8; detail.freshInterest = 8; }
  else if (longVolOI >= 0.1) { score += 3; detail.moderateInterest = 3; }

  // --- Delta quality for long leg (debit spreads) -----------
  // Ideal: 0.40-0.60 delta on long leg (ATM to slightly ITM)
  const longDelta = Math.abs(longLeg.delta);
  if (longDelta >= 0.40 && longDelta <= 0.60) { score += 10; detail.idealDelta = 10; }
  else if (longDelta >= 0.30 && longDelta < 0.40) { score += 4; detail.slightlyOtmDelta = 4; }
  else if (longDelta < 0.25) { score -= 10; detail.tooFarOtm = -10; }

  // --- Spread risk/reward validity --------------------------
  const netDebit = longLeg.ask - shortLeg.bid;
  const strikeWidth = Math.abs(longLeg.strike - shortLeg.strike);
  if (strikeWidth > 0) {
    const rrRatio = (strikeWidth - netDebit) / netDebit;
    if (rrRatio >= 1.5) { score += 10; detail.goodRR = 10; }
    else if (rrRatio >= 0.8) { score += 4; detail.okRR = 4; }
    else { score -= 12; detail.poorRR = -12; } // paying too much for the spread
  }

  return { score: clamp(score), detail };
}

// ============================================================
// FINAL: calculateOptionsScore
// Combines all four sub-scores with defined weights
// ============================================================
export function calculateOptionsScore(params: {
  direction: OptionDirection;
  netPremium: UWNetPremiumTick | null;
  recentFlow: UWOptionsFlowItem[];
  gex: UWGexData | null;
  darkPoolLevels: UWDarkPoolLevel[];
  volData: UWVolatilityData | null;
  longLeg: UWContractCandidate | null;
  shortLeg: UWContractCandidate | null;
}): OptionsScoreBreakdown {
  const { direction, netPremium, recentFlow, gex, darkPoolLevels, volData, longLeg, shortLeg } = params;

  const flow = calculateFlowScore(direction, netPremium, recentFlow);
  const structure = calculateStructureScore(direction, gex, darkPoolLevels);
  const volatility = calculateVolatilityFitScore(volData);
  const execution = calculateExecutionQualityScore(longLeg, shortLeg);

  const finalScore = clamp(
    Math.round(
      flow.score * 0.35 +
      structure.score * 0.25 +
      volatility.score * 0.20 +
      execution.score * 0.20
    )
  );

  return {
    flowScore: flow.score,
    structureScore: structure.score,
    volatilityFitScore: volatility.score,
    executionQualityScore: execution.score,
    finalScore,
    flowDetail: flow.detail,
    structureDetail: structure.detail,
    volatilityDetail: volatility.detail,
    executionDetail: execution.detail,
  };
}

// ============================================================
// HELPERS — used by the opportunity builder
// ============================================================

export function deriveLiquidityQuality(executionScore: number): import('./types').LiquidityQuality {
  if (executionScore >= 75) return 'excellent';
  if (executionScore >= 60) return 'good';
  if (executionScore >= 45) return 'fair';
  return 'poor';
}

export function deriveFlowSummary(
  direction: OptionDirection,
  flowScore: number,
  detail: Record<string, number>,
): string {
  const strong = flowScore >= 75;
  const moderate = flowScore >= 60;
  const dir = direction === 'bullish' ? 'call' : 'put';
  const hasUnusual = 'unusualFlow' in detail || 'strongUnusualFlow' in detail;
  const hasSweep = 'multiSweep' in detail || 'singleSweep' in detail;

  if (strong && hasUnusual && hasSweep) return `Strong ${dir} sweep activity with concentrated premium`;
  if (strong && hasUnusual) return `Unusual ${dir} flow with high premium concentration`;
  if (moderate) return `Moderate ${dir} bias in net premium`;
  if (flowScore < 45) return `Weak or conflicting options flow — reduced conviction`;
  return `Mixed flow with slight ${dir} lean`;
}

export function deriveStructureSummary(
  direction: OptionDirection,
  structureScore: number,
  gex: UWGexData | null,
): string {
  if (!gex) return 'Structure data unavailable';
  const dir = direction === 'bullish' ? 'upside' : 'downside';

  if (gex.gexBias === 'negative' && structureScore >= 65)
    return `Negative GEX supports ${dir} trending moves`;
  if (gex.gexBias === 'positive')
    return `Positive GEX may dampen ${dir} moves — pin risk present`;
  if (structureScore >= 60)
    return `Structure supports ${dir} with dark pool confluence`;
  return `Neutral structure — ${dir} move not confirmed by GEX`;
}

export function deriveInvalidationCondition(
  direction: OptionDirection,
  gex: UWGexData | null,
  longStrike: number,
): string {
  const dir = direction === 'bullish' ? 'below' : 'above';
  if (gex?.keyStrikes?.length) {
    const opposite = direction === 'bullish'
      ? gex.keyStrikes.filter(s => s.strike < longStrike).sort((a, b) => b.strike - a.strike)[0]
      : gex.keyStrikes.filter(s => s.strike > longStrike).sort((a, b) => a.strike - b.strike)[0];
    if (opposite) return `Invalidated if price moves ${dir} $${opposite.strike.toFixed(0)} (key GEX level)`;
  }
  return `Invalidated if price moves ${dir} the long strike at $${longStrike.toFixed(0)}`;
}
