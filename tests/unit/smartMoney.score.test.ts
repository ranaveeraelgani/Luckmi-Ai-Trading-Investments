import { describe, expect, it } from 'vitest';
import {
  calculateAvailabilityFactor,
  calculateFinalConviction,
  calculateSmartMoneyScore,
} from '@/app/lib/smartMoney/calculateSmartMoneyScore';

describe('smart money scoring', () => {
  it('applies availability factor tiers correctly', () => {
    expect(calculateAvailabilityFactor(1)).toBe(0.6);
    expect(calculateAvailabilityFactor(2)).toBe(0.75);
    expect(calculateAvailabilityFactor(3)).toBe(1.0);
    expect(calculateAvailabilityFactor(4)).toBe(1.0);
  });

  it('calculates final conviction with bullish alignment boost', () => {
    const value = calculateFinalConviction(70, 80, 'bullish_confirmed');
    expect(value).toBeGreaterThanOrEqual(72);
  });

  it('returns bounded smart money score and breakdown data', () => {
    const result = calculateSmartMoneyScore({
      symbol: 'NVDA',
      flow: [
        {
          symbol: 'NVDA',
          expiry: '2026-06-19',
          strike: 900,
          optionType: 'call',
          premium: 2_500_000,
          size: 1000,
          openInterest: 2000,
          impliedVolatility: 0.35,
          flowType: 'sweep',
          isUnusual: true,
          side: 'ask',
          timestamp: new Date().toISOString(),
        },
      ],
      netPremium: {
        symbol: 'NVDA',
        callPremium: 3_000_000,
        putPremium: 500_000,
        netBias: 2_500_000,
        timestamp: new Date().toISOString(),
      },
      gex: {
        symbol: 'NVDA',
        totalGex: -850_000_000,
        spotPrice: 900,
        gexBias: 'negative',
        keyStrikes: [{ strike: 900, gexValue: -250_000_000, distancePct: 0.2 }],
        maxPainStrike: 890,
        highestGexStrike: 900,
      },
      iv: {
        symbol: 'NVDA',
        ivRank: 30,
        ivPercentile: 25,
        atmIv: 0.32,
        termStructure: 'contango',
      },
      ctsScore: 74,
      alignment: 'bullish_confirmed',
    });

    expect(result.smartMoneyScore).toBeGreaterThanOrEqual(0);
    expect(result.smartMoneyScore).toBeLessThanOrEqual(100);
    expect(result.breakdown.activeWeightSum).toBeGreaterThan(0);
    expect(result.signals.optionsFlow.length).toBeGreaterThan(0);
  });
});
