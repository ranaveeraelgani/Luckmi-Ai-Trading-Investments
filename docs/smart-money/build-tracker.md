# Smart Money Build Tracker

Use this tracker to run delivery from planning through launch.

## Current Status

- Program: Smart Money Dashboard
- Status: In progress
- Active phase: Phase 1
- Last update: 2026-05-13

## Legend

- [ ] Not started
- [~] In progress
- [x] Complete
- [!] Blocked

## Phase 1 - MVP Dashboard

### Backend
- [x] Implement SMS scoring library in app/lib/smartMoney/calculateSmartMoneyScore.ts
- [x] Implement tier classifier in app/lib/smartMoney/classifyTier.ts
- [x] Add final conviction helper blend in app/lib/calculateScore
- [x] Create GET app/api/smart-money/dashboard/route.ts
- [x] Create POST app/api/smart-money/score/calculate/route.ts
- [x] Create POST app/api/smart-money/actions/add-to-watchlist/route.ts
- [x] Create POST app/api/smart-money/actions/add-to-auto-trading/route.ts

### Frontend
- [x] Create app/smart-money/page.tsx
- [x] Create components/smart-money/SmartMoneyStockCard.tsx
- [x] Create components/smart-money/SmartMoneyStockGrid.tsx
- [x] Create components/smart-money/FilterToolbar.tsx
- [x] Create components/smart-money/TierSummaryPanel.tsx
- [x] Wire action handlers to smart-money action APIs
- [x] Add loading, empty, and error states
- [x] Validate responsive layouts (mobile, tablet, desktop)

### Data and Reliability
- [x] Apply cache policy (5m market hours, 30m off-hours)
- [x] Add request deduplication protection for score fetches
- [x] Ensure graceful fallback when UW data is missing
- [x] Confirm no breaking change for existing watchlist and auto-stocks APIs

### Testing and Validation
- [x] Unit test score components and tier boundaries
- [x] Integration test dashboard and action endpoints
- [~] E2E test dashboard to watchlist flow
- [~] E2E test tier gate for auto-trading add
- [~] Confirm p95 dashboard load below 2.5s

### Exit Criteria
- [x] All Phase 1 required tests pass
- [x] Feature flag controlled enablement verified
- [~] Staging signoff complete

## Phase 2 - Integrations and Reporting

### Integrations
- [ ] Add Smart Money section on stock detail page
- [ ] Add optional SMS enrichment in options opportunities flow
- [ ] Add SMS-aware ranking boost in luckmi picks
- [ ] Extend API responses with optional SMS fields

### Analytics
- [ ] Create smart_money_actions table (or migration script)
- [ ] Log watchlist and auto-trading actions
- [ ] Add source-based performance slicing in reports
- [ ] Add initial admin adoption dashboard metrics

### Exit Criteria
- [ ] Backward compatibility validated for all updated responses
- [ ] Adoption tracking visible in admin views
- [ ] QA signoff complete

## Phase 3 - Monetization and Controls

### Product Controls
- [ ] Add subscription gate for add-to-auto-trading action
- [ ] Keep dashboard browsing available to all users
- [ ] Add clear paywall messaging and upgrade CTA where needed

### Safe Rollout
- [ ] Implement percentage rollout flag for integrations
- [ ] Add threshold controls via environment config
- [ ] Add A/B toggle for stricter Tier 1 thresholds

### Exit Criteria
- [ ] Premium gating behavior validated by E2E tests
- [ ] Rollout controls tested in staging
- [ ] Metrics for conversion and retention available

## Phase 4 - Advanced Signals and Validation

### Signal Expansion
- [ ] Add insider signal scorer (when API is available)
- [ ] Add congressional signal scorer (when API is available)
- [ ] Update availability weighting for expanded signal set

### Validation and Research
- [ ] Backtest Smart Money picks vs baseline selection
- [ ] Publish smart money performance report endpoint
- [ ] Tune thresholds with measured outcome data

### Exit Criteria
- [ ] Backtest report reviewed and accepted
- [ ] Advanced signals stable in production monitoring
- [ ] Updated documentation published

## Blockers and Notes

- Staging signoff requires deployment validation in target staging environment.
- Browser E2E harness (Playwright) is not installed as a direct dependency; route-level integration coverage is in place.

## Daily Log

- 2026-05-13: Build tracking system initialized.
- 2026-05-13: Phase 1 implementation started. Added Smart Money scoring libs, tier classifier, dashboard/score/action APIs, and initial smart-money UI page/components.
- 2026-05-13: Added Smart Money cache policy + input dedup + fallback universe behavior, deterministic AI narrative response fields, card expand/collapse behavior, and final conviction helper in CTS module.
- 2026-05-13: Added structured Smart Money error payloads, full feature-flag gating, nav toggle, unit/integration test suite (10 passing tests), successful build validation, and dev startup verification.
