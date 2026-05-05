// ============================================================
// Luckmi Options — core type definitions
// All scoring, UI, and engine components reference these types.
// ============================================================

// ----- Enums / Unions ----------------------------------------

export type OptionDirection = 'bullish' | 'bearish';
export type StrategyFamily = 'call_debit_spread' | 'put_debit_spread' | 'long_call' | 'long_put';
export type DteBucket = '7-14' | '14-21' | '21-35' | '35-60';
export type PremiumBudget = 'low' | 'medium' | 'high';
export type RiskProfile = 'conservative' | 'balanced' | 'aggressive';
export type FlowType = 'sweep' | 'block' | 'split' | 'mixed';
export type GexBias = 'positive' | 'negative' | 'neutral';
export type LiquidityQuality = 'excellent' | 'good' | 'fair' | 'poor';
export type OpportunityStatus = 'active' | 'queued' | 'traded' | 'expired' | 'dismissed';

// ----- Raw UW data shapes ------------------------------------
// These are what we receive from Unusual Whales endpoints.
// When UW key is live, real responses are normalized into these shapes.

export type UWOptionsFlowItem = {
  symbol: string;
  expiry: string;
  strike: number;
  optionType: 'call' | 'put';
  premium: number;
  size: number;
  openInterest: number;
  impliedVolatility: number;
  flowType: FlowType;
  isUnusual: boolean;
  side: 'ask' | 'bid' | 'mid';
  timestamp: string;
};

export type UWNetPremiumTick = {
  symbol: string;
  callPremium: number;   // cumulative net call premium today
  putPremium: number;    // cumulative net put premium today
  netBias: number;       // callPremium - putPremium (positive = bullish)
  timestamp: string;
};

export type UWGexData = {
  symbol: string;
  totalGex: number;
  spotPrice: number;
  gexBias: GexBias;
  keyStrikes: Array<{
    strike: number;
    gexValue: number;
    distancePct: number;
  }>;
  maxPainStrike: number;
  highestGexStrike: number;
};

export type UWVolatilityData = {
  symbol: string;
  ivRank: number;          // 0-100; rank of current IV vs trailing 52w
  ivPercentile: number;    // 0-100
  atmIv: number;           // current ATM IV decimal (0.30 = 30%)
  termStructure: 'contango' | 'backwardation' | 'flat';
};

export type UWContractCandidate = {
  symbol: string;
  expiry: string;
  strike: number;
  optionType: 'call' | 'put';
  bid: number;
  ask: number;
  mid: number;
  openInterest: number;
  volume: number;
  impliedVolatility: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
};

export type UWDarkPoolLevel = {
  symbol: string;
  price: number;
  volume: number;
  distancePct: number; // distance from current price as %
  side: 'above' | 'below';
};

// ----- Scoring sub-scores ------------------------------------

export type OptionsScoreBreakdown = {
  // Raw sub-scores 0-100
  flowScore: number;
  structureScore: number;
  volatilityFitScore: number;
  executionQualityScore: number;

  // Final weighted score 0-100
  finalScore: number;

  // Human-readable detail per component
  flowDetail: Record<string, number>;
  structureDetail: Record<string, number>;
  volatilityDetail: Record<string, number>;
  executionDetail: Record<string, number>;
};

// ----- Spread leg definition ---------------------------------

export type SpreadLeg = {
  action: 'buy' | 'sell';
  optionType: 'call' | 'put';
  strike: number;
  expiry: string;
  mid?: number;          // midpoint price of this leg
  delta?: number;
};

// ----- The core Opportunity object --------------------------

export type OptionsOpportunity = {
  id: string;
  symbol: string;
  direction: OptionDirection;
  strategy: StrategyFamily;

  // Score
  score: OptionsScoreBreakdown;

  // Recommended spread (shortLeg is absent for long_call / long_put strategies)
  longLeg: SpreadLeg;
  shortLeg?: SpreadLeg;
  dteBucket: DteBucket;
  netDebit: number;         // total cost to enter: spread debit or single-leg premium
  maxGain: number;          // strike width minus debit (spreads) or theoretical cap (long options)
  maxLoss: number;          // net debit (max you can lose)
  breakeven: number;        // long strike + debit (calls) or long strike - debit (puts)

  // Risk
  riskRewardRatio: number;  // maxGain / maxLoss
  suggestedContracts?: number;

  // Intelligence
  thesis: string;           // one-line summary (deterministic)
  aiReason?: string;        // GPT explanation (populated async)
  aiAction?: string;        // GPT: 'Enter' | 'Watch' | 'Avoid'
  aiConfidence?: number;    // 0-100
  aiRiskFlags?: string[];   // GPT-identified risks

  // Invalidation
  invalidationCondition: string;   // e.g. "loss of $X support"
  profitTarget: number;            // 50-65% of max gain for debit spreads
  stopLoss: number;                // 50% of net debit

  // Signals summary
  flowSummary: string;
  structureSummary: string;
  ivRank: number;
  gexBias: GexBias;
  liquidityQuality: LiquidityQuality;

  // Lifecycle
  status: OpportunityStatus;
  createdAt: string;
  expiresAt: string;   // opportunity is stale after this
};

// ----- User queue / slots -----------------------------------

export type UserOptionSlot = {
  id: string;
  userId: string;
  opportunityId: string;
  opportunity?: OptionsOpportunity;
  mode: 'user_selected' | 'ai_selected';
  status: 'pending' | 'entered' | 'closed' | 'expired';
  enteredAt?: string;
  closedAt?: string;
  pnl?: number;
  pnlPercent?: number;
};

// ----- User auto-options policy -----------------------------

export type UserOptionPolicy = {
  userId: string;
  maxActiveSlots: number;          // subscription-gated: 1, 3, 5, 10
  autoMode: 'user_curated' | 'ai_curated' | 'hybrid';
  maxRiskPerTrade: number;         // dollar amount
  maxDailyRisk: number;            // dollar amount
  allowedStrategies: StrategyFamily[];
  allowedDteBuckets: DteBucket[];
  minScore: number;                // minimum OCS to trade (default 70)
  minFlowScore: number;            // minimum flow sub-score (default 55)
  maxIvRank: number;               // max IV rank to buy debit spreads (default 45)
  avoidEarnings: boolean;
  brokerMode: 'paper' | 'live';
  direction: 'bullish_only' | 'bearish_only' | 'both';
};

// ----- Market context snapshot ------------------------------

export type OptionsMarketContext = {
  regime: 'trending_up' | 'trending_down' | 'choppy' | 'squeeze' | 'mean_reversion';
  flowBalance: number;      // -100 to +100; positive = overall bullish flow dominance
  ivEnvironment: 'low' | 'normal' | 'elevated' | 'high';
  topBullishSymbols: string[];
  topBearishSymbols: string[];
  updatedAt: string;
};
