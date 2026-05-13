# Smart Money Dashboard — UI Mockup & Visual Guide

**Last Updated**: May 13, 2026

---

## 1. DASHBOARD PAGE OVERVIEW

### Full-Width Desktop Layout (1920px)

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    LUCKMI AI TRADING                                        │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ Home | Dashboard | Auto Trading | Options | Smart Money | Watchlist | Reports | Profile   │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                             │
│   SMART MONEY DASHBOARD                                          ⚙️ Settings | ? Help     │
│   "Track institutional flows and make informed trading decisions"                         │
│                                                                                             │
│ ┌─────────────────────────────────────────────────────────────────────────────────────┐   │
│ │ FILTERS & SORT                                                      [Refresh] [+ Add] │   │
│ │                                                                                       │   │
│ │ Show:  ☐ All  ☑ Tier 1 Only  ☐ Tier 2 Only  ☐ Tier 3 Only                         │   │
│ │ Min CTS: [50────────●─────100]  Min SMS: [60──────●─────100]                        │   │
│ │ Sort by: [Conviction ▼]  Display: [20 per page ▼]                                  │   │
│ │                                                                                       │   │
│ └─────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                             │
│ ┌─────────────────────────────────────────────────────────────────────────────────────┐   │
│ │ SUMMARY METRICS                                                                     │   │
│ │  📊 Tier 1 (Ready for Auto Trading): 7 stocks                                       │   │
│ │  📈 Tier 2 (Monitor in Watchlist): 14 stocks                                        │   │
│ │  ℹ️  Tier 3 (Informational): 5 stocks                                               │   │
│ │  🔄 Last updated: 2 min ago  📡 Data freshness: 4 min                              │   │
│ └─────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                             │
│ ┌─ TIER 1 STOCKS ──────────────────────────────────────────────────────────────────────┐  │
│ │                                                                                       │  │
│ │ ┌────────────────────────────────┐ ┌────────────────────────────────┐              │  │
│ │ │ NVDA              [TIER 1] ↑  │ │ META              [TIER 1] ↑   │              │  │
│ │ │ Auto Trading Ready  Updated 2m│ │ Auto Trading Ready Updated 3m  │              │  │
│ │ ├────────────────────────────────┤ ├────────────────────────────────┤              │  │
│ │ │ Final Conviction: 83/100 ━━━ │ │ Final Conviction: 81/100 ━━━  │              │  │
│ │ │ • CTS: 78          Bullish ✓  │ │ • CTS: 76          Bullish ✓  │              │  │
│ │ │ • Smart Money: 86  Bullish ✓  │ │ • Smart Money: 85  Bullish ✓  │              │  │
│ │ ├────────────────────────────────┤ ├────────────────────────────────┤              │  │
│ │ │ SIGNALS                         │ │ SIGNALS                         │              │  │
│ │ │ • Bullish call sweeps (125M)   │ │ • Heavy put buyers (89M)       │              │  │
│ │ │ • Dark pool GEX: -850M (pin)   │ │ • GEX negative support 880     │              │  │
│ │ │ • IV Rank 28% (favorable)      │ │ • IV Rank 32% (favorable)      │              │  │
│ │ │ • Daily CTS 80, 15m CTS 76     │ │ • Daily CTS 75, 15m CTS 77     │              │  │
│ │ ├────────────────────────────────┤ ├────────────────────────────────┤              │  │
│ │ │ "NVDA is seeing strong         │ │ "META accumulation detected    │              │  │
│ │ │  institutional accumulation    │ │  through dark pool blocks and   │              │  │
│ │ │  through call sweeps and dark  │ │  call buying. Technical and     │              │  │
│ │ │  pool pinning. Technical setup │ │  smart money align bullish."    │              │  │
│ │ │  is improving." (Confidence 88%)│ │ (Confidence 85%)               │              │  │
│ │ ├────────────────────────────────┤ ├────────────────────────────────┤              │  │
│ │ │ [+ Add to Watchlist]           │ │ [+ Add to Watchlist]           │              │  │
│ │ │ [→ Add to Auto Trading] [...]  │ │ [→ Add to Auto Trading] [...]  │              │  │
│ │ └────────────────────────────────┘ └────────────────────────────────┘              │  │
│ │                                                                                       │  │
│ │ ┌────────────────────────────────┐ ┌────────────────────────────────┐              │  │
│ │ │ TSM               [TIER 1] ↑  │ │ PLTR              [TIER 1] ↑  │              │  │
│ │ │ Auto Trading Ready  Updated 4m│ │ Auto Trading Ready  Updated 1m │              │  │
│ │ ├────────────────────────────────┤ ├────────────────────────────────┤              │  │
│ │ │ Final Conviction: 79/100 ━━  │ │ Final Conviction: 77/100 ━━   │              │  │
│ │ │ • CTS: 71          Mixed       │ │ • CTS: 68          Bullish ✓  │              │  │
│ │ │ • Smart Money: 80  Bullish ✓  │ │ • Smart Money: 79  Bullish ✓  │              │  │
│ │ ├────────────────────────────────┤ ├────────────────────────────────┤              │  │
│ │ │ SIGNALS                         │ │ SIGNALS                         │              │  │
│ │ │ • Mixed flow activity          │ │ • Ask-side call activity       │              │  │
│ │ │ • Net premium +1.2M (bullish)  │ │ • Net premium +850K (bullish)  │              │  │
│ │ │ • IV Rank 45% (neutral)        │ │ • IV Rank 38% (favorable)      │              │  │
│ │ ├────────────────────────────────┤ ├────────────────────────────────┤              │  │
│ │ │ [+ Add to Watchlist]           │ │ [+ Add to Watchlist]           │              │  │
│ │ │ [→ Add to Auto Trading] [...]  │ │ [→ Add to Auto Trading] [...]  │              │  │
│ │ └────────────────────────────────┘ └────────────────────────────────┘              │  │
│ │                                                                                       │  │
│ │ ┌────────────────────────────────┐ ┌────────────────────────────────┐              │  │
│ │ │ AMD               [TIER 1] ↑  │ │ AVGO              [TIER 1] ↑  │              │  │
│ │ │ Auto Trading Ready  Updated 1m│ │ Auto Trading Ready  Updated 2m │              │  │
│ │ └────────────────────────────────┘ └────────────────────────────────┘              │  │
│ │ ... (7 total Tier 1 stocks)                                                         │  │
│ │                                                                                       │  │
│ └─────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                             │
│ ┌─ TIER 2 STOCKS (WATCHLIST CANDIDATES) ────────────────────────────────────────────────┐  │
│ │ [Hide] Show top 3 / [Show All]  14 stocks total                                     │  │
│ │                                                                                       │  │
│ │ ┌────────────────────────────────┐ ┌────────────────────────────────┐              │  │
│ │ │ COIN              [TIER 2] ⚠️  │ │ SHOP              [TIER 2] ⚠️ │              │  │
│ │ │ Watchlist Monitor  Updated 5m │ │ Watchlist Monitor  Updated 3m  │              │  │
│ │ ├────────────────────────────────┤ ├────────────────────────────────┤              │  │
│ │ │ Final Conviction: 72/100 ━━  │ │ Final Conviction: 70/100 ━━   │              │  │
│ │ │ • CTS: 58          Weak        │ │ • CTS: 60          Weak        │              │  │
│ │ │ • Smart Money: 78  Bullish ✓  │ │ • Smart Money: 75  Bullish ✓  │              │  │
│ │ ├────────────────────────────────┤ ├────────────────────────────────┤              │  │
│ │ │ "Strong smart money signal but │ │ "Technical setup needs          │              │  │
│ │ │  CTS needs confirmation."      │ │  improvement. Smart money       │              │  │
│ │ │                                 │ │  shows building interest."      │              │  │
│ │ │ [+ Add to Watchlist]           │ │ [+ Add to Watchlist]           │              │  │
│ │ │ [→ Add to Auto Trading] [...]  │ │ [→ Add to Auto Trading] [...]  │              │  │
│ │ └────────────────────────────────┘ └────────────────────────────────┘              │  │
│ │                                                                                       │  │
│ │ ... (14 total Tier 2 stocks)                                                        │  │
│ │                                                                                       │  │
│ └─────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. INDIVIDUAL CARD COMPONENT BREAKDOWN

### Expanded Card View (Click "..." for full details)

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ NVDA                              [TIER 1] ★ Auto Trading Ready    Updated 2m  │
│ Stock price: $897.50  | 52w High: $975 | 52w Low: $650                        │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│ CONVICTION BREAKDOWN                                                           │
│                                                                                │
│ Final Conviction Score: 83/100                                                 │
│ ┌─────────────────────────────────────────────────────────────────────┐       │
│ │ 0%                                              100%                │       │
│ │ ████████████████████████████████████████████░░░░░░░░░░░░░░░░░░░░│       │
│ │           ↑                                   ↑                     │       │
│ │         Current                            Max                     │       │
│ └─────────────────────────────────────────────────────────────────────┘       │
│                                                                                │
│ ┌─ TECHNICAL SCORES ───────────────────────────────────────────────────────┐ │
│ │ Final CTS:      78/100 ━━━━━━━━━━━━━━━━━━━   [Bullish Confirmed]     │ │
│ │ Daily CTS:      80/100 ━━━━━━━━━━━━━━━━━━   [Higher timeframe]     │ │
│ │ 15m CTS:        76/100 ━━━━━━━━━━━━━━━━   [Timing layer]           │ │
│ │ Alignment:      Bullish Confirmed ✓         [Daily + 15m aligned]  │ │
│ │ RSI:            58 (neutral zone)                                   │ │
│ │ MACD:           +0.45 (bullish divergence)                         │ │
│ │ Support:        $880 (dark pool pin)                               │ │
│ │ Resistance:     $920 (gamma wall)                                  │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                                │
│ ┌─ SMART MONEY SCORES ─────────────────────────────────────────────────────┐ │
│ │ Smart Money Score:      86/100 ━━━━━━━━━━━━━━━━━━━   [Strong]      │ │
│ │ • Options Flow Score:   85/100 ━━━━━━━━━━━━━━━━━━   [Bullish]     │ │
│ │ • Dark Pool Proxy:      88/100 ━━━━━━━━━━━━━━━━━━   [Accum.]      │ │
│ │ • Structure Score:      82/100 ━━━━━━━━━━━━━━━━   [Support]      │ │
│ │ • Volatility Score:     78/100 ━━━━━━━━━━━━━━━   [Favorable]    │ │
│ │                                                                   │ │
│ │ Data Availability:  Flow ✓ | GEX ✓ | Net Premium ✓ | IV ✓      │ │
│ │ (All 4 sources available → 100% confidence in SMS)              │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                                │
│ ┌─ FLOW SIGNALS ───────────────────────────────────────────────────────────┐ │
│ │ Bullish Call Sweeps:  5 contracts, 125M premium, ask-side dominant    │ │
│ │ Bullish Put Activity: 1 contract, 45M premium (protective)            │ │
│ │ Net Premium Bias:     +2,150,000 (calls > puts) — Bullish ✓           │ │
│ │ Recent Trend:         Accelerating in last 30 min, 3 fresh sweeps     │ │
│ │                                                                       │ │
│ │ 💡 INTERPRETATION: Heavy ask-side call buying signals institutional    │ │
│ │    positioning ahead of breakout. Minimal put hedging = conviction.   │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                                │
│ ┌─ DARK POOL & STRUCTURE ─────────────────────────────────────────────────┐ │
│ │ GEX Status:           NEGATIVE (Bullish institutional accumulation)    │ │
│ │ Total GEX:            -850,000,000 (magnitude of conviction)           │ │
│ │ GEX Bias:             NEGATIVE (-850M) = Buyers in control            │ │
│ │                                                                       │ │
│ │ Key Strike Levels (GEX exposure by strike):                           │ │
│ │   $900 (ATM):        -250M GEX   ← Highest gamma wall, pinning     │ │
│ │   $920 (+2.5%):      -180M GEX   ← Secondary resistance             │ │
│ │   $880 (-1.95%):     +120M GEX   ← Support floor                    │ │
│ │   $950 (+5.85%):     -90M GEX    ← Potential target                 │ │
│ │                                                                       │ │
│ │ Term Structure:       CONTANGO (normal, no backwardation stress)      │ │
│ │ Gamma Regime:         Low gamma at ATM = smooth move likely          │ │
│ │                                                                       │ │
│ │ 💡 INTERPRETATION: Negative GEX near ATM + low gamma = institutions   │ │
│ │    are long and driving the market. Look for breakout above $900.     │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                                │
│ ┌─ VOLATILITY CONTEXT ──────────────────────────────────────────────────────┐ │
│ │ IV Rank:              28/100 (Low — favorable for entry) ✓             │ │
│ │ IV Percentile:        22/100 (Historical IV context)                   │ │
│ │ ATM Implied Vol:      32% (relative to 52w avg: 38%)                  │ │
│ │ Term Structure:       CONTANGO (near-term < far-term) ✓               │ │
│ │                                                                       │ │
│ │ 💡 INTERPRETATION: Low IV = good premium entry point. Contango term   │ │
│ │    structure = normal market. Room for vol expansion on breakout.     │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                                │
│ ┌─ AI NARRATIVE (Confidence: 88%) ─────────────────────────────────────────┐ │
│ │                                                                       │ │
│ │ NVDA is showing strong institutional accumulation signals across    │ │
│ │ multiple dimensions. The technical setup (Final CTS 78) combines    │ │
│ │ a confirmed bullish daily trend (80 CTS) with clean 15m timing     │ │
│ │ (76 CTS). Smart money indicators reinforce this:                   │ │
│ │                                                                       │ │
│ │ 1. Options flow is heavily skewed bullish with multiple large call │ │
│ │    sweeps ($125M premium) on the ask side, indicating aggressive   │ │
│ │    buyer positioning ahead of a likely move higher.                │ │
│ │                                                                       │ │
│ │ 2. Dark pool GEX is deeply negative (-850M), with pinning activity │ │
│ │    near $900 strike. This suggests institutional longs are in      │ │
│ │    control and defending key levels.                              │ │
│ │                                                                       │ │
│ │ 3. Volatility is historically low (IV Rank 28%) with term          │ │
│ │    structure in contango, creating an attractive risk/reward       │ │
│ │    setup for directional moves.                                    │ │
│ │                                                                       │ │
│ │ RECOMMENDATION: NVDA is a Tier 1 candidate for auto trading.       │ │
│ │ Consider adding with 5-10% allocation. Target $920-950 with        │ │
│ │ stop at $875 (below $880 support). Let the institutional buying    │ │
│ │ power drive the move.                                              │ │
│ │                                                                       │ │
│ │ KEY RISKS: Immediate earnings (check calendar), broader market     │ │
│ │ reversal (watch SPY), or sudden vol spike could invalidate setup.  │ │
│ │                                                                       │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                                │
├────────────────────────────────────────────────────────────────────────────────┤
│ [+ Add to Watchlist]     [→ Add to Auto Trading]     [View in Stock Detail]   │
│ [< Back to Dashboard]                                                         │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. COLLAPSED CARD VIEW (Default on Dashboard)

```
┌─────────────────────────────────────────────────────┐
│ NVDA              [TIER 1] ★            Updated 2m ↻ │
├─────────────────────────────────────────────────────┤
│ Final Conviction:    83/100  ━━━━━━━━━━━━━ Strong  │
│ • CTS: 78            Bullish ✓                      │
│ • Smart Money: 86    Bullish ✓                      │
├─────────────────────────────────────────────────────┤
│ SIGNALS                                             │
│ • Bullish call sweeps: 125M premium, ask-side      │
│ • Dark pool GEX: -850M (institutional long)        │
│ • IV Rank: 28% (favorable entry)                   │
│ • Daily CTS 80 + 15m CTS 76 aligned bullish        │
├─────────────────────────────────────────────────────┤
│ "NVDA is seeing strong institutional accumulation  │
│  through call sweeps and dark pool pinning. Tech   │
│  setup is improving." (Confidence: 88%)            │
│                                                     │
│ [Read More ▼]                                      │
├─────────────────────────────────────────────────────┤
│ [+ Add to Watchlist]  [→ Add to Auto Trading] [...] │
└─────────────────────────────────────────────────────┘
```

---

## 4. MOBILE VIEW (375px - 812px)

### Dashboard Mobile View

```
┌──────────────────────────────┐
│ ≡ Menu | Smart Money | ⋮     │
├──────────────────────────────┤
│                              │
│ SMART MONEY DASHBOARD        │
│ "Track institutional flows"  │
│                              │
├──────────────────────────────┤
│ FILTERS                      │
│ Tier: [All ▼]               │
│ Min CTS: [50] Min SMS: [60]  │
│ [Apply Filters]              │
├──────────────────────────────┤
│ SUMMARY                      │
│ 📊 Tier 1: 7                 │
│ 📈 Tier 2: 14                │
│ ℹ️  Tier 3: 5                 │
├──────────────────────────────┤
│ [NVDA CARD]                  │
│ ┌──────────────────────────┐ │
│ │ NVDA  [TIER 1]  Updated  │ │
│ │ Conviction: 83/100 ━━━   │ │
│ │ CTS: 78 | SMS: 86        │ │
│ ├──────────────────────────┤ │
│ │ • Call sweeps: 125M      │ │
│ │ • GEX: -850M (bullish)   │ │
│ │ • IV Rank: 28%           │ │
│ │ • Daily + 15m aligned    │ │
│ ├──────────────────────────┤ │
│ │ "Strong institutional... │ │
│ │ [Read More ▼]            │ │
│ ├──────────────────────────┤ │
│ │ [+ Watchlist]            │ │
│ │ [→ Auto Trading]         │ │
│ └──────────────────────────┘ │
│                              │
│ [META CARD]                  │
│ ┌──────────────────────────┐ │
│ │ META  [TIER 1]  Updated  │ │
│ │ Conviction: 81/100 ━━━   │ │
│ ...                          │
│                              │
│ [Show More]                  │
│                              │
└──────────────────────────────┘
```

---

## 5. SCORE VISUALIZATION COMPONENTS

### Score Bar Component

```
Label: "CTS Score"
Value: 78/100
Visual Bar: ━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░░
           [████████████████████░░░░░░]  78%

Color coding:
- Green (70+):  Bullish strong
- Yellow (50-69): Mixed/neutral
- Red (0-49):  Bearish weak
```

### Tier Badge Component

```
┌───────────────────────┐
│ [TIER 1] ★            │  Green background, star icon
│ Auto Trading Ready    │  Subtext
└───────────────────────┘

┌───────────────────────┐
│ [TIER 2] ⚠️            │  Yellow background, warning icon
│ Watchlist Monitor     │  Subtext
└───────────────────────┘

┌───────────────────────┐
│ [TIER 3] ℹ️            │  Blue background, info icon
│ Informational         │  Subtext
└───────────────────────┘
```

### Signal Pills Component

```
Individual pills with icons:

[✓ Bullish Flows]     [✓ Dark Pool Accum]    [✓ Low IV]
[✗ Bearish Flows]     [ℹ️  Mixed GEX]        [⚠️  High IV]

Color:
- Green: Bullish confirmation
- Yellow: Neutral/mixed
- Red: Bearish signal
```

---

## 6. MODALS & INTERACTIVE FLOWS

### Add to Watchlist Modal

```
┌─────────────────────────────────────────────────┐
│ Add NVDA to Watchlist?                      ✕   │
├─────────────────────────────────────────────────┤
│                                                 │
│ Symbol:  NVDA                                   │
│ Price:   $897.50                                │
│ Smart Money Score:  86/100  ━━━━━━━━━━━━  │
│ Tier:    Tier 1 — Auto Trading Candidate       │
│                                                 │
│ This stock will be added to your watchlist and │
│ tracked for future opportunities. You can add  │
│ to Auto Trading later from the watchlist.      │
│                                                 │
├─────────────────────────────────────────────────┤
│ [Cancel]     [Add to Watchlist]                │
└─────────────────────────────────────────────────┘

→ Success Toast (top-right):
   "✓ NVDA added to watchlist"
```

### Add to Auto Trading Modal (Tier 1 Only)

```
┌──────────────────────────────────────────────────┐
│ Add NVDA to Auto Trading?                    ✕  │
├──────────────────────────────────────────────────┤
│                                                  │
│ Symbol:  NVDA                                    │
│ Tier:    Tier 1 — Auto Trading Candidate       │
│ Smart Money Score:  86/100  ━━━━━━━━━━━━  │
│ CTS Score:        78/100  ━━━━━━━━━━    │
│                                                  │
│ CONFIGURATION                                   │
│ Allocation (%):         [5_______]  5%         │
│ Compound Profits:       [☑ Enabled]            │
│ Rinse & Repeat:         [☑ Enabled]            │
│ Max Repeats:            [5_______]             │
│                                                  │
│ This Tier 1 stock meets auto trading criteria.  │
│ It will be added to your portfolio immediately │
│ once you confirm. Your settings apply.          │
│                                                  │
├──────────────────────────────────────────────────┤
│ [Cancel]    [Add to Auto Trading]               │
└──────────────────────────────────────────────────┘

→ Success Toast:
   "✓ NVDA added to Auto Trading (5% allocation)"
   → Auto-redirect to Auto Trading page
```

### Tier 2 Stock Modal (Redirect to Watchlist)

```
┌──────────────────────────────────────────────────┐
│ COIN is a Tier 2 Stock                      ✕  │
├──────────────────────────────────────────────────┤
│                                                  │
│ Smart Money: 78/100 ✓ (Strong signal)          │
│ CTS Score: 58/100 ⚠️  (Needs confirmation)     │
│                                                  │
│ TIER 2 RECOMMENDATION:                          │
│ This stock shows strong smart money signals but │
│ technical setup needs to confirm. We recommend  │
│ adding to your Watchlist first, then moving to  │
│ Auto Trading once CTS improves.                 │
│                                                  │
├──────────────────────────────────────────────────┤
│ [Close]  [→ Add to Watchlist]  [Learn More]    │
└──────────────────────────────────────────────────┘
```

---

## 7. ACTION RESULT FLOWS

### Successful Add to Watchlist

```
1. User clicks [+ Add to Watchlist]
   ↓
2. Modal appears with confirmation
   ↓
3. User clicks [Add to Watchlist]
   ↓
4. POST /api/smart-money/actions/add-to-watchlist
   ↓
5. Success response + event logged
   ↓
6. Toast: "✓ NVDA added to watchlist"
   ↓
7. Card button disabled/grayed: "Already in watchlist ✓"
```

### Successful Add to Auto Trading (Tier 1)

```
1. User clicks [→ Add to Auto Trading]
   ↓
2. Config modal appears
   ↓
3. User adjusts allocation, confirms settings
   ↓
4. POST /api/smart-money/actions/add-to-auto-trading
   ↓
5. Success response + event logged
   ↓
6. Toast: "✓ NVDA added to Auto Trading (5% allocation)"
   ↓
7. Optional: Auto-redirect to /app/auto with new position highlighted
```

### Failed Add (Already Exists)

```
User clicks [+ Add to Watchlist] on NVDA

Response Error: 409 Conflict
"NVDA is already in your watchlist"

→ Error Toast (top-right, 4s):
   "⚠️ NVDA is already in your watchlist"

→ Card button updates to:
   "✓ In Watchlist" (disabled/grayed)
```

---

## 8. LOADING & ERROR STATES

### Initial Dashboard Load

```
┌─────────────────────────────────────────────────────────────┐
│ SMART MONEY DASHBOARD                                       │
│                                                             │
│ FILTERS & SORT                           [Loading...] ⟳   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Loading Smart Money data...                                 │
│ ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 35% Complete     │
│                                                             │
│ Fetching: UW universe, CTS scores, AI narratives...         │
│                                                             │
└─────────────────────────────────────────────────────────────┘

(Estimated 2-3s for full dashboard load with 20 stocks)
```

### Card-Level Loading (AI Narrative Async)

```
┌─────────────────────────────────────────────────┐
│ NVDA              [TIER 1] ★            2m ago │
├─────────────────────────────────────────────────┤
│ Final Conviction: 83/100 ━━━━━━━━━━━━         │
│ • CTS: 78 | SMS: 86                            │
├─────────────────────────────────────────────────┤
│ SIGNALS                                         │
│ • Bullish call sweeps: 125M                    │
│ • Dark pool GEX: -850M                         │
│ • IV Rank: 28%                                 │
├─────────────────────────────────────────────────┤
│ "Generating AI narrative... ⟳"                 │
│ [Read More ▼]                                  │
└─────────────────────────────────────────────────┘

(Loads within 3-5s per card, cached after first load)
```

### API Failure / Fallback

```
┌─────────────────────────────────────────────────────────────┐
│ SMART MONEY DASHBOARD                                       │
│ ⚠️ UW API Temporarily Unavailable                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ We're showing cached data from 2 hours ago. Smart Money    │
│ scores may be slightly outdated, but CTS and tier ratings  │
│ remain accurate.                                            │
│                                                             │
│ [Retry] [Dismiss]                                           │
│                                                             │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ NVDA (CACHED DATA - 2h old)                           │ │
│ │ Conviction: 83/100 (from cache)                       │ │
│ │ ... (rest of card normal)                             │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                             │
│ ... (other cards)                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. RESPONSIVE BREAKPOINTS

### Tablet (768px - 1024px)

- Cards displayed as 2-column grid
- Filters collapse into dropdown menu
- Card text size slightly reduced
- Action buttons stack vertically

### Laptop (1200px+)

- Cards displayed as 3-column grid
- Full filter toolbar visible
- Side panel for tier summary
- Full card expansion available

---

## 10. ACCESSIBILITY & KEYBOARD NAVIGATION

**Keyboard shortcuts**:
- `?` — Open help modal
- `r` — Refresh dashboard
- `f` — Focus filter bar
- `↵` on card — Toggle expand
- `Tab` — Navigate between cards and buttons

**Screen reader support**:
- All score bars have `aria-label` with current/max values
- Tier badges have descriptive labels
- Signal pills have title attributes
- Modals have proper focus management

---

## 11. ANIMATION & MICRO-INTERACTIONS

**Card hover**:
```
On hover:
- Slight scale up (102%)
- Box shadow expands
- Background color subtle shift
- Action buttons change color
- Duration: 200ms cubic-bezier ease
```

**Score bar fill animation**:
```
On mount:
- Bar fills from 0% to final value
- Duration: 800ms
- Easing: cubic-bezier(0.34, 1.56, 0.64, 1)
- Follows by number counter animation
```

**Toast notification**:
```
Enter: Slide in from top-right, 300ms ease-out
Display: 4 seconds
Exit: Slide out to top-right, 300ms ease-in
```

**Modal appearance**:
```
Background: Fade in, 150ms
Dialog: Scale + fade in, 200ms, cubic-bezier ease
```

---

## 12. COLOR SCHEME & DESIGN TOKENS

**Existing Luckmi colors** (match current app):
- Primary: `#16C784` (Emerald)
- Background: `#11151C` (Dark)
- Border: `#FFFFFF/5` (White 5% opacity)
- Text: `#FFFFFF` (White)
- Muted: `#9CA3AF` (Gray)

**Smart Money specific**:
- Tier 1 badge: `bg-emerald-500/10` + `border-emerald-500/30`
- Tier 2 badge: `bg-amber-500/10` + `border-amber-500/30`
- Tier 3 badge: `bg-blue-500/10` + `border-blue-500/30`
- Score bar (bullish): `bg-emerald-500` gradient
- Score bar (bearish): `bg-red-500` gradient
- Score bar (neutral): `bg-yellow-500` gradient

---

**Design System**: Tailwind CSS with custom extensions matching existing Luckmi UI library.

**Component Library**: React + TypeScript with Shadcn/UI or Headless UI patterns (consistent with existing /components).

---

End of UI Mockup Guide
