import type { SmartMoneyTier } from '@/app/lib/smartMoney/types';

type NarrativeInput = {
  symbol: string;
  ctsScore: number;
  smartMoneyScore: number;
  finalConviction: number;
  tier: SmartMoneyTier;
  alignment: string;
};

function tierLabel(tier: SmartMoneyTier): string {
  if (tier === 'tier_1') return 'Tier 1';
  if (tier === 'tier_2') return 'Tier 2';
  return 'Tier 3';
}

export function createSmartMoneyNarrative(input: NarrativeInput): {
  aiNarrative: string;
  aiConfidence: number;
} {
  const confidence = Math.max(
    50,
    Math.min(95, Math.round(input.finalConviction * 0.9 + 15)),
  );

  const thesis =
    input.tier === 'tier_1'
      ? 'institutional and technical signals are aligned for auto-trading consideration'
      : input.tier === 'tier_2'
        ? 'smart money interest is present, but technical confirmation is still developing'
        : 'current flow and technical alignment are not yet strong enough for action';

  const aiNarrative = `${input.symbol} is ${tierLabel(input.tier)} with CTS ${Math.round(
    input.ctsScore,
  )} and Smart Money ${Math.round(input.smartMoneyScore)}. Final conviction is ${Math.round(
    input.finalConviction,
  )}, and alignment is ${input.alignment}. Overall, ${thesis}.`;

  return {
    aiNarrative,
    aiConfidence: confidence,
  };
}
