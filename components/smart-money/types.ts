export type SmartMoneyTier = 'tier_1' | 'tier_2' | 'tier_3';

export type SmartMoneyDashboardItem = {
  symbol: string;
  ctsScore: number;
  alignment: string;
  smartMoneyScore: number;
  finalConviction: number;
  tier: SmartMoneyTier;
  tierReason: string;
  isAutoTradingEligible: boolean;
  breakdown: {
    optionsFlowScore: number;
    darkPoolProxyScore: number;
    structureScore: number;
    volatilityScore: number;
    availabilityFactor: number;
    activeSourceCount: number;
    activeWeightSum: number;
    weightedRawScore: number;
  };
  signals: {
    optionsFlow: string[];
    darkPoolProxy: string[];
    volatility: string[];
    structure: string[];
  };
  dataAvailability: {
    hasFlow: boolean;
    hasNetPremium: boolean;
    hasGex: boolean;
    hasIv: boolean;
  };
  ctsMeta: {
    dailyCTS: number;
    intradayCTS: number;
  };
  aiNarrative: string;
  aiConfidence: number;
  generatedAt: string;
};

export type SmartMoneyDashboardResponse = {
  items: SmartMoneyDashboardItem[];
  count: number;
  filters: {
    limit: number;
    minCts: number;
    minSms: number;
    tier: SmartMoneyTier | null;
  };
  tierCounts: {
    tier_1: number;
    tier_2: number;
    tier_3: number;
  };
  generatedAt: string;
};
