# Smart Money Dashboard — Implementation Spec v1.0

**Date**: May 13, 2026  
**Status**: Ready for Phase 1 Implementation  
**Scope**: API endpoints, response schemas, UI component architecture, impact analysis

---

## 1. API ENDPOINT SPECIFICATION

### 1.1 GET /api/smart-money/dashboard

**Purpose**: Return ranked stocks sorted by Smart Money Score + technical alignment.

**Query Parameters**:
```typescript
{
  limit?: number;           // default: 20, max: 50
  minSmartMoneyScore?: number; // default: 60
  minCts?: number;          // default: 50
  tier?: 'all' | 'tier1' | 'tier2' | 'tier3'; // default: 'all'
  forceRefresh?: boolean;   // bypass cache
}
```

**Response (200 OK)**:
```typescript
{
  stocks: [
    {
      symbol: string;
      
      // Technical scores
      ctsScore: number;       // 20-95
      dailyCTS: number;       // 20-95
      intradayCTS: number;    // 20-95
      alignment: string;      // 'bullish_confirmed' | 'bullish_timing_weak' | 'bearish_confirmed' | 'mixed' | 'countertrend_bounce'
      
      // Smart Money sub-scores (now: 0-100)
      optionsFlowScore: number;
      darkPoolProxyScore: number; // GEX + structure
      structureScore: number;
      volatilityScore: number;
      
      // Smart Money Score (0-100, weighted by availability)
      smartMoneyScore: number;
      
      // Final conviction blend
      finalConvictionScore: number; // 0.55*CTS + 0.45*SMS + alignmentAdj
      
      // Tier classification
      tier: 'tier1' | 'tier2' | 'tier3';
      tierReason: string; // e.g. "CTS 72 + SMS 78 + bullish alignment → Auto Trading ready"
      
      // Signal summary bullets
      signals: {
        bullishFlows: number;    // count of bullish unusual flow items
        bullishFlowMagnitude: number; // total premium
        darkPoolBias: 'bullish' | 'bearish' | 'neutral'; // from GEX
        ivRank: number;          // 0-100
        ivBias: 'elevated' | 'normal' | 'depressed';
      };
      
      // AI narrative (async, cached 4h)
      aiNarrative: string; // "META is seeing strong institutional accumulation through call sweeps..."
      aiConfidence: number; // 50-95
      
      // Recency
      lastUpdated: string; // ISO timestamp
      score_calculated_at: string;
    }
  ];
  
  // Metadata
  summary: {
    generatedAt: string;
    universe_size: number;
    tier1_count: number;
    tier2_count: number;
    tier3_count: number;
    cache_ttl_seconds: number;
    data_freshness_minutes: number;
  };
}
```

**Error Responses**:
```typescript
// 503: UW API unavailable but fallback data available
{
  stocks: [...reduced tier data with mock enrichment...],
  warning: "UW API unavailable; showing cached/synthetic data"
}

// 500: Data load failed
{ error: "Failed to load Smart Money dashboard", status: 500 }
```

**Cache Policy**:
- Market open (09:30-16:00 ET): 5 min TTL
- Off-hours (16:00-09:30 ET): 30 min TTL
- Weekend: 120 min TTL

---

### 1.2 POST /api/smart-money/score/calculate

**Purpose**: On-demand Smart Money Score calculation for a single symbol (used by Stock Detail, Watch List detail, etc).

**Request Body**:
```typescript
{
  symbol: string;
  includeAiNarrative?: boolean; // default: true
  ctsScore?: number;            // optional override; if omitted, fetch fresh CTS
}
```

**Response (200 OK)**:
```typescript
{
  symbol: string;
  
  smartMoneyScore: number;      // 0-100
  smartMoneyBreakdown: {
    optionsFlowScore: number;
    darkPoolProxyScore: number;
    structureScore: number;
    volatilityScore: number;
    dataAvailability: {
      hasFlow: boolean;
      hasGex: boolean;
      hasNetPremium: boolean;
      hasIv: boolean;
    };
  };
  
  ctsScore: number;
  alignment: string;
  
  finalConvictionScore: number;
  
  tier: 'tier1' | 'tier2' | 'tier3';
  tierReason: string;
  
  signals: object; // same shape as dashboard
  
  aiNarrative?: string;
  aiConfidence?: number;
  
  calculatedAt: string;
}
```

---

### 1.3 POST /api/smart-money/actions/add-to-watchlist

**Purpose**: Add a Smart-Money-sourced stock to user's watchlist (wraps existing watchlist endpoint, adds metadata).

**Request Body**:
```typescript
{
  symbol: string;
  sourceCard: 'smart_money_dashboard';
  smartMoneyScore?: number;    // for logging
  tier?: string;
  ctsScore?: number;
}
```

**Response**: Same as [app/api/watchlist/add/route.ts](app/api/watchlist/add/route.ts#L115)
```typescript
{ success: true, symbol: "NVDA" }
```

**Logging**: Emit event for reports/analytics:
```
smart_money_action:add_to_watchlist
{
  user_id, symbol, tier, smart_money_score, cts_score, timestamp
}
```

---

### 1.4 POST /api/smart-money/actions/add-to-auto-trading

**Purpose**: Add Smart Money Tier 1 stock directly to auto trading (Tier 2 redirects to watchlist with modal).

**Request Body**:
```typescript
{
  symbol: string;
  tier: 'tier1' | 'tier2' | 'tier3';
  smartMoneyScore: number;
  ctsScore: number;
  allocation?: number;        // optional; default: 0 (user adds later)
  compoundProfits?: boolean;
  rinseRepeat?: boolean;
}
```

**Response (200 OK)** — Tier 1 only:
```typescript
{
  success: true,
  autoStock: {
    id: string;
    symbol: string;
    allocation: number;
    status: "idle";
    created_at: string;
  },
  sourceMetadata: {
    smart_money_score: number;
    cts_score: number;
    tier: "tier1";
  }
}
```

**Response (403)** — Tier 2/3 or broker not connected:
```typescript
{
  error: "Tier 2 stocks should be added to watchlist first. Click [Add to Watchlist].",
  tier: "tier2",
  suggestedAction: "watchlist"
}
```

**Response (409)** — Already in auto trading:
```typescript
{
  error: "NVDA is already in auto trading",
  status: 409
}
```

**Logging**:
```
smart_money_action:add_to_auto_trading
{
  user_id, symbol, tier, smart_money_score, cts_score, timestamp
}
```

---

### 1.5 GET /api/smart-money/history

**Purpose**: Return user's Smart Money actions (watchlist/auto add events from dashboard for reporting).

**Query Parameters**:
```typescript
{
  limit?: number;              // default: 100
  days?: number;               // default: 30
  action?: 'add_to_watchlist' | 'add_to_auto_trading' | 'all'; // default: 'all'
}
```

**Response (200 OK)**:
```typescript
{
  events: [
    {
      id: string;
      user_id: string;
      action: 'add_to_watchlist' | 'add_to_auto_trading';
      symbol: string;
      smart_money_score: number;
      cts_score: number;
      tier: string;
      timestamp: string;
    }
  ];
  summary: {
    total_events: number;
    by_action: Record<string, number>;
    by_tier: Record<string, number>;
    top_symbols: string[];
  };
}
```

---

## 2. DATA SCHEMA & CALCULATION

### 2.1 Smart Money Score Calculation Function

**Location**: `app/lib/smartMoney/calculateSmartMoneyScore.ts` (new file)

```typescript
/**
 * Calculate Smart Money Score from available UW signals.
 * Gracefully degrades when signals are missing.
 */

import type { UWOptionsFlowItem, UWNetPremiumTick, UWGexData, UWVolatilityData } from '@/app/lib/options/types';

export type SmartMoneyInputs = {
  symbol: string;
  flow: UWOptionsFlowItem[] | null;
  netPremium: UWNetPremiumTick | null;
  gex: UWGexData | null;
  iv: UWVolatilityData | null;
  ctsScore: number;
  alignment: string;
};

export type SmartMoneyResult = {
  smartMoneyScore: number;    // 0-100
  breakdown: {
    optionsFlowScore: number;
    darkPoolProxyScore: number;
    structureScore: number;
    volatilityScore: number;
  };
  dataAvailability: {
    hasFlow: boolean;
    hasGex: boolean;
    hasNetPremium: boolean;
    hasIv: boolean;
    availabilityFactor: number; // 0.6-1.0, used to weight final score
  };
  signals: {
    bullishFlows: number;
    bullishFlowMagnitude: number;
    darkPoolBias: 'bullish' | 'bearish' | 'neutral';
    ivRank: number;
    ivBias: 'elevated' | 'normal' | 'depressed';
  };
};

export async function calculateSmartMoneyScore(
  inputs: SmartMoneyInputs
): Promise<SmartMoneyResult> {
  
  // 1. Options Flow Score (35% weight if available)
  const optionsFlowScore = calculateFlowScore(inputs.flow, inputs.netPremium);
  
  // 2. Dark Pool Proxy Score (25% weight if available)
  // Use GEX as proxy for dark pool accumulation + net premium bias
  const darkPoolProxyScore = calculateDarkPoolProxyScore(inputs.gex, inputs.netPremium);
  
  // 3. Structure Score (20% weight if available)
  // GEX regime, gamma wall proximity, term structure
  const structureScore = calculateStructureScore(inputs.gex, inputs.iv);
  
  // 4. Volatility Score (20% weight if available)
  // IV Rank context, term structure stability
  const volatilityScore = calculateVolatilityScore(inputs.iv);
  
  // Availability weighting
  const availability = {
    hasFlow: !!inputs.flow && inputs.flow.length > 0,
    hasGex: !!inputs.gex && inputs.gex.totalGex !== 0,
    hasNetPremium: !!inputs.netPremium,
    hasIv: !!inputs.iv,
  };
  
  const availabilityFactor = calculateAvailabilityFactor(availability);
  
  // Weighted blend (normalized by availability)
  const weights = {
    flow: 0.35,
    darkPool: 0.25,
    structure: 0.20,
    volatility: 0.20,
  };
  
  let weightedSum = 0;
  let activeWeight = 0;
  
  if (availability.hasFlow) {
    weightedSum += optionsFlowScore * weights.flow;
    activeWeight += weights.flow;
  }
  
  if (availability.hasGex) {
    weightedSum += darkPoolProxyScore * weights.darkPool;
    activeWeight += weights.darkPool;
  }
  
  if (availability.hasGex) {
    weightedSum += structureScore * weights.structure;
    activeWeight += weights.structure;
  }
  
  if (availability.hasIv) {
    weightedSum += volatilityScore * weights.volatility;
    activeWeight += weights.volatility;
  }
  
  const normalizedScore = activeWeight > 0 
    ? Math.round(weightedSum / activeWeight) 
    : 50; // neutral fallback
  
  // Availability factor dampens score if data is sparse
  const smartMoneyScore = Math.round(normalizedScore * availabilityFactor);
  
  return {
    smartMoneyScore: Math.max(0, Math.min(100, smartMoneyScore)),
    breakdown: {
      optionsFlowScore,
      darkPoolProxyScore,
      structureScore,
      volatilityScore,
    },
    dataAvailability: {
      ...availability,
      availabilityFactor,
    },
    signals: extractSignals(inputs),
  };
}

// ── Sub-score calculators ────────────────────────────────────────

function calculateFlowScore(
  flow: UWOptionsFlowItem[] | null,
  netPremium: UWNetPremiumTick | null
): number {
  if (!flow || flow.length === 0) return 50;
  
  const unusualFlows = flow.filter(f => f.isUnusual);
  const callFlows = unusualFlows.filter(f => f.optionType === 'call');
  const putFlows = unusualFlows.filter(f => f.optionType === 'put');
  
  let score = 50;
  
  // Bullish flow intensity
  if (callFlows.length >= 3) score += 18;
  else if (callFlows.length >= 1) score += 10;
  
  // Bearish flow penalty
  if (putFlows.length >= 2) score -= 12;
  else if (putFlows.length >= 1) score -= 5;
  
  // Ask-side aggression (institutional footprint)
  const askSideFlows = unusualFlows.filter(f => f.side === 'ask');
  if (askSideFlows.length >= unusualFlows.length * 0.6) score += 8;
  
  // Net premium bias
  if (netPremium && netPremium.netBias > 2_000_000) score += 10;
  else if (netPremium && netPremium.netBias < -1_000_000) score -= 10;
  
  return Math.max(0, Math.min(100, score));
}

function calculateDarkPoolProxyScore(
  gex: UWGexData | null,
  netPremium: UWNetPremiumTick | null
): number {
  if (!gex) return 50;
  
  let score = 50;
  
  // Negative GEX = institutional buying (positive for bullish)
  if (gex.gexBias === 'negative') score += 15;
  else if (gex.gexBias === 'positive') score -= 10;
  
  // Size of GEX (magnitude = conviction)
  const gexMagnitude = Math.abs(gex.totalGex);
  if (gexMagnitude > 1_000_000_000) score += 12;
  else if (gexMagnitude > 500_000_000) score += 6;
  
  // Pinning level proximity (if negative GEX near current price = support)
  if (gex.keyStrikes && gex.keyStrikes.length > 0) {
    const nearestStrike = gex.keyStrikes[0];
    if (Math.abs(nearestStrike.distancePct) < 1) score += 8;
  }
  
  return Math.max(0, Math.min(100, score));
}

function calculateStructureScore(
  gex: UWGexData | null,
  iv: UWVolatilityData | null
): number {
  if (!gex && !iv) return 50;
  
  let score = 50;
  
  // Regime assessment from IV term structure
  if (iv && iv.termStructure === 'contango') score += 6; // normal = neutral
  if (iv && iv.termStructure === 'backwardation') score += 12; // stress = potential trade
  
  return Math.max(0, Math.min(100, score));
}

function calculateVolatilityScore(
  iv: UWVolatilityData | null
): number {
  if (!iv) return 50;
  
  let score = 50;
  
  // IV Rank context
  if (iv.ivRank < 25) score += 6; // low IV = good entry
  else if (iv.ivRank > 75) score -= 8; // high IV = expensive
  
  return Math.max(0, Math.min(100, score));
}

function calculateAvailabilityFactor(availability: {
  hasFlow: boolean;
  hasGex: boolean;
  hasNetPremium: boolean;
  hasIv: boolean;
}): number {
  const count = Object.values(availability).filter(Boolean).length;
  // 1 source: 0.6, 2 sources: 0.75, 3+ sources: 1.0
  return count === 1 ? 0.6 : count === 2 ? 0.75 : 1.0;
}

function extractSignals(inputs: SmartMoneyInputs) {
  const bullishFlows = inputs.flow?.filter(f => f.isUnusual && f.optionType === 'call') || [];
  const bullishFlowMagnitude = bullishFlows.reduce((sum, f) => sum + f.premium, 0);
  
  let darkPoolBias: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (inputs.gex?.gexBias === 'negative') darkPoolBias = 'bullish';
  if (inputs.gex?.gexBias === 'positive') darkPoolBias = 'bearish';
  
  let ivBias: 'elevated' | 'normal' | 'depressed' = 'normal';
  if (inputs.iv?.ivRank! > 65) ivBias = 'elevated';
  if (inputs.iv?.ivRank! < 35) ivBias = 'depressed';
  
  return {
    bullishFlows: bullishFlows.length,
    bullishFlowMagnitude,
    darkPoolBias,
    ivRank: inputs.iv?.ivRank ?? 50,
    ivBias,
  };
}
```

---

### 2.2 Final Conviction Score Calculation

**Location**: Update existing [app/lib/calculateScore/calculateFinalCTS.ts](app/lib/calculateScore/calculateFinalCTS.ts#L41)

Add new export:
```typescript
export function calculateFinalConviction(
  ctsScore: number,
  smartMoneyScore: number,
  alignment: string
): number {
  let conviction = 0.55 * ctsScore + 0.45 * smartMoneyScore;
  
  // Alignment boost (+5 if confirmed bullish, -5 if bearish)
  const alignmentAdj = 
    alignment === 'bullish_confirmed' ? 5 :
    alignment === 'bullish_timing_weak' ? 2 :
    alignment === 'bearish_confirmed' ? -5 :
    alignment === 'countertrend_bounce' ? -2 :
    0;
  
  conviction += alignmentAdj;
  
  return Math.max(0, Math.min(100, Math.round(conviction)));
}
```

---

### 2.3 Tier Classification

**Location**: `app/lib/smartMoney/classifyTier.ts` (new file)

```typescript
export function classifyTier(
  ctsScore: number,
  smartMoneyScore: number,
  alignment: string,
  finalConviction: number
): {
  tier: 'tier1' | 'tier2' | 'tier3';
  reason: string;
} {
  // Tier 1: Auto Trading Candidate
  if (
    ctsScore >= 65 &&
    smartMoneyScore >= 75 &&
    (alignment === 'bullish_confirmed' || alignment === 'bullish_timing_weak')
  ) {
    return {
      tier: 'tier1',
      reason: `CTS ${ctsScore} + SMS ${smartMoneyScore} + ${alignment} alignment → Ready for Auto Trading`
    };
  }
  
  // Tier 2: Watchlist Candidate
  if (smartMoneyScore >= 70 || finalConviction >= 72) {
    const reason = smartMoneyScore >= 70 
      ? `Strong Smart Money signal (SMS ${smartMoneyScore}) but CTS ${ctsScore} needs confirmation`
      : `Moderate conviction (${finalConviction}) — track and monitor`;
    return {
      tier: 'tier2',
      reason
    };
  }
  
  // Tier 3: Informational
  return {
    tier: 'tier3',
    reason: `Interesting activity but needs technical or institutional confirmation`
  };
}
```

---

### 2.4 Database Schema Addition

**New table**: `smart_money_actions` (for reporting/analytics)

```sql
CREATE TABLE smart_money_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL, -- 'add_to_watchlist' | 'add_to_auto_trading' | 'viewed_dashboard'
  symbol TEXT NOT NULL,
  smart_money_score NUMERIC(5,2),
  cts_score NUMERIC(5,2),
  tier TEXT, -- 'tier1' | 'tier2' | 'tier3'
  final_conviction NUMERIC(5,2),
  created_at TIMESTAMP DEFAULT NOW(),
  
  INDEX (user_id, created_at DESC),
  INDEX (user_id, action),
  INDEX (symbol, created_at DESC)
);
```

---

## 3. UI COMPONENT ARCHITECTURE

### 3.1 Smart Money Dashboard Page

**Route**: `/app/smart-money` (new page)

**Component Tree**:
```
<SmartMoneyDashboardPage>
  ├─ <PageHeader title="Smart Money Dashboard" icon={<LuckmiAiIcon />} />
  ├─ <FilterToolbar
  │    onFilterChange={...}
  │    filters={{ minCts, minSMS, tier, sortBy }}
  │  />
  ├─ <SmartMoneyStockGrid>
  │    stocks: SmartMoneyStock[]
  │    ├─ <SmartMoneyStockCard> (repeating)
  │    │    ├─ <CardHeader symbol, tier badge, finalConviction score />
  │    │    ├─ <ScoreRow label="CTS" value={ctsScore} sparkline={dailyTrend} />
  │    │    ├─ <ScoreRow label="Smart Money" value={sms} icon={${alignment}} />
  │    │    ├─ <SignalBullets flow, gex, iv />
  │    │    ├─ <AiNarrative text={aiNarrative} expanded={false} />
  │    │    └─ <ActionFooter
  │    │         [Add to Watchlist] [Add to Auto Trading]
  │    │       />
  │    └─ <LoadingCard /> | <EmptyCard />
  │
  ├─ <TierSummaryPanel>
  │    tier1_count, tier2_count, tier3_count
  │    charts / mini stats
  │
  └─ <HelpModal explanation and score education />
```

---

### 3.2 Smart Money Stock Card — Detailed Layout

**Desktop (1200px+)**:
```
┌─────────────────────────────────────────────────────────────────┐
│ NVDA              [Tier 1 - Auto Trading]            Updated 2m  │
├─────────────────────────────────────────────────────────────────┤
│ CTS: 78              Smart Money: 86                 Final: 83   │
│ ▁▂▃▄▅▆▇█▇▆▅        Bullish institutional flow       ↗ Strong   │
├─────────────────────────────────────────────────────────────────┤
│ • Bullish dark pool accumulation (GEX: -850M, pinned at 900)    │
│ • Heavy call sweeps and blocks, ask-side dominant (125M premium)│
│ • IV Rank 28% — favorable entry, term structure normal         │
│ • Daily CTS 80 + 15m CTS 76 aligned bullish, support at 880    │
├─────────────────────────────────────────────────────────────────┤
│ "META is seeing strong institutional accumulation through dark  │
│  pool blocks and aggressive call buying. Technical alignment is │
│  improving, making it a strong candidate to add to Auto Trading"│
│ (Confidence: 88%)                                               │
├─────────────────────────────────────────────────────────────────┤
│      [+ Add to Watchlist]    [→ Add to Auto Trading]      [↘]   │
└─────────────────────────────────────────────────────────────────┘
```

**Mobile (375px)**:
```
┌─────────────────────────────────┐
│ NVDA [Tier 1]         2m ago ↻  │
├─────────────────────────────────┤
│ CTS: 78 | SMS: 86 | Final: 83  │
├─────────────────────────────────┤
│ ▁▂▃▄▅▆▇█ Bullish accumulation  │
│ • Dark pool GEX: -850M         │
│ • Call sweeps: 125M, ask bias  │
│ • IV Rank: 28% (favorable)     │
├─────────────────────────────────┤
│ Strong institutional setup...   │
│ [Read More v]                  │
├─────────────────────────────────┤
│ [+ Watchlist] [→ Auto Trading]  │
└─────────────────────────────────┘
```

---

### 3.3 UI Component Props & State

```typescript
// SmartMoneyStockCard.tsx
export interface SmartMoneyStockCardProps {
  stock: SmartMoneyStock;
  onAddToWatchlist: (symbol: string, tier: string) => void;
  onAddToAutoTrading: (symbol: string, tier: string) => void;
  isLoading?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
}

interface SmartMoneyStock {
  symbol: string;
  ctsScore: number;
  dailyCTS: number;
  intradayCTS: number;
  alignment: string;
  smartMoneyScore: number;
  optionsFlowScore: number;
  darkPoolProxyScore: number;
  structureScore: number;
  volatilityScore: number;
  finalConvictionScore: number;
  tier: 'tier1' | 'tier2' | 'tier3';
  tierReason: string;
  signals: {
    bullishFlows: number;
    bullishFlowMagnitude: number;
    darkPoolBias: 'bullish' | 'bearish' | 'neutral';
    ivRank: number;
    ivBias: 'elevated' | 'normal' | 'depressed';
  };
  aiNarrative: string;
  aiConfidence: number;
  lastUpdated: string;
}

// Filter toolbar state
interface DashboardFilters {
  minCts: number;          // default 50
  minSmartMoneyScore: number; // default 60
  tier: 'all' | 'tier1' | 'tier2' | 'tier3'; // default 'all'
  sortBy: 'conviction' | 'cts' | 'sms' | 'alpha'; // default 'conviction'
  limit: number; // default 20
}
```

---

## 4. IMPACT ANALYSIS ON EXISTING SYSTEMS

### 4.1 Impact on Auto Trading (`/app/auto/page.tsx`, `/app/api/auto-stocks/add/route.ts`)

**No breaking changes**. Smart Money adds a new source channel for stock candidates.

**Changes**:
1. **Add source metadata logging**: When a stock is added from Smart Money dashboard, log `source: 'smart_money_dashboard'` in the insert.
   
```typescript
// In /app/api/auto-stocks/add/route.ts, update insert:
const { data, error } = await supabase
  .from("auto_stocks")
  .insert({
    user_id: user.id,
    symbol,
    allocation,
    compound_profits: compoundProfits,
    rinse_repeat: rinseRepeat,
    max_repeats: maxRepeats,
    repeat_counter: 0,
    status: "idle",
    // NEW FIELD (requires migration)
    source_channel: body.sourceChannel || null, // 'smart_money_dashboard' | 'manual' | null
    smart_money_score: body.smartMoneyScore || null, // metadata
    cts_score_at_entry: body.ctsScore || null,
  })
```

2. **UI hint in Auto Trading page**: Optional badge showing "From Smart Money" if source_channel is set.

3. **Auto Trading filter**: Optional UI filter to show "Smart Money sourced" stocks separately for performance tracking.

**No impact on**:
- Trade execution logic
- Position management
- Sell signals
- Broker sync
- Reports (unless you want to segment by source — recommended for Phase 4)

---

### 4.2 Impact on Options (`/app/api/options/opportunities/route.ts`, `/app/options/page.tsx`)

**No breaking changes**. Smart Money Score can enhance options scoring as a secondary signal.

**Recommended integration (Phase 2+)**:
1. **Options opportunity enrichment**: When fetching opportunities, optionally include Smart Money Score of underlying symbol as context.

```typescript
// In /app/api/options/opportunities/route.ts, after scoring each opportunity:
const smartMoneyScore = await calculateSmartMoneyScore({
  symbol: opportunity.symbol,
  flow: opportunityData.flow,
  netPremium: opportunityData.netPremium,
  gex: opportunityData.gex,
  iv: opportunityData.iv,
  ctsScore: opportunity.cts || 0,
  alignment: opportunity.alignment,
});

// Add to opportunity payload (optional field)
opportunity.underlyingSmartMoneyScore = smartMoneyScore.smartMoneyScore;
opportunity.underlyingTier = classifyTier(...).tier;
```

2. **Options UI**: Display "Underlying Smart Money: 86" label in opportunity card.

3. **Options score boost**: Optional: increase options score weight if underlying Smart Money is Tier 1.

**No impact on**:
- Contract screening
- Greeks calculation
- Strategy selection
- Risk assessment
- Paper trade execution

---

### 4.3 Impact on Luckmi Picks (`/app/api/luckmi-picks/route.ts`)

**Recommended update for Phase 2**:

Current logic ranks by `rankScore = ctsScore + alignmentBoost - overextendedPenalty`.

**Add Smart Money factor**:

```typescript
// In /app/api/luckmi-picks/route.ts

function alignmentBoost(alignment?: string | null) {
  if (alignment === "bullish_confirmed") return 10;
  if (alignment === "bullish_timing_weak") return 4;
  if (alignment === "countertrend_bounce") return 1;
  if (alignment === "bearish_confirmed") return -12;
  return 0;
}

// NEW: Smart Money boost
function smartMoneyBoost(smartMoneyScore?: number | null) {
  if (!Number.isFinite(smartMoneyScore)) return 0;
  if (smartMoneyScore >= 75) return 12; // Tier 1 candidate
  if (smartMoneyScore >= 65) return 6;  // Tier 2 candidate
  return 0;
}

// Updated ranking
const rankScore =
  ctsScore +
  alignmentBoost(cts?.alignment) +
  smartMoneyBoost(smartMoney?.smartMoneyScore) - // NEW
  overextendedPenalty(changePercent);

// Filter: only include picks with combined score confidence
const picks = results
  .filter(r => r.ctsScore >= 55 || r.smartMoneyScore >= 70) // OR logic
  .sort((a, b) => b.rankScore - a.rankScore)
  .slice(0, 3);
```

**No breaking changes** to existing picks format.

---

### 4.4 Impact on Reports (`/app/api/reports/ai-review/route.ts`, Admin analytics)

**No breaking changes**. Reports remain unchanged.

**Recommended Phase 4 additions**:
1. Track Smart Money pick performance separately in dashboard.
2. Add "Smart Money sourced" filter to trade history.
3. Segment performance: "Picks from Smart Money vs. Other Sources".
4. Report KPI: "Smart Money Tier 1 win rate", "Avg days to target", etc.

---

## 5. USER FLOW & STATE MACHINE

### 5.1 Smart Money Dashboard User Journey

```
User lands on /app/smart-money
├─ Fetch dashboard data (initial load 2s)
├─ Display 20-30 top-ranked stocks
│  ├─ Each card shows: symbol, scores, signals, AI narrative
│  ├─ User can: filter, sort, expand, read full narrative
│  │
│  └─ User Action 1: [Add to Watchlist]
│     ├─ POST /api/smart-money/actions/add-to-watchlist
│     ├─ Success toast: "NVDA added to watchlist"
│     └─ Log event for analytics
│
└─ User Action 2: [Add to Auto Trading]
   ├─ Tier 1 stocks: Direct POST /api/smart-money/actions/add-to-auto-trading
   │  ├─ Success: Show auto trading setup modal (allocation, etc)
   │  └─ Log event
   │
   └─ Tier 2+ stocks: Show modal "Add to watchlist first?"
      ├─ User can click through to add to watchlist
      └─ Then can manually add to auto trading from watchlist detail
```

---

### 5.2 Stock Detail Page Integration

When user views stock detail from Stock page or Watchlist:
```
<StockDetail symbol="NVDA">
  ├─ Existing CTS section
  ├─ NEW Smart Money Summary Section
  │  ├─ Smart Money Score: 86 (breakdown chart)
  │  ├─ Tier: Tier 1 - Auto Trading Candidate
  │  ├─ Signals (bullish flows, GEX, IV context)
  │  ├─ AI narrative (same as dashboard)
  │  └─ [Add to Auto Trading] button (if Tier 1)
  │
  └─ Existing AI Narrative (enhanced with Smart Money context)
```

---

## 6. MIGRATION & ROLLOUT

### Phase 1 (Week 1-2): MVP Dashboard
1. Create endpoint `/api/smart-money/dashboard` (uses existing UW + CTS).
2. Create page `/app/smart-money` with grid of cards.
3. Wire [Add to Watchlist] and [Add to Auto Trading] buttons.
4. No database changes yet (optional source tracking).
5. **Ship to Prod**. Announce: "Smart Money Dashboard is live — rank institutional activity."

### Phase 2 (Week 3): Stock Detail Integration
1. Integrate Smart Money Score into `/app/stock/[symbol]/page.tsx`.
2. Add Smart Money section to stock detail.
3. Update AI narrative to reference Smart Money context.

### Phase 3 (Week 4): Luckmi Picks Enhancement
1. Update Luckmi Picks ranking function to factor in Smart Money Score.
2. Picks now show Smart Money badge/icon.

### Phase 4+ (Post-launch): Analytics & Insider/Congress Integration
1. Add Smart Money action table to Supabase.
2. Track performance cohorts: "Smart Money picks vs. others".
3. Integrate insider/congressional signals when available in UW API.
4. Premium feature gate.

---

## 7. TESTING STRATEGY

### Unit Tests
- `calculateSmartMoneyScore()` with various input combinations (all signals, partial signals, no signals).
- `classifyTier()` with boundary cases (CTS 64 vs 65, SMS 74 vs 75).
- Scoring with mock UW data (fallback mode).

### Integration Tests
- `/api/smart-money/dashboard` response shape and caching.
- `/api/smart-money/actions/add-to-watchlist` logs event correctly.
- `/api/smart-money/actions/add-to-auto-trading` enforces tier rules.

### E2E / Manual
- Dashboard loads, filters work, cards render.
- Add to watchlist flow.
- Add to auto trading (Tier 1 succeeds, Tier 2+ shows modal).
- AI narrative loads asynchronously.

### Performance
- Dashboard endpoint: <2s with 20 stocks.
- Per-stock calculation: <500ms.
- Cache hit rate: >80% during market hours.

---

## 8. CONFIGURATION & TOGGLES

**Environment variables** (optional):
```
SMART_MONEY_ENABLED=true
SMART_MONEY_MIN_CTS_DEFAULT=50
SMART_MONEY_MIN_SMS_DEFAULT=60
SMART_MONEY_CACHE_TTL_SECONDS=300
SMART_MONEY_TIER1_AUTO_ALLOWED=true
```

**Feature flags** (recommended):
```typescript
// Can add to /app/lib/featureFlags.ts or env
const SMART_MONEY_DASHBOARD_ENABLED = process.env.SMART_MONEY_ENABLED !== 'false';
const SMART_MONEY_ADD_TO_AUTO_ENABLED = true; // Tier 1 only
const SMART_MONEY_SHOW_INSIDER_SIGNALS = false; // Phase 4+
```

---

## 9. COMPLETION CHECKLIST

**API Layer**:
- [ ] Implement `calculateSmartMoneyScore()` library function
- [ ] Implement `classifyTier()` function
- [ ] Create `/api/smart-money/dashboard` endpoint
- [ ] Create `/api/smart-money/score/calculate` endpoint (single-stock)
- [ ] Create `/api/smart-money/actions/add-to-watchlist` wrapper
- [ ] Create `/api/smart-money/actions/add-to-auto-trading` wrapper
- [ ] Add source_channel to auto_stocks table (optional, Phase 1.5)
- [ ] Implement event logging to smart_money_actions table (Phase 2)

**UI Layer**:
- [ ] Create `/app/smart-money/page.tsx` main dashboard
- [ ] Create `SmartMoneyStockCard` component
- [ ] Create `FilterToolbar` component
- [ ] Create `TierSummaryPanel` component
- [ ] Integrate Smart Money into Stock Detail page
- [ ] Add Smart Money boost to Luckmi Picks ranking (Phase 2)

**Testing**:
- [ ] Unit tests for scoring functions
- [ ] Integration tests for endpoints
- [ ] E2E test for full flow: dashboard → add to watchlist → verify
- [ ] Performance profiling

**Deployment**:
- [ ] Document in README/Swagger
- [ ] Add changelog entry
- [ ] Announce to users: "Smart Money Dashboard now live"

---

## 10. SUCCESS METRICS (Reporting, Phase 4)

1. **Adoption**: % of daily active users viewing Smart Money Dashboard.
2. **Action rate**: % who click "Add to Watchlist" or "Auto Trading" per session.
3. **Quality**:
   - Tier 1 auto-trades: average 72h to target, 58% win rate.
   - Tier 1 vs. non-Smart-Money trades: compare Sharpe ratio, win rate.
4. **Conversion**: % of Smart Money Tier 1 auto-trades that compound (second+ cycle).
5. **Subscriber value**: Premium subscribers who use Smart Money show higher engagement/retention.

---

**End of Spec**
