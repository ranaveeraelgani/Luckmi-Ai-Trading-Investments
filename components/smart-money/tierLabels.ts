import type { SmartMoneyTier } from '@/components/smart-money/types';

export function getTierLabel(tier: SmartMoneyTier): string {
  if (tier === 'tier_1') return 'Ready Now';
  if (tier === 'tier_2') return 'Watch Closely';
  return 'Not Ready Yet';
}

export function getTierSubLabel(tier: SmartMoneyTier): string {
  if (tier === 'tier_1') return 'Good for Auto Trading';
  if (tier === 'tier_2') return 'Track in Watchlist';
  return 'Needs more confirmation';
}
