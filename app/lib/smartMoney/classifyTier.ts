import type {
  CtsAlignment,
  TierClassificationResult,
} from '@/app/lib/smartMoney/types';

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export function classifyTier(
  ctsScore: number,
  smartMoneyScore: number,
  alignment: CtsAlignment,
  finalConviction: number,
): TierClassificationResult {
  const tier1CtsThreshold = envNumber('SMART_MONEY_TIER1_CTS_THRESHOLD', 65);
  const tier1SmsThreshold = envNumber('SMART_MONEY_TIER1_SMS_THRESHOLD', 75);
  const tier2SmsThreshold = envNumber('SMART_MONEY_TIER2_SMS_THRESHOLD', 70);
  const tier2ConvictionThreshold = envNumber(
    'SMART_MONEY_TIER2_CONVICTION_THRESHOLD',
    72,
  );

  const alignmentBullish =
    alignment === 'bullish_confirmed' || alignment === 'bullish_timing_weak';

  if (
    ctsScore >= tier1CtsThreshold &&
    smartMoneyScore >= tier1SmsThreshold &&
    alignmentBullish
  ) {
    return {
      tier: 'tier_1',
      reason: 'Strong technical trend and institutional confirmation.',
      isAutoTradingEligible: true,
    };
  }

  if (
    smartMoneyScore >= tier2SmsThreshold ||
    finalConviction >= tier2ConvictionThreshold
  ) {
    return {
      tier: 'tier_2',
      reason: 'Signal cluster is developing but not fully confirmed for auto mode.',
      isAutoTradingEligible: false,
    };
  }

  return {
    tier: 'tier_3',
    reason: 'Informational only; wait for stronger technical and smart money alignment.',
    isAutoTradingEligible: false,
  };
}
