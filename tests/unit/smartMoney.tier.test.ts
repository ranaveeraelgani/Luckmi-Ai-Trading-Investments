import { describe, expect, it } from 'vitest';
import { classifyTier } from '@/app/lib/smartMoney/classifyTier';

describe('smart money tier classification', () => {
  it('classifies tier 1 at configured boundary', () => {
    const result = classifyTier(65, 75, 'bullish_confirmed', 75);
    expect(result.tier).toBe('tier_1');
    expect(result.isAutoTradingEligible).toBe(true);
  });

  it('classifies tier 2 when conviction is high but tier 1 not met', () => {
    const result = classifyTier(58, 68, 'mixed', 73);
    expect(result.tier).toBe('tier_2');
    expect(result.isAutoTradingEligible).toBe(false);
  });

  it('classifies tier 3 for weak setups', () => {
    const result = classifyTier(45, 50, 'bearish_confirmed', 40);
    expect(result.tier).toBe('tier_3');
  });
});
