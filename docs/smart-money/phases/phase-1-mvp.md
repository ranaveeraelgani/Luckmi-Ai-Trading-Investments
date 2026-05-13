# Phase 1 - MVP Dashboard

Status: In progress
Target: Production-ready Smart Money dashboard with scoring and action flows

## Scope

- Build core Smart Money scoring and tiering
- Build dashboard API and UI
- Enable add-to-watchlist and add-to-auto-trading actions
- Keep all existing behavior backward compatible

## In Scope Deliverables

### Backend
- app/lib/smartMoney/calculateSmartMoneyScore.ts
- app/lib/smartMoney/classifyTier.ts
- app/api/smart-money/dashboard/route.ts
- app/api/smart-money/score/calculate/route.ts
- app/api/smart-money/actions/add-to-watchlist/route.ts
- app/api/smart-money/actions/add-to-auto-trading/route.ts

### Frontend
- app/smart-money/page.tsx
- components/smart-money/SmartMoneyStockCard.tsx
- components/smart-money/SmartMoneyStockGrid.tsx
- components/smart-money/FilterToolbar.tsx
- components/smart-money/TierSummaryPanel.tsx

## Requirements

### Scoring
- Smart Money Score formula:
  - optionsFlowScore weight: 0.35
  - darkPoolProxyScore weight: 0.25
  - structureScore weight: 0.20
  - volatilityScore weight: 0.20
- Active-weight normalization required
- Availability factor:
  - 1 source: 0.60
  - 2 sources: 0.75
  - 3+ sources: 1.00

### Conviction Blend
- Final Conviction = 0.55 * CTS + 0.45 * SMS + alignment adjustment
- Alignment adjustment:
  - bullish_confirmed: +5
  - bullish_timing_weak: +2
  - mixed: 0
  - countertrend_bounce: -2
  - bearish_confirmed: -5

### Tiering
- Tier 1:
  - CTS >= 65
  - SMS >= 75
  - alignment in bullish_confirmed or bullish_timing_weak
- Tier 2:
  - SMS >= 70 or Final Conviction >= 72
- Tier 3:
  - otherwise

## Implementation Checklist

### APIs
- [x] Dashboard endpoint supports filters: limit, minCts, minSms, tier
- [x] Single-score endpoint supports symbol-level scoring
- [x] Add-to-watchlist wrapper logs action result
- [x] Add-to-auto wrapper enforces Tier 1 gate

### UI
- [x] Tier sections shown with counts
- [x] Card supports collapsed and expanded modes
- [x] Score bars and signal badges rendered
- [x] Action buttons reflect tier constraints
- [x] AI narrative fallback and loading state handled

### Reliability
- [x] Cache configured by market phase
- [x] Request dedup and fallback behavior implemented
- [x] Errors return structured response with safe messages

### Testing
- [x] Unit coverage for score subcomponents and tier boundaries
- [x] Integration coverage for all new smart-money endpoints
- [~] E2E coverage for watchlist and auto-trading action flows

## Exit Criteria

- [~] Functional demo in staging with real or fallback data
- [x] No regression on watchlist, auto-stocks, options pages
- [~] Performance target met: p95 < 2.5s on dashboard endpoint
- [x] Feature flag can disable full feature without errors

## Dependencies

- Existing UW API proxy endpoints
- Existing CTS score pipeline
- Existing watchlist and auto-stocks add endpoints

## Out of Scope

- Insider and congressional signals
- Premium gating and paywall behavior
- Historical backtesting and analytics dashboards
