import type {
  UWGexData,
  UWNetPremiumTick,
  UWOptionsFlowItem,
  UWVolatilityData,
} from '@/app/lib/options/types';
import type {
  CtsAlignment,
  SmartMoneyScoreBreakdown,
  SmartMoneyScoreInput,
  SmartMoneyScoreResult,
  SmartMoneySignals,
} from '@/app/lib/smartMoney/types';

const WEIGHTS = {
  optionsFlow: 0.35,
  darkPoolProxy: 0.25,
  structure: 0.20,
  volatility: 0.20,
} as const;

const ALIGNMENT_ADJUSTMENT: Record<CtsAlignment, number> = {
  bullish_confirmed: 5,
  bullish_timing_weak: 2,
  mixed: 0,
  countertrend_bounce: -2,
  bearish_confirmed: -5,
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function calculateFlowScore(
  flow: UWOptionsFlowItem[] | null,
  netPremium: UWNetPremiumTick | null,
): number {
  if (!flow || flow.length === 0) return 35;

  let callPremium = 0;
  let putPremium = 0;
  let unusualCount = 0;
  let askSidePremium = 0;

  for (const item of flow) {
    const premium = Math.max(0, safeNumber(item.premium));
    if (item.optionType === 'call') callPremium += premium;
    if (item.optionType === 'put') putPremium += premium;
    if (item.isUnusual) unusualCount += 1;
    if (item.side === 'ask') askSidePremium += premium;
  }

  const totalPremium = callPremium + putPremium;
  const callShare = totalPremium > 0 ? callPremium / totalPremium : 0.5;
  const unusualRatio = flow.length > 0 ? unusualCount / flow.length : 0;
  const askShare = totalPremium > 0 ? askSidePremium / totalPremium : 0.5;

  const normalizedNetBias = netPremium
    ? clamp((safeNumber(netPremium.netBias) / 2_500_000) * 50 + 50)
    : 50;

  const directional = clamp(callShare * 100);
  const unusualStrength = clamp(unusualRatio * 100);
  const aggressor = clamp(askShare * 100);

  const score =
    directional * 0.35 +
    unusualStrength * 0.20 +
    aggressor * 0.20 +
    normalizedNetBias * 0.25;

  return Number(clamp(score).toFixed(2));
}

export function calculateDarkPoolProxyScore(gex: UWGexData | null): number {
  if (!gex) return 45;

  const totalGex = safeNumber(gex.totalGex);
  const biasComponent =
    gex.gexBias === 'negative' ? 80 : gex.gexBias === 'positive' ? 45 : 55;
  const magnitude = clamp((Math.abs(totalGex) / 1_000_000_000) * 100);

  const keyStrikes = Array.isArray(gex.keyStrikes) ? gex.keyStrikes : [];
  const concentration = keyStrikes.length
    ? clamp(
        keyStrikes
          .slice(0, 3)
          .reduce((acc, row) => acc + Math.abs(safeNumber(row.gexValue)), 0) /
          50_000_000,
      )
    : 35;

  const score = biasComponent * 0.5 + magnitude * 0.3 + concentration * 0.2;
  return Number(clamp(score).toFixed(2));
}

export function calculateStructureScore(
  ctsScore: number,
  alignment: CtsAlignment,
): number {
  const ctsBase = clamp(safeNumber(ctsScore));
  const alignmentBoost =
    alignment === 'bullish_confirmed'
      ? 10
      : alignment === 'bullish_timing_weak'
        ? 4
        : alignment === 'countertrend_bounce'
          ? -6
          : alignment === 'bearish_confirmed'
            ? -12
            : 0;

  return Number(clamp(ctsBase + alignmentBoost).toFixed(2));
}

export function calculateVolatilityScore(iv: UWVolatilityData | null): number {
  if (!iv) return 50;

  const ivRank = clamp(safeNumber(iv.ivRank));
  const termBoost =
    iv.termStructure === 'contango'
      ? 10
      : iv.termStructure === 'flat'
        ? 3
        : -6;

  // Favor low-to-mid IV rank for cleaner entries.
  const ivFit = clamp(100 - Math.abs(ivRank - 35) * 2);
  const score = ivFit * 0.75 + (50 + termBoost) * 0.25;
  return Number(clamp(score).toFixed(2));
}

export function calculateAvailabilityFactor(activeSourceCount: number): number {
  if (activeSourceCount <= 1) return 0.6;
  if (activeSourceCount === 2) return 0.75;
  return 1.0;
}

export function calculateFinalConviction(
  ctsScore: number,
  smartMoneyScore: number,
  alignment: CtsAlignment,
): number {
  const score =
    safeNumber(ctsScore) * 0.55 +
    safeNumber(smartMoneyScore) * 0.45 +
    ALIGNMENT_ADJUSTMENT[alignment];
  return Number(clamp(score).toFixed(2));
}

export function extractSignals(input: SmartMoneyScoreInput): SmartMoneySignals {
  const flowSignals: string[] = [];
  const darkPoolSignals: string[] = [];
  const volatilitySignals: string[] = [];
  const structureSignals: string[] = [];

  const flow = input.flow ?? [];
  if (flow.length > 0) {
    const unusual = flow.filter((f) => f.isUnusual).length;
    const callPremium = flow
      .filter((f) => f.optionType === 'call')
      .reduce((acc, item) => acc + safeNumber(item.premium), 0);
    const putPremium = flow
      .filter((f) => f.optionType === 'put')
      .reduce((acc, item) => acc + safeNumber(item.premium), 0);

    flowSignals.push(`Flow prints: ${flow.length}`);
    flowSignals.push(`Unusual prints: ${unusual}`);

    if (callPremium > putPremium) {
      flowSignals.push('Call premium dominates put premium');
    } else if (putPremium > callPremium) {
      flowSignals.push('Put premium dominates call premium');
    } else {
      flowSignals.push('Call/put premium balance is neutral');
    }
  } else {
    flowSignals.push('No recent options flow prints available');
  }

  const netBias = safeNumber(input.netPremium?.netBias, 0);
  if (netBias > 0) flowSignals.push('Net premium bias is bullish');
  if (netBias < 0) flowSignals.push('Net premium bias is bearish');

  if (input.gex) {
    darkPoolSignals.push(`GEX bias: ${input.gex.gexBias}`);
    darkPoolSignals.push(`Total GEX: ${Math.round(safeNumber(input.gex.totalGex))}`);
    const strongest = input.gex.keyStrikes?.[0];
    if (strongest?.strike) {
      darkPoolSignals.push(`Highest GEX strike: ${strongest.strike}`);
    }
  } else {
    darkPoolSignals.push('No GEX proxy data available');
  }

  if (input.iv) {
    volatilitySignals.push(`IV rank: ${Math.round(safeNumber(input.iv.ivRank))}`);
    volatilitySignals.push(`Term structure: ${input.iv.termStructure}`);
    volatilitySignals.push(`ATM IV: ${(safeNumber(input.iv.atmIv) * 100).toFixed(1)}%`);
  } else {
    volatilitySignals.push('No IV structure data available');
  }

  structureSignals.push(`CTS score: ${Math.round(safeNumber(input.ctsScore))}`);
  structureSignals.push(`Alignment: ${input.alignment}`);

  return {
    optionsFlow: flowSignals,
    darkPoolProxy: darkPoolSignals,
    volatility: volatilitySignals,
    structure: structureSignals,
  };
}

export function calculateSmartMoneyScore(
  input: SmartMoneyScoreInput,
): SmartMoneyScoreResult {
  const optionsFlowScore = calculateFlowScore(input.flow, input.netPremium);
  const darkPoolProxyScore = calculateDarkPoolProxyScore(input.gex);
  const structureScore = calculateStructureScore(input.ctsScore, input.alignment);
  const volatilityScore = calculateVolatilityScore(input.iv);

  const hasFlow = Array.isArray(input.flow);
  const hasGex = Boolean(input.gex);
  const hasIv = Boolean(input.iv);
  const hasNetPremium = Boolean(input.netPremium);

  const active = {
    optionsFlow: hasFlow || hasNetPremium,
    darkPoolProxy: hasGex,
    structure: true,
    volatility: hasIv,
  };

  const activeWeightSum =
    (active.optionsFlow ? WEIGHTS.optionsFlow : 0) +
    (active.darkPoolProxy ? WEIGHTS.darkPoolProxy : 0) +
    (active.structure ? WEIGHTS.structure : 0) +
    (active.volatility ? WEIGHTS.volatility : 0);

  const weightedNumerator =
    (active.optionsFlow ? optionsFlowScore * WEIGHTS.optionsFlow : 0) +
    (active.darkPoolProxy ? darkPoolProxyScore * WEIGHTS.darkPoolProxy : 0) +
    (active.structure ? structureScore * WEIGHTS.structure : 0) +
    (active.volatility ? volatilityScore * WEIGHTS.volatility : 0);

  const weightedRawScore =
    activeWeightSum > 0 ? weightedNumerator / activeWeightSum : 0;

  const activeSourceCount = [
    active.optionsFlow,
    active.darkPoolProxy,
    active.volatility,
  ].filter(Boolean).length;

  const availabilityFactor = calculateAvailabilityFactor(activeSourceCount);
  const smartMoneyScore = Number(
    clamp(weightedRawScore * availabilityFactor).toFixed(2),
  );

  const finalConviction = calculateFinalConviction(
    input.ctsScore,
    smartMoneyScore,
    input.alignment,
  );

  const breakdown: SmartMoneyScoreBreakdown = {
    optionsFlowScore,
    darkPoolProxyScore,
    structureScore,
    volatilityScore,
    availabilityFactor,
    activeSourceCount,
    activeWeightSum: Number(activeWeightSum.toFixed(2)),
    weightedRawScore: Number(weightedRawScore.toFixed(2)),
  };

  return {
    symbol: input.symbol,
    smartMoneyScore,
    finalConviction,
    ctsScore: Number(clamp(input.ctsScore).toFixed(2)),
    alignment: input.alignment,
    breakdown,
    signals: extractSignals(input),
    dataAvailability: {
      hasFlow,
      hasNetPremium,
      hasGex,
      hasIv,
    },
    generatedAt: new Date().toISOString(),
  };
}
