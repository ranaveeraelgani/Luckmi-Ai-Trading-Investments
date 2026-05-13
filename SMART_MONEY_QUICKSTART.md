# Smart Money Dashboard — Quick Start & Implementation Roadmap

**Last Updated**: May 13, 2026  
**Status**: Ready for Engineering Kickoff

---

## 📋 EXECUTIVE SUMMARY

**What**: A Smart Money Dashboard that ranks stocks by institutional/insider interest combined with technical alignment (CTS). Stocks are tiered into Auto Trading candidates (Tier 1), Watchlist candidates (Tier 2), and informational (Tier 3).

**Why**: Institutional signals (options flow, dark pool, structure) are currently being collected by Luckmi but not aggregated/ranked for users. This dashboard turns that raw data into a discovery engine that increases trading opportunity quality and monetization.

**Impact**: 
- ✅ No breaking changes to existing systems
- ✅ Improves Luckmi Picks quality (+4-6% win rate expected)
- ✅ New source channel for Auto Trading candidates
- ✅ Premium feature positioning ready for Phase 4

---

## 🎯 QUICK FACTS

| Aspect | Detail |
|--------|--------|
| **New Page** | `/app/smart-money` (public, all users) |
| **New Endpoints** | 3 main routes: dashboard, score calculator, add-to-actions |
| **Database Changes** | Optional: `smart_money_actions` table for analytics (Phase 2) |
| **UI Components** | 1 new page, ~5 reusable card/modal components |
| **Scoring Signal** | SMS = weighted blend of options flow (35%), dark pool proxy (25%), structure (20%), volatility (20%) |
| **Score Formula** | Final Conviction = 0.55 × CTS + 0.45 × SMS + Alignment Adjustment |
| **Tier 1 Threshold** | CTS ≥ 65, SMS ≥ 75, alignment bullish/confirmed |
| **Tier 2 Threshold** | SMS ≥ 70 OR Final Conviction ≥ 72, but CTS weak |
| **Tier 3** | Everything else (interesting but needs confirmation) |
| **Cache TTL** | 5 min peak hours, 30 min off-hours |
| **API Rate Limit** | Negligible overhead; UW API already in use |
| **Performance** | Dashboard load <2s (20 stocks), cache hits <500ms |
| **Rollout Phases** | Phase 1 MVP: Week 1-2, Phase 2+ Integration: Week 3+ |

---

## 📚 DOCUMENTATION ARTIFACTS

Three detailed specifications have been created:

### 1. **SMART_MONEY_SPEC.md** (12 sections, 800+ lines)
Complete implementation specification covering:
- **Section 1-2**: API endpoint contracts (request/response schemas)
- **Section 2**: Data shapes & scoring algorithms
- **Section 3**: UI component architecture & props
- **Section 4**: Impact on existing systems (summary)
- **Section 5**: User flow & state machine
- **Section 6**: Migration & rollout phases
- **Section 7-10**: Testing strategy, config, checklist, success metrics

**Use this for**: Backend implementation, API design, database schema

---

### 2. **UI_MOCKUP_GUIDE.md** (12 sections, 500+ lines)
Detailed UI mockup guide covering:
- **Section 1**: Full dashboard layout (desktop, tablet, mobile)
- **Section 2**: Individual card component breakdown
- **Section 3**: Collapsed vs. expanded card states
- **Section 4**: Mobile-responsive views
- **Section 5**: Score visualization components (bars, badges, pills)
- **Section 6**: Modals & interactive flows (watchlist, auto trading, tier redirects)
- **Section 7**: Action result flows (success/error cases)
- **Section 8**: Loading & error states
- **Section 9-12**: Responsive breakpoints, accessibility, animations, color scheme

**Use this for**: Frontend implementation, UI design, component states

---

### 3. **SMART_MONEY_IMPACT_ANALYSIS.md** (11 sections, 600+ lines)
Comprehensive impact & integration analysis covering:
- **Section 1-5**: Detailed impact on Auto Trading, Options, Picks, Watchlist, Reports
- **Section 6**: Database schema changes (optional)
- **Section 7**: Risk assessment & mitigation (5 major risks)
- **Section 8**: Deployment strategy (3 phases)
- **Section 9**: Configuration & feature flags
- **Section 10**: Testing checklist
- **Section 11**: Success metrics & KPIs

**Use this for**: Architecture decisions, risk planning, QA, deployment

---

## 🚀 IMPLEMENTATION ROADMAP

### **PHASE 1: MVP Smart Money Dashboard (Week 1-2)** ⭐ Start Here

**Scope**: Core dashboard page + scoring + add-to-actions

**Backend Work** (3-4 days):
1. Create scoring library:
   - `app/lib/smartMoney/calculateSmartMoneyScore.ts` (300 lines)
   - `app/lib/smartMoney/classifyTier.ts` (50 lines)
   - Update `app/lib/calculateScore/calculateFinalCTS.ts` (add 30 lines)

2. Create API endpoints:
   - `app/api/smart-money/dashboard/route.ts` (200 lines, orchestrates scoring)
   - `app/api/smart-money/score/calculate/route.ts` (150 lines, single-stock)
   - `app/api/smart-money/actions/add-to-watchlist/route.ts` (100 lines, wrapper)
   - `app/api/smart-money/actions/add-to-auto-trading/route.ts` (150 lines, wrapper + tier check)

3. Wire existing endpoints:
   - Verify `/api/watchlist/add` works (already exists)
   - Verify `/api/auto-stocks/add` accepts `sourceChannel` parameter (1 line change)

**Estimated**: 8-10 hours backend work

---

**Frontend Work** (3-4 days):
1. Create page:
   - `app/smart-money/page.tsx` (300 lines, layout + state)

2. Create components:
   - `components/smart-money/SmartMoneyStockCard.tsx` (200 lines, reusable card)
   - `components/smart-money/SmartMoneyStockGrid.tsx` (100 lines, grid layout)
   - `components/smart-money/FilterToolbar.tsx` (150 lines, filters + sort)
   - `components/smart-money/TierSummaryPanel.tsx` (100 lines, stats panel)

3. Wire actions:
   - Button onClick handlers for watchlist/auto-trading add
   - Success/error toasts
   - Optional: redirect to auto trading page on successful add

4. Responsive design:
   - Tailwind CSS matching existing Luckmi theme
   - Mobile: 1-column grid, tablet: 2-column, desktop: 3-column
   - Follow accessibility guidelines (keyboard nav, screen readers)

**Estimated**: 10-12 hours frontend work

---

**Testing** (1-2 days):
1. Unit tests for scoring functions
2. Integration tests for endpoints
3. E2E tests: dashboard load → add to watchlist → verify
4. Performance testing: <2s load for 20 stocks

**Estimated**: 4-6 hours testing

---

**Total Phase 1**: ~22-28 hours (3-4 engineers, 1 week)

**Deliverable**: Live dashboard at `/app/smart-money`, users can view, filter, add stocks to watchlist/auto trading.

---

### **PHASE 2: Integration & Reporting (Week 3-4)**

**Scope**: Add Smart Money context to existing pages, basic event logging

**Work**:
1. Stock Detail integration: Add SMS section to `/app/stock/[symbol]/page.tsx`
2. Luckmi Picks enhancement: Update ranking formula to include SMS boost
3. Event logging: Create `smart_money_actions` table, log add-to-watchlist/auto-trading events
4. Basic admin dashboard: Show "Smart Money feature adoption" metrics

**Total Phase 2**: ~10-14 hours

---

### **PHASE 3: Premium Positioning (Week 5-6)**

**Scope**: Add feature gatekeeping, insider signals preparation

**Work**:
1. Feature flag: Gate Smart Money Add-to-Auto behind Pro/Premium subscription
2. Prepare for insider/congressional signals: Add placeholder columns to SMS schema
3. A/B testing: Start tracking Tier 1 win rate vs. other sources

**Total Phase 3**: ~6-8 hours

---

### **PHASE 4: Advanced Signals & Backtest (Week 7+)**

**Scope**: When insider/congressional APIs available, integrate + report

**Work**:
1. Integrate insider + congressional signals into SMS calculation
2. Backtest historical smart money picks
3. Publish "Smart Money Performance Report" to users
4. Premium pricing update: Market Smart Money as differentiator

**Total Phase 4**: Ongoing, depends on external data availability

---

## 🛠️ HOW TO GET STARTED

### Step 1: Review Documentation
- [ ] Read this README (5 min)
- [ ] Skim SMART_MONEY_SPEC.md sections 1-2 (API & scoring) — 15 min
- [ ] Skim UI_MOCKUP_GUIDE.md section 1 (dashboard layout) — 10 min
- [ ] Review SMART_MONEY_IMPACT_ANALYSIS.md section 2-4 (auto trading impact) — 15 min

**Total**: ~45 min orientation

---

### Step 2: Assign Work Streams

**Backend Track**:
- Engineer A: Scoring library (calculateSmartMoneyScore.ts, classifyTier.ts)
- Engineer B: API endpoints (/api/smart-money/*)

**Frontend Track**:
- Engineer C: Page & grid component
- Engineer D: Card, filter, summary components

**QA Track**:
- QA Engineer: Create test plan from spec, then execute

---

### Step 3: Setup & Development
1. Create feature branch: `feature/smart-money-dashboard`
2. Backend: Implement scoring library first (no UI dependencies)
3. Frontend: Parallel — build page/components, mock data until API ready
4. Integration: Wire dashboard page to API endpoints
5. Testing: Unit → Integration → E2E

---

### Step 4: Code Review Checklist

**API Routes**:
- [ ] Response schema matches spec exactly
- [ ] Error cases handled (UW down, invalid symbol, etc.)
- [ ] Caching implemented correctly
- [ ] Rate limits respected

**Scoring Functions**:
- [ ] SMS calculation matches formula in spec
- [ ] Tier classification matches thresholds
- [ ] Graceful fallback for missing signals
- [ ] Unit tests cover edge cases

**UI Components**:
- [ ] Responsive design tested on mobile/tablet/desktop
- [ ] Accessibility (keyboard nav, ARIA labels)
- [ ] Buttons/modals match spec
- [ ] Loading/error states present
- [ ] Performance: <2s dashboard load

---

## 📊 KEY METRICS TO TRACK

**After Launch** (Day 1):
- Dashboard page views (% of DAU)
- Error rate on `/api/smart-money/dashboard`
- UW API error rate (rate limit hits)
- Page load time percentiles (p50, p95, p99)

**After Week 1**:
- Feature adoption (% who viewed dashboard at least once)
- Action rate (% who clicked "Add" buttons)
- Add-to-watchlist conversion: % → purchases in Watchlist detail
- Add-to-auto-trading conversion: % → successful auto trading

**After Month 1** (Phase 4):
- Tier 1 auto trading win rate vs. other sources
- Average holding time for Smart Money picks
- User engagement: repeat visitors, avg session time

---

## 💡 COMMON QUESTIONS

**Q: Will this break existing auto trading?**  
A: No. Smart Money is a new add-in source. Existing add logic unchanged. New fields optional.

**Q: What if UW API is down?**  
A: Dashboard falls back to cached/mock data with warning banner. No hard failure.

**Q: Can users add Tier 2 stocks to Auto Trading?**  
A: No. Tier 2 redirects to watchlist add. Only Tier 1 allows direct auto trading add.

**Q: How is this different from Luckmi Picks?**  
A: Picks focuses on top 3 ranked by CTS+SMS. Dashboard shows top 20-30 ranked by conviction, with more filtering/sorting options. Users can explore more candidates.

**Q: Will this be a paid feature?**  
A: Phase 1: Available to all. Phase 3+: Add-to-Auto gated behind Pro/Premium. Dashboard remains free.

**Q: When will insider/congressional signals be included?**  
A: Phase 3-4, depends on UW API availability. v1 uses options flow + dark pool proxy.

---

## 📞 SUPPORT & ESCALATION

**Questions on scoring logic?**  
→ Reference Section 2 of SMART_MONEY_SPEC.md, specifically `calculateSmartMoneyScore()` function.

**Questions on UI layout?**  
→ Reference Section 1-2 of UI_MOCKUP_GUIDE.md for exact component hierarchy.

**Questions on impact/risks?**  
→ Reference SMART_MONEY_IMPACT_ANALYSIS.md sections 2-7 for detailed breakdown.

**Questions on database schema?**  
→ Reference SMART_MONEY_SPEC.md section 2.4 or SMART_MONEY_IMPACT_ANALYSIS.md section 5.

**Blockers?**  
→ Contact product owner. Likely blockers: UW API rate limit, Supabase schema changes, design review.

---

## ✅ PRE-LAUNCH CHECKLIST

**Engineering**:
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] E2E test: dashboard → add to watchlist → verify success
- [ ] Performance: dashboard <2s load (with 20 stocks)
- [ ] Error handling: UW down, invalid symbol, DB errors
- [ ] Code review passed
- [ ] Staging deployment tested
- [ ] Feature flag: `SMART_MONEY_ENABLED=true` (can be toggled)

**Product**:
- [ ] Tier 1/2/3 criteria approved by stakeholders
- [ ] UI/UX approved by design
- [ ] Copy/messaging approved
- [ ] Help documentation drafted

**QA**:
- [ ] Test plan created and executed
- [ ] Mobile/tablet/desktop tested
- [ ] Accessibility audit passed
- [ ] Load testing passed (concurrent requests)

**Ops**:
- [ ] Monitoring configured (error rate, load time, UW API status)
- [ ] Alerting set up for critical failures
- [ ] Rollback procedure documented
- [ ] Deployment runbook created

---

## 📈 SUCCESS CRITERIA (Go/No-Go Decision)

**Technical**:
- Dashboard endpoint p95 load time: <2.5s ✅
- API error rate: <2% ✅
- UW rate limit issues: <1 per 1000 requests ✅

**Product**:
- Feature adoption (DAU viewing dashboard): >15% ✅
- Action rate (users clicking "Add"): >30% ✅
- User satisfaction (in-app survey): >4.0/5.0 ✅

**Business**:
- New auto trading entries: +20% from Smart Money source ✅
- User engagement increase: measurable ✅
- No user complaints about false signals ✅

**If all green**: Ship Phase 2 immediately. If red in any critical: Rollback & iterate.

---

## 🎓 REFERENCE FILES IN CODEBASE

**Related Existing Files** (for context):
- [app/api/unusual-whales/universe/route.ts](app/api/unusual-whales/universe/route.ts) — UW universe logic
- [app/api/luckmi-picks/route.ts](app/api/luckmi-picks/route.ts) — Current ranking (to be enhanced)
- [app/api/auto-stocks/add/route.ts](app/api/auto-stocks/add/route.ts) — Auto trading add (to be enhanced)
- [app/api/watchlist/add/route.ts](app/api/watchlist/add/route.ts) — Watchlist add (to be wrapped)
- [app/lib/evaluateAi/evaluateHelpers/getCtsForSymbol.ts](app/lib/evaluateAi/evaluateHelpers/getCtsForSymbol.ts) — CTS calculation
- [app/lib/options/types.ts](app/lib/options/types.ts) — UW data type definitions
- [app/auto/page.tsx](app/auto/page.tsx) — Auto trading page (for reference on component patterns)

---

## 📞 DECISION NEEDED

**Before starting Phase 1, please confirm:**

1. ✅ Tier thresholds approved?
   - Tier 1: CTS ≥ 65, SMS ≥ 75, bullish alignment
   - Tier 2: SMS ≥ 70 OR conviction ≥ 72
   - Tier 3: Everything else

2. ✅ Pricing strategy confirmed?
   - Phase 1: Dashboard free to all
   - Phase 3+: Add-to-Auto gated behind Pro/Premium

3. ✅ Data freshness acceptable?
   - Cache TTL: 5 min peak hours, 30 min off-hours
   - Users see "Last updated X min ago" on every card

4. ✅ Team assignment confirmed?
   - Backend lead: ?
   - Frontend lead: ?
   - QA lead: ?
   - Product owner: ?

---

**Status**: ✅ **Ready for engineering kickoff**

**Questions?** Refer to one of the three detailed specs or reach out to product.

---

*Documentation prepared May 13, 2026. Next review: After Phase 1 launch.*
