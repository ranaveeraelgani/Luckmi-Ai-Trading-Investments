import type {
  UWGexData,
  UWNetPremiumTick,
  UWOptionsFlowItem,
  UWVolatilityData,
} from '@/app/lib/options/types';

export type CtsAlignment =
  | 'bullish_confirmed'
  | 'bullish_timing_weak'
  | 'mixed'
  | 'countertrend_bounce'
  | 'bearish_confirmed';

export type SmartMoneyTier = 'tier_1' | 'tier_2' | 'tier_3';

export type SmartMoneySignals = {
  optionsFlow: string[];
  darkPoolProxy: string[];
  volatility: string[];
  structure: string[];
};

export type SmartMoneyScoreInput = {
  symbol: string;
  flow: UWOptionsFlowItem[] | null;
  netPremium: UWNetPremiumTick | null;
  gex: UWGexData | null;
  iv: UWVolatilityData | null;
  ctsScore: number;
  alignment: CtsAlignment;
};

export type SmartMoneyScoreBreakdown = {
  optionsFlowScore: number;
  darkPoolProxyScore: number;
  structureScore: number;
  volatilityScore: number;
  availabilityFactor: number;
  activeSourceCount: number;
  activeWeightSum: number;
  weightedRawScore: number;
};

export type SmartMoneyScoreResult = {
  symbol: string;
  smartMoneyScore: number;
  finalConviction: number;
  ctsScore: number;
  alignment: CtsAlignment;
  breakdown: SmartMoneyScoreBreakdown;
  signals: SmartMoneySignals;
  dataAvailability: {
    hasFlow: boolean;
    hasNetPremium: boolean;
    hasGex: boolean;
    hasIv: boolean;
  };
  generatedAt: string;
};

export type SmartMoneySymbolInputs = {
  symbol: string;
  flow: UWOptionsFlowItem[] | null;
  netPremium: UWNetPremiumTick | null;
  gex: UWGexData | null;
  iv: UWVolatilityData | null;
  ctsScore: number;
  alignment: CtsAlignment;
  ctsMeta: {
    dailyCTS: number;
    intradayCTS: number;
  };
};

export type TierClassificationResult = {
  tier: SmartMoneyTier;
  reason: string;
  isAutoTradingEligible: boolean;
};
