// ============================================================
// Opportunities ranking endpoint
// GET /api/options/opportunities
//
// 1. Resolve the symbol universe (dynamic UW screener with static fallback)
// 2. For each symbol, fetch flow / GEX / IV / contracts
// 2. Score each symbol for bullish and bearish opportunities
// 3. Keep only those with score >= MIN_SCORE
// 4. Sort by finalScore descending
// 5. Optionally enrich top results with AI recommendation
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  calculateOptionsScore,
  deriveLiquidityQuality,
  deriveFlowSummary,
  deriveStructureSummary,
  deriveInvalidationCondition,
} from '@/app/lib/options/calculateOptionsScore';
import { getOptionsAiRecommendation } from '@/app/lib/options/getOptionsAiRecommendation';
import type {
  OptionsOpportunity,
  UWOptionsFlowItem,
  UWNetPremiumTick,
  UWGexData,
  UWVolatilityData,
  UWContractCandidate,
  OptionDirection,
  StrategyFamily,
  DteBucket,
} from '@/app/lib/options/types';

const MIN_SCORE = 35;          // trial plan: flow-recent returns sparse data; keep display wide enough to inspect setups
const AI_ENRICH_THRESHOLD = 55; // reserve GPT enrichment for stronger setups even on the trial plan
const MAX_AI_CALLS = 5;         // rate-limit GPT calls per request
const AI_CALL_TIMEOUT_MS = 2500;
// UW trial plan limits: 120 req/min, max 3 concurrent.
// Calls are fully sequential. With 20 candidates × 6 calls = 120 total UW calls,
// EVERY inter-call gap (including the symbol-boundary gap) must be ≥ 500ms to stay
// under 120/min. At 550ms all gaps are uniform → 119 × 550ms ≈ 65s, ~110 calls/min.
// KEY: SYMBOL_FETCH_DELAY_MS must equal CALL_DELAY_MS — the old 100ms caused a burst
// at symbol boundaries (last bear-screener → next flow) that spiked to ~600 calls/min.
const CALL_DELAY_MS = 500;
const SYMBOL_FETCH_DELAY_MS = 500;
const RETRY_429_MAX_ATTEMPTS = 3;
const RETRY_429_BASE_DELAY_MS = 180;

// No hardcoded price table — we fetch real spot prices from /api/quotes at scan start.

const STATIC_UNIVERSE = [
  'NVDA', 'SPY', 'QQQ', 'AAPL', 'MSFT',
  'TSLA', 'AMZN', 'META', 'AMD', 'PLTR',
  'GOOGL', 'AVGO', 'COIN', 'NFLX', 'CRM',
];

type UniverseResponse = {
  symbols?: string[];
  source?: string;
  targetEligibleSymbols?: number;
  cachePolicy?: {
    phase?: string;
    ttlSeconds?: number;
    label?: string;
  };
};

function getBaseUrl(req: NextRequest) {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  for (let attempt = 1; attempt <= RETRY_429_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) return res.json() as Promise<T>;

      // Handle transient rate-limit responses with jittered backoff.
      if (res.status === 429 && attempt < RETRY_429_MAX_ATTEMPTS) {
        const retryAfterRaw = res.headers.get('retry-after');
        const retryAfterMs = retryAfterRaw ? Number(retryAfterRaw) * 1000 : 0;
        const jitterMs = Math.floor(Math.random() * 120);
        const backoffMs = Math.max(
          RETRY_429_BASE_DELAY_MS * Math.pow(2, attempt - 1) + jitterMs,
          retryAfterMs,
        );
        await sleep(backoffMs);
        continue;
      }

      return null;
    } catch {
      if (attempt >= RETRY_429_MAX_ATTEMPTS) return null;
      const jitterMs = Math.floor(Math.random() * 120);
      await sleep(RETRY_429_BASE_DELAY_MS + jitterMs);
    }
  }

  return null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  try {
    return await Promise.race<T | null>([
      promise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
  } catch {
    return null;
  }
}

// Pick the best long + short legs for a debit spread
function selectSpreadLegs(
  contracts: UWContractCandidate[],
  direction: OptionDirection,
  spotPrice: number,
): { longLeg: UWContractCandidate | null; shortLeg: UWContractCandidate | null } {
  const type = direction === 'bullish' ? 'call' : 'put';
    // UW screener does not reliably populate open_interest (often returns 0), so do not
    // filter on it. Filter only on strike > 0 (catches failed OCC parses) and optionType.
    const legs = contracts.filter(c => c.optionType === type && c.strike > 0);

  if (legs.length < 2) return { longLeg: null, shortLeg: null };

  // Sort by how close strike is to spot (for long leg: want near ATM)
  const sorted = [...legs].sort((a, b) =>
    Math.abs(a.strike - spotPrice) - Math.abs(b.strike - spotPrice)
  );

  const longLeg = sorted[0]; // closest to ATM

  // For short leg: want 1-3 strikes further OTM in the direction of the trade
  const furtherOtm = legs.filter(c => {
    if (direction === 'bullish') return c.strike > longLeg.strike;
    return c.strike < longLeg.strike;
  }).sort((a, b) =>
    Math.abs(Math.abs(a.strike - longLeg.strike) - (spotPrice * 0.02)) -
    Math.abs(Math.abs(b.strike - longLeg.strike) - (spotPrice * 0.02))
  );

  const shortLeg = furtherOtm[0] ?? null;
  return { longLeg, shortLeg };
}

function deriveDteBucket(expiry: string): DteBucket {
  const dte = Math.ceil((new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (dte <= 14) return '7-14';
  if (dte <= 21) return '14-21';
  if (dte <= 35) return '21-35';
  return '35-60';
}

function buildOpportunity(params: {
  symbol: string;
  direction: OptionDirection;
  flow: UWOptionsFlowItem[];
  netPremium: UWNetPremiumTick | null;
  gex: UWGexData | null;
  volData: UWVolatilityData | null;
  longLeg: UWContractCandidate;
  shortLeg: UWContractCandidate;
}): OptionsOpportunity {
  const { symbol, direction, flow, netPremium, gex, volData, longLeg, shortLeg } = params;

  const score = calculateOptionsScore({
    direction,
    netPremium,
    recentFlow: flow,
    gex,
    darkPoolLevels: [],
    volData,
    longLeg,
    shortLeg,
  });

  const strategy: StrategyFamily = direction === 'bullish'
    ? 'call_debit_spread'
    : 'put_debit_spread';

  const netDebit = Number((longLeg.ask - shortLeg.bid).toFixed(2));
  const strikeWidth = Math.abs(longLeg.strike - shortLeg.strike);
  const maxGain = Number((strikeWidth - netDebit).toFixed(2));
  const maxLoss = Math.max(netDebit, 0.01);
  const rrRatio = Number((maxGain / maxLoss).toFixed(2));

  const breakeven = direction === 'bullish'
    ? longLeg.strike + netDebit
    : longLeg.strike - netDebit;

  const flowSummary = deriveFlowSummary(direction, score.flowScore, score.flowDetail);
  const structureSummary = deriveStructureSummary(direction, score.structureScore, gex);
  const invalidation = deriveInvalidationCondition(direction, gex, longLeg.strike);

  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(); // 4h TTL

  return {
    id: crypto.randomUUID(),
    symbol,
    direction,
    strategy,
    score,
    longLeg: {
      action: 'buy',
      optionType: longLeg.optionType,
      strike: longLeg.strike,
      expiry: longLeg.expiry,
      mid: longLeg.mid,
      delta: longLeg.delta,
    },
    shortLeg: {
      action: 'sell',
      optionType: shortLeg.optionType,
      strike: shortLeg.strike,
      expiry: shortLeg.expiry,
      mid: shortLeg.mid,
      delta: shortLeg.delta,
    },
    dteBucket: deriveDteBucket(longLeg.expiry),
    netDebit,
    maxGain,
    maxLoss,
    breakeven: Number(breakeven.toFixed(2)),
    riskRewardRatio: rrRatio,
    thesis: flowSummary,
    flowSummary,
    structureSummary,
    ivRank: volData?.ivRank ?? 50,
    gexBias: gex?.gexBias ?? 'neutral',
    liquidityQuality: deriveLiquidityQuality(score.executionQualityScore),
    invalidationCondition: invalidation,
    profitTarget: Number((maxGain * 0.55).toFixed(2)),
    stopLoss: Number((netDebit * 0.50).toFixed(2)),
    status: 'active',
    createdAt: now,
    expiresAt,
  };
}

// ── Server-side scan cache & in-flight deduplication ─────────────────────────
// React StrictMode (dev) double-fires useEffect → two concurrent requests.
// The second request must await the first scan's promise rather than starting
// its own — otherwise we fire 2× UW calls and immediately hit 120/min.
//
// Cache TTL: 60 s (well within the universe cache windows).
// Production (single invocation per user navigation) is unaffected.
// ─────────────────────────────────────────────────────────────────────────────
declare global {
  // eslint-disable-next-line no-var
  var _optsCacheResult: { body: string; cachedAt: number } | undefined;
  // eslint-disable-next-line no-var
  var _optsInflight: Promise<string> | undefined;
}

const SCAN_CACHE_TTL_MS = 60_000;

async function runScan(req: NextRequest): Promise<string> {
  // If another request is already scanning, piggyback on it.
  if (globalThis._optsInflight) {
    return globalThis._optsInflight;
  }

  const promise = _executeScan(req).finally(() => {
    globalThis._optsInflight = undefined;
  });

  globalThis._optsInflight = promise;
  return promise;
}

export async function GET(req: NextRequest) {
  // Return cached result if still fresh.
  const cached = globalThis._optsCacheResult;
  if (cached && Date.now() - cached.cachedAt < SCAN_CACHE_TTL_MS) {
    return new Response(cached.body, {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Options-Cache': 'HIT' },
    });
  }

  try {
    const body = await runScan(req);
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Options-Cache': 'MISS' },
    });
  } catch (err: any) {
    console.error('[api/options/opportunities] error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function _executeScan(req: NextRequest): Promise<string> {
  try {
    const scanStartedAt = Date.now();
    const base = getBaseUrl(req);
    const hasUwKey = Boolean(process.env.UNUSUAL_WHALES_API_KEY);
    const dataMode: 'mock' | 'live_strict' = hasUwKey ? 'live_strict' : 'mock';

    let universe = STATIC_UNIVERSE;
    let universeSource = 'fallback_static';
    let universeCachePolicy: UniverseResponse['cachePolicy'] = undefined;
    let targetEligibleSymbols = STATIC_UNIVERSE.length;
    const universeStartedAt = Date.now();

    try {
      const universeRes = await fetch(`${base}/api/unusual-whales/universe`, { cache: 'no-store' });
      if (universeRes.ok) {
        const universeData: UniverseResponse = await universeRes.json();
        if (Array.isArray(universeData.symbols) && universeData.symbols.length > 0) {
          universe = [
            ...universeData.symbols,
            ...STATIC_UNIVERSE.filter((symbol) => !universeData.symbols?.includes(symbol)),
          ];
        }
        universeSource = universeData.source ?? universeSource;
        universeCachePolicy = universeData.cachePolicy;
        targetEligibleSymbols = universeData.targetEligibleSymbols ?? targetEligibleSymbols;
      }
    } catch {
      // Fall back to the static universe if discovery fails.
    }
    const universeMs = Date.now() - universeStartedAt;

    // ── 1. Fetch real spot prices for all universe symbols ──────────────────
    let liveSpotPrices: Record<string, number> = {};
    let quotesSource: 'live' | 'unavailable' = 'unavailable';
    const quotesStartedAt = Date.now();
    try {
      const quotesRes = await fetch(
        `${base}/api/quotes?symbols=${universe.join(',')}`,
        { cache: 'no-store' },
      );
      if (quotesRes.ok) {
        const rows: { symbol: string; price: string | number }[] = await quotesRes.json();
        for (const row of rows) {
          const p = Number(row.price);
          if (Number.isFinite(p) && p > 0) {
            liveSpotPrices[row.symbol] = p;
          }
        }
        if (Object.keys(liveSpotPrices).length > 0) quotesSource = 'live';
      }
    } catch {
      // quotes fetch failed — if this happens in live mode, some symbols may be skipped.
    }
    const quotesMs = Date.now() - quotesStartedAt;

    const opportunities: OptionsOpportunity[] = [];
    const skippedSymbols: { symbol: string; reason: string }[] = [];

    const symbolData: {
      symbol: string;
      flow: UWOptionsFlowItem[];
      netPremium: UWNetPremiumTick | null;
      gex: UWGexData | null;
      volData: UWVolatilityData | null;
      bullContracts: UWContractCandidate[];
      bearContracts: UWContractCandidate[];
      spotPrice: number;
      skippedReason?: string;
    }[] = [];

    // In live mode we force strict no-fallback from UW proxy routes.
    const allowMockParam = hasUwKey ? '&allowMock=0' : '';

    let eligibleSymbolCount = 0;
    const uwFetchStartedAt = Date.now();
    // Cap processing breadth so the endpoint remains responsive even when many symbols
    // are skipped due to transient contract data gaps.
    const maxSymbolsToScan = Math.min(universe.length, Math.max(targetEligibleSymbols, 15));
    for (const symbol of universe.slice(0, maxSymbolsToScan)) {
      // Sequential calls to stay under the UW trial plan's 3-concurrent limit.
      // A small gap between each call prevents per-minute rate exhaustion.
      const flow = await fetchJson<UWOptionsFlowItem[]>(`${base}/api/unusual-whales/flow?symbol=${symbol}${allowMockParam}`);
      await sleep(CALL_DELAY_MS);
      const netPremium = await fetchJson<UWNetPremiumTick>(`${base}/api/unusual-whales/net-premium?symbol=${symbol}${allowMockParam}`);
      await sleep(CALL_DELAY_MS);
      const gex = await fetchJson<UWGexData>(`${base}/api/unusual-whales/gex?symbol=${symbol}${allowMockParam}`);
      await sleep(CALL_DELAY_MS);
      const spotParam = liveSpotPrices[symbol] ? `&spotPrice=${liveSpotPrices[symbol]}` : '';
      const volData = await fetchJson<UWVolatilityData>(`${base}/api/unusual-whales/iv?symbol=${symbol}${allowMockParam}`);
      await sleep(CALL_DELAY_MS);
      // Fetch both call+put candidates in one screener request, then split by option type.
      const allContracts = await fetchJson<UWContractCandidate[]>(`${base}/api/unusual-whales/screener?symbol=${symbol}&direction=both${spotParam}${allowMockParam}`);
      const bullContracts = (allContracts ?? []).filter(c => c.optionType === 'call');
      const bearContracts = (allContracts ?? []).filter(c => c.optionType === 'put');

      const spotPrice = gex?.spotPrice || liveSpotPrices[symbol] || 0;

      let skippedReason: string | undefined;
      if (hasUwKey) {
        // Hard-skip ONLY when we literally cannot build a spread:
        //  • No valid legs in either direction  → can't construct any spread
        //  • No spot price                      → can't calculate strike distances
        //
        // net-premium / gex / iv missing → scoring functions already handle null
        // gracefully (fallback scores: flow≈45, structure≈45, volFit=50). Skipping
        // on these fields silently drops real opportunities like LEN or MRVL that
        // have full contract data but one UW endpoint returned a transient error.
        const missing: string[] = [];
        const hasBullLegs = Array.isArray(bullContracts) && bullContracts.length >= 2;
        const hasBearLegs = Array.isArray(bearContracts) && bearContracts.length >= 2;
        if (!hasBullLegs && !hasBearLegs) missing.push('no-valid-legs-either-direction');
        if (!(spotPrice > 0)) missing.push('spot-price');
        if (missing.length > 0) skippedReason = `missing ${missing.join(', ')}`;
      }

      symbolData.push({
        symbol,
        flow: flow ?? [],
        netPremium,
        gex,
        volData,
        bullContracts: bullContracts ?? [],
        bearContracts: bearContracts ?? [],
        spotPrice,
        skippedReason,
      });

      if (!skippedReason) {
        eligibleSymbolCount += 1;
      }

      await sleep(SYMBOL_FETCH_DELAY_MS);

      if (eligibleSymbolCount >= targetEligibleSymbols) {
        break;
      }
    }
    const uwFetchMs = Date.now() - uwFetchStartedAt;

    const scoringStartedAt = Date.now();
    for (const d of symbolData) {
      if (d.skippedReason) {
        skippedSymbols.push({ symbol: d.symbol, reason: d.skippedReason });
        continue;
      }

      const spotPrice = d.spotPrice > 0 ? d.spotPrice : 100;

      // -- Bullish opportunity --
      const { longLeg: bLong, shortLeg: bShort } = selectSpreadLegs(d.bullContracts, 'bullish', spotPrice);
      if (bLong && bShort) {
        const opp = buildOpportunity({
          symbol: d.symbol,
          direction: 'bullish',
          flow: d.flow,
          netPremium: d.netPremium,
          gex: d.gex,
          volData: d.volData,
          longLeg: bLong,
          shortLeg: bShort,
        });
        if (opp.score.finalScore >= MIN_SCORE && opp.maxGain > 0) {
          opportunities.push(opp);
        }
      }

      // -- Bearish opportunity --
      const { longLeg: aLong, shortLeg: aShort } = selectSpreadLegs(d.bearContracts, 'bearish', spotPrice);
      if (aLong && aShort) {
        const opp = buildOpportunity({
          symbol: d.symbol,
          direction: 'bearish',
          flow: d.flow,
          netPremium: d.netPremium,
          gex: d.gex,
          volData: d.volData,
          longLeg: aLong,
          shortLeg: aShort,
        });
        if (opp.score.finalScore >= MIN_SCORE && opp.maxGain > 0) {
          opportunities.push(opp);
        }
      }
    }
    const scoringMs = Date.now() - scoringStartedAt;

    opportunities.sort((a, b) => b.score.finalScore - a.score.finalScore);

    const toEnrich = opportunities
      .filter(o => o.score.finalScore >= AI_ENRICH_THRESHOLD)
      .slice(0, MAX_AI_CALLS);

    const aiStartedAt = Date.now();
    await Promise.all(
      toEnrich.map(async (opp) => {
        const ai = await withTimeout(getOptionsAiRecommendation(opp), AI_CALL_TIMEOUT_MS);
        if (ai) {
          opp.aiAction = ai.action;
          opp.aiReason = ai.reason;
          opp.aiConfidence = ai.confidence;
          opp.aiRiskFlags = ai.riskFlags;
        }
      })
    );
    const aiMs = Date.now() - aiStartedAt;

    const totalMs = Date.now() - scanStartedAt;
    console.info(
      `[options-opportunities] done totalMs=${totalMs} universeMs=${universeMs} quotesMs=${quotesMs} ` +
      `uwFetchMs=${uwFetchMs} scoringMs=${scoringMs} aiMs=${aiMs} symbolsScanned=${symbolData.length} ` +
      `eligibleSymbols=${symbolData.length - skippedSymbols.length} opportunities=${opportunities.length} ` +
      `aiEnriched=${toEnrich.length} dataMode=${dataMode} quotesSource=${quotesSource}`,
    );

    const body = JSON.stringify({
      opportunities,
      generatedAt: new Date().toISOString(),
      total: opportunities.length,
      dataMode,
      quotesSource,
      spotPrices: liveSpotPrices,
      scanMeta: {
        totalUniverse: symbolData.length,
        eligibleSymbols: symbolData.length - skippedSymbols.length,
        skippedSymbols,
        universe: {
          source: universeSource,
          cachePolicy: universeCachePolicy,
          symbols: universe,
          candidatesConsidered: universe.length,
          targetEligibleSymbols,
        },
      },
    });

    // Cache so concurrent / double-fire requests don't re-scan.
    globalThis._optsCacheResult = { body, cachedAt: Date.now() };
    return body;
  } catch (err: any) {
    console.error('[api/options/opportunities] _executeScan error:', err);
    throw err;
  }
}
