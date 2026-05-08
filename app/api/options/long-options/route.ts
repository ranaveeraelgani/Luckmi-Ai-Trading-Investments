// ============================================================
// Long Options scanner endpoint — Phase D
// GET /api/options/long-options
//
// Returns long_call / long_put opportunities using single-leg
// ATM/near-ATM contracts. These are higher-risk / unlimited-upside
// plays suitable for directional conviction bets.
//
// Filtering: same symbol universe as spreads, only runs when
// include_long_options = true in user prefs.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getOptionsAiRecommendation } from '@/app/lib/options/getOptionsAiRecommendation';
import type {
  OptionsOpportunity,
  UWContractCandidate,
  OptionDirection,
  StrategyFamily,
  DteBucket,
  LiquidityQuality,
} from '@/app/lib/options/types';

// ── Constants ─────────────────────────────────────────────────────────────────
const AI_ENRICH_THRESHOLD = 55;
const MAX_AI_CALLS = 5;
const CALL_DELAY_MS = 500;
const SYMBOL_BATCH_SIZE = 2;
const RETRY_429_MAX_ATTEMPTS = 3;
const RETRY_429_BASE_DELAY_MS = 180;
const TARGET_SYMBOL_SCAN_COUNT = Math.max(40, Math.min(80, Number(process.env.OPTIONS_LONG_SCAN_SYMBOLS ?? 50) || 50));
const TOP_OUTPUT_COUNT = 15;

// Target delta range for long options — near ATM for directional leverage
const DELTA_MIN = 0.30;
const DELTA_MAX = 0.65;

// Max DTE for a long option — beyond 60 we're paying too much time premium
const MAX_DTE = 60;
const MIN_DTE = 7;

// Long option P&L heuristics
// For calls: theoretical max gain is set to 2× premium (100% gain = common profit target)
// For puts:  same — capped at 2× for card display; actual max is unlimited/strike-width
const MAX_GAIN_MULTIPLIER = 2.0;  // max_gain = premium × MAX_GAIN_MULTIPLIER

const STATIC_UNIVERSE = [
  'NVDA', 'SPY', 'QQQ', 'AAPL', 'MSFT',
  'TSLA', 'AMZN', 'META', 'AMD', 'PLTR',
  'GOOGL', 'AVGO', 'COIN', 'NFLX', 'CRM',
  'INTC', 'MU', 'SMCI', 'BABA', 'UBER',
  'SHOP', 'SQ', 'PYPL', 'ADBE', 'ORCL',
  'PANW', 'SNOW', 'MDB', 'NOW', 'CRWD',
  'IWM', 'DIA', 'XLF', 'XLE', 'TLT',
  'BA', 'JPM', 'WMT', 'DIS', 'NKE',
  'MRNA', 'PFE', 'UNH', 'COST', 'CAT',
  'GE', 'F', 'GM', 'RIVN', 'SOFI',
  'HOOD', 'MSTR', 'ARM', 'DELL', 'ANET',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function getBaseUrl(req: NextRequest) {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

function fillUniverse(symbols: string[], target: number): string[] {
  const merged = [...new Set([...symbols, ...STATIC_UNIVERSE])];
  return merged.slice(0, Math.max(target, 15));
}

async function fetchJson<T>(url: string): Promise<T | null> {
  for (let attempt = 1; attempt <= RETRY_429_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) return res.json() as Promise<T>;

      if (res.status === 429 && attempt < RETRY_429_MAX_ATTEMPTS) {
        const retryAfterRaw = res.headers.get('retry-after');
        const retryAfterMs = retryAfterRaw ? Number(retryAfterRaw) * 1000 : 0;
        const jitter = Math.floor(Math.random() * 120);
        const backoff = Math.max(
          RETRY_429_BASE_DELAY_MS * Math.pow(2, attempt - 1) + jitter,
          retryAfterMs,
        );
        await sleep(backoff);
        continue;
      }
      return null;
    } catch {
      if (attempt >= RETRY_429_MAX_ATTEMPTS) return null;
      await sleep(RETRY_429_BASE_DELAY_MS + Math.floor(Math.random() * 120));
    }
  }
  return null;
}

function deriveDteBucket(dte: number): DteBucket {
  if (dte <= 14) return '7-14';
  if (dte <= 21) return '14-21';
  if (dte <= 35) return '21-35';
  return '35-60';
}

function deriveLiquidityQuality(contract: UWContractCandidate): LiquidityQuality {
  const spread = contract.ask - contract.bid;
  const mid = contract.mid;
  if (mid <= 0) return 'poor';
  const spreadPct = spread / mid;
  if (spreadPct < 0.05 && contract.openInterest > 500) return 'excellent';
  if (spreadPct < 0.10 && contract.openInterest > 100) return 'good';
  if (spreadPct < 0.20) return 'fair';
  return 'poor';
}

function hasRealDelta(contract: UWContractCandidate): boolean {
  const d = Math.abs(contract.delta ?? 0);
  return Number.isFinite(d) && d > 0;
}

// Pick the best single-leg contract for a long position:
// nearest ATM with delta in target range, sorted by open interest / liquidity
function selectLongContract(
  contracts: UWContractCandidate[],
  direction: OptionDirection,
  spotPrice: number,
): UWContractCandidate | null {
  const optionType = direction === 'bullish' ? 'call' : 'put';

  const candidates = contracts.filter(c => {
    if (c.optionType !== optionType) return false;
    if (c.strike <= 0) return false;
    if (!c.expiry) return false;

    // DTE filter
    const expMs = new Date(c.expiry).getTime() - Date.now();
    const dte = expMs / (1000 * 60 * 60 * 24);
    if (dte < MIN_DTE || dte > MAX_DTE) return false;

    // Delta filter — only enforce when real greeks are available.
    // UW screener often returns delta=0 unless greeks are hydrated.
    const absDelta = Math.abs(c.delta ?? 0);
    if (absDelta > 0 && (absDelta < DELTA_MIN || absDelta > DELTA_MAX)) return false;

    // Must have a non-zero mid price
    if ((c.mid ?? 0) <= 0) return false;

    return true;
  });

  if (candidates.length === 0) return null;

  const withRealDelta = candidates.filter(hasRealDelta);
  const pool = withRealDelta.length > 0 ? withRealDelta : candidates;

  // Sort: prefer high open interest + delta closest to 0.40 (sweet spot)
  return pool.sort((a, b) => {
    const aDeltaDist = Math.abs(Math.abs(a.delta ?? 0) - 0.40);
    const bDeltaDist = Math.abs(Math.abs(b.delta ?? 0) - 0.40);
    // Primary: delta proximity; secondary: open interest
    const deltaDiff = aDeltaDist - bDeltaDist;
    if (Math.abs(deltaDiff) > 0.05) return deltaDiff;
    return (b.openInterest ?? 0) - (a.openInterest ?? 0);
  })[0];
}

// Simple directional score for long options based on flow bias + IV rank
function scoreLongOption(params: {
  direction: OptionDirection;
  contract: UWContractCandidate;
  spotPrice: number;
}): number {
  const { contract, spotPrice } = params;
  let score = 0;

  // ── Delta quality (0-35 pts) ─────────────────────────────────────────────
  const absDelta = Math.abs(contract.delta ?? 0);
  if (absDelta > 0) {
    if (absDelta >= 0.35 && absDelta <= 0.50) score += 35;
    else if (absDelta >= 0.28 && absDelta <= 0.60) score += 26;
    else score += 8;
  } else {
    score += 22; // neutral fallback when greeks are missing
  }

  // ── Liquidity (0-40 pts) ──────────────────────────────────────────────────
  const liq = deriveLiquidityQuality(contract);
  if (liq === 'excellent') score += 40;
  else if (liq === 'good') score += 28;
  else if (liq === 'fair') score += 18;
  else score += 8;

  // ── Moneyness proximity (0-25 pts) ───────────────────────────────────────
  if (spotPrice > 0) {
    const distPct = Math.abs(contract.strike - spotPrice) / spotPrice;
    if (distPct <= 0.01) score += 25;
    else if (distPct <= 0.02) score += 18;
    else if (distPct <= 0.04) score += 10;
    else score += 4;
  } else {
    score += 8;
  }

  return Math.min(100, Math.round(score));
}

// ── GET handler ───────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const base = getBaseUrl(req);
    const hasUwKey = Boolean(process.env.UNUSUAL_WHALES_API_KEY);
    const dataMode: 'mock' | 'live_strict' = hasUwKey ? 'live_strict' : 'mock';

    // ── 1. Resolve symbol universe ─────────────────────────────────────────
    type UniverseResp = { symbols?: string[] };
    const universeData = await fetchJson<UniverseResp>(`${base}/api/unusual-whales/universe`);
    const symbols: string[] = fillUniverse(universeData?.symbols ?? [], TARGET_SYMBOL_SCAN_COUNT);

    // ── 2. Fetch spot prices ───────────────────────────────────────────────
    type QuoteRow = { symbol: string; price?: string | number };
    let spotPrices: Record<string, number> = {};
    const quotesData = await fetchJson<QuoteRow[]>(
      `${base}/api/quotes?symbols=${symbols.join(',')}`
    );
    if (Array.isArray(quotesData)) {
      for (const row of quotesData) {
        const sym = String(row?.symbol ?? '').toUpperCase();
        const price = Number(row?.price);
        if (sym && Number.isFinite(price) && price > 0) {
          spotPrices[sym] = price;
        }
      }
    }
    await sleep(CALL_DELAY_MS);

    // ── 3. Scan each symbol concurrently ──────────────────────────────────────
    const opportunities: OptionsOpportunity[] = [];

    for (let start = 0; start < symbols.length; start += SYMBOL_BATCH_SIZE) {
      const batch = symbols.slice(start, start + SYMBOL_BATCH_SIZE);

      const symbolResults = await Promise.allSettled(
        batch.map(async (symbol) => {
        const spotPrice = spotPrices[symbol] ?? 0;
        if (spotPrice <= 0) return [];

        const sym = encodeURIComponent(symbol.toUpperCase());

        // Keep UW request pressure low for long-only mode: fetch only screener
        // contracts per symbol (single UW endpoint instead of three).
        const [contractsRes] = await Promise.allSettled([
          fetchJson<UWContractCandidate[]>(
            `${base}/api/unusual-whales/screener?symbol=${sym}&direction=both&allowMock=0&spotPrice=${spotPrice}`
          ),
        ]);

        const contracts = contractsRes.status === 'fulfilled' && Array.isArray(contractsRes.value)
          ? (contractsRes.value as UWContractCandidate[])
          : [];

        if (contracts.length === 0) return [];

        const symbolOpps: OptionsOpportunity[] = [];

      // ── Determine direction from net premium / flow bias ──────────────
        const directions: OptionDirection[] = ['bullish', 'bearish'];
        for (const direction of directions) {
          const contract = selectLongContract(contracts, direction, spotPrice);
          if (!contract) continue;

          const score = scoreLongOption({
            direction,
            contract,
            spotPrice,
          });

          const strategy: StrategyFamily = direction === 'bullish' ? 'long_call' : 'long_put';
          const premium = contract.mid;                   // cost per share
          const maxLoss = premium;                        // total risk per share
          const maxGain = premium * MAX_GAIN_MULTIPLIER;  // theoretical target (2× premium)
          const netDebit = premium;

          // Breakeven: for calls = strike + premium; for puts = strike - premium
          const breakeven = direction === 'bullish'
            ? contract.strike + premium
            : contract.strike - premium;

          const expMs = new Date(contract.expiry).getTime() - Date.now();
          const dte = Math.round(expMs / (1000 * 60 * 60 * 24));
          const dteBucket = deriveDteBucket(dte);
          const liquidityQuality = deriveLiquidityQuality(contract);
          const ivAvailable = Number.isFinite(contract.impliedVolatility) && Number(contract.impliedVolatility) > 0;
          const ivRank = ivAvailable
            ? Math.max(0, Math.min(100, Math.round(Number(contract.impliedVolatility) * 100)))
            : 50;
          const volFitScore = ivAvailable
            ? (ivRank < 30 ? 80 : ivRank < 50 ? 55 : 30)
            : 50;
          const hasDelta = hasRealDelta(contract);
          const deltaLabel = hasDelta ? Math.abs(Number(contract.delta)).toFixed(2) : 'n/a';

          const thesis = direction === 'bullish'
            ? `${symbol} long call at $${contract.strike} — delta ${deltaLabel} | IV rank ${ivRank}`
            : `${symbol} long put at $${contract.strike} — delta ${deltaLabel} | IV rank ${ivRank}`;

          const now = new Date();
          const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

          const opp: OptionsOpportunity = {
            id: `${symbol}-${strategy}-${contract.strike}-${contract.expiry}`,
            symbol,
            direction,
            strategy,
            score: {
              flowScore: 50,
              structureScore: 50, // single-leg — no spread structure scoring
              volatilityFitScore: volFitScore,
              executionQualityScore: liquidityQuality === 'excellent' ? 90 : liquidityQuality === 'good' ? 70 : 40,
              finalScore: score,
              flowDetail: { dataAvailable: 0, neutralApplied: 1 },
              structureDetail: { dataAvailable: 1 },
              volatilityDetail: { dataAvailable: ivAvailable ? 1 : 0, neutralApplied: ivAvailable ? 0 : 1 },
              executionDetail: { dataAvailable: 1, liquidityQuality: liquidityQuality === 'excellent' ? 4 : liquidityQuality === 'good' ? 3 : liquidityQuality === 'fair' ? 2 : 1 },
            },
            longLeg: {
              action: 'buy',
              optionType: contract.optionType,
              strike: contract.strike,
              expiry: contract.expiry,
              mid: contract.mid,
              delta: contract.delta,
            },
            // shortLeg intentionally absent — single-leg position
            dteBucket,
            netDebit,
            maxGain,
            maxLoss,
            breakeven,
            riskRewardRatio: maxGain / maxLoss,
            thesis,
            invalidationCondition: direction === 'bullish'
              ? `${symbol} breaks below $${(spotPrice * 0.97).toFixed(0)} or premium loses 50%`
              : `${symbol} breaks above $${(spotPrice * 1.03).toFixed(0)} or premium loses 50%`,
            profitTarget: premium * 1.5,   // exit at 150% premium (50% gain)
            stopLoss: premium * 0.50,      // stop at 50% loss of premium
            flowSummary: `${direction === 'bullish' ? 'call' : 'put'} contract-quality setup`,
            structureSummary: `Single-leg ${strategy.replace('_', ' ')} — ${dte}d to expiry · spot ${spotPrice.toFixed(2)}`,
            ivRank,
            gexBias: 'neutral',
            liquidityQuality,
            status: 'active',
            createdAt: now.toISOString(),
            expiresAt,
          };

          symbolOpps.push(opp);
        }
          return symbolOpps;
        })
      );

      for (const result of symbolResults) {
        if (result.status === 'fulfilled') {
          opportunities.push(...result.value);
        }
      }

      const hasMore = start + SYMBOL_BATCH_SIZE < symbols.length;
      if (hasMore) {
        await sleep(CALL_DELAY_MS);
      }
    }

    // ── 4. Sort by score ────────────────────────────────────────────────────
    opportunities.sort((a, b) => b.score.finalScore - a.score.finalScore);
    const topOpportunities = opportunities.slice(0, TOP_OUTPUT_COUNT);

    // ── 5. AI enrichment for top results ───────────────────────────────────
    let aiCallCount = 0;
    for (const opp of topOpportunities) {
      if (aiCallCount >= MAX_AI_CALLS) break;
      if (opp.score.finalScore < AI_ENRICH_THRESHOLD) break;

      try {
        const ai = await getOptionsAiRecommendation(opp);
        if (ai) {
          opp.aiReason = ai.reason;
          opp.aiAction = ai.action;
          opp.aiConfidence = ai.confidence;
          opp.aiRiskFlags = ai.riskFlags;
          aiCallCount++;
        }
      } catch {
        // Non-fatal — continue without AI enrichment
      }
    }

    return NextResponse.json({
      opportunities: topOpportunities,
      count: topOpportunities.length,
      totalCandidates: opportunities.length,
      scannedSymbols: symbols.length,
      dataMode,
      source: 'long-options-scanner',
    });
  } catch (err: any) {
    console.error('[long-options] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
