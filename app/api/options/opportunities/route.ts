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
import {
  uwGetAdaptiveDelayMs,
  uwGetTelemetrySnapshot,
  type UwTelemetrySnapshot,
} from '@/app/lib/uw/client';
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
const GREEKS_DELAY_MS = 200;   // shorter gap for per-contract greeks calls (4 per symbol)
const RETRY_429_MAX_ATTEMPTS = 3;
const RETRY_429_BASE_DELAY_MS = 180;
const SHORTLIST_PER_SIDE = 12;

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

type GreeksPatch = {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  iv: number;
  bid: number;
  ask: number;
  mid: number;
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

// Minimum DTE for any leg — hard floor to avoid expiry-weekend edge cases.
const MIN_LEG_DTE = 7;
// Minimum absolute delta for the long leg when real greeks are available.
// Legs with |delta| < 0.20 are too far OTM: high risk of expiring worthless.
// When delta === 0 (greeks not yet hydrated / basic plan 404) we skip this gate
// so the spread is still built and scored (execution score will penalise it).
const MIN_LONG_LEG_DELTA = 0.20;

// Pick the best long + short legs for a debit spread
function selectSpreadLegs(
  contracts: UWContractCandidate[],
  direction: OptionDirection,
  spotPrice: number,
): { longLeg: UWContractCandidate | null; shortLeg: UWContractCandidate | null } {
  const type = direction === 'bullish' ? 'call' : 'put';
  const nowMs = Date.now();

  // UW screener does not reliably populate open_interest (often returns 0), so do not
  // filter on it. Filter on: correct option type, valid strike, DTE ≥ MIN_LEG_DTE, and
  // (when real delta available) |delta| ≥ MIN_LONG_LEG_DELTA on the long leg candidate.
  const legs = contracts.filter(c => {
    if (c.optionType !== type) return false;
    if (!(c.strike > 0)) return false;
    // DTE floor — reject contracts too close to expiry
    const dte = (new Date(c.expiry).getTime() - nowMs) / (1000 * 60 * 60 * 24);
    if (dte < MIN_LEG_DTE) return false;
    return true;
  });

  if (legs.length < 2) return { longLeg: null, shortLeg: null };

  // Sort by how close strike is to spot (for long leg: want near ATM)
  const sorted = [...legs].sort((a, b) =>
    Math.abs(a.strike - spotPrice) - Math.abs(b.strike - spotPrice)
  );

  // Delta quality gate on long leg — only enforced when real greeks were hydrated.
  // delta === 0 means greeks are unavailable (basic plan 404 / mock mode); skip the gate
  // so the spread is still built and the execution score handles the penalty.
  let longLeg = sorted[0];
  if (longLeg && Math.abs(longLeg.delta) > 0 && Math.abs(longLeg.delta) < MIN_LONG_LEG_DELTA) {
    // Nearest-ATM leg failed delta gate; try next closest with acceptable delta
    const better = sorted.slice(1).find(
      c => Math.abs(c.delta) === 0 || Math.abs(c.delta) >= MIN_LONG_LEG_DELTA
    );
    if (better) {
      longLeg = better;
    } else {
      // All hydrated candidates fail the delta gate — reject this direction entirely
      return { longLeg: null, shortLeg: null };
    }
  }

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

function shortlistContracts(
  contracts: UWContractCandidate[],
  direction: OptionDirection,
  limit = SHORTLIST_PER_SIDE,
) {
  const type = direction === 'bullish' ? 'call' : 'put';
  return [...contracts]
    .filter((c) => c.optionType === type)
    .filter((c) => c.strike > 0 && !!c.expiry)
    .filter((c) => Number.isFinite(c.mid) && c.mid > 0)
    .sort((a, b) => {
      const aLiq = Number(a.openInterest ?? 0) * 2 + Number(a.volume ?? 0);
      const bLiq = Number(b.openInterest ?? 0) * 2 + Number(b.volume ?? 0);
      if (bLiq !== aLiq) return bLiq - aLiq;
      return Number(a.mid ?? 0) - Number(b.mid ?? 0);
    })
    .slice(0, limit);
}

function deriveDteBucket(expiry: string): DteBucket {
  const dte = Math.ceil((new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (dte <= 14) return '7-14';
  if (dte <= 21) return '14-21';
  if (dte <= 35) return '21-35';
  return '35-60';
}

function diffUwTelemetry(
  start: UwTelemetrySnapshot,
  end: UwTelemetrySnapshot,
): UwTelemetrySnapshot {
  return {
    totalRequests: end.totalRequests - start.totalRequests,
    dedupHits: end.dedupHits - start.dedupHits,
    dedupMisses: end.dedupMisses - start.dedupMisses,
    retries: end.retries - start.retries,
    rateLimit429s: end.rateLimit429s - start.rateLimit429s,
    requestErrors: end.requestErrors - start.requestErrors,
    lowRateLimitWarnings: end.lowRateLimitWarnings - start.lowRateLimitWarnings,
    inflightPeak: end.inflightPeak,
    inflightCurrent: end.inflightCurrent,
    lastRateLimitRemaining: end.lastRateLimitRemaining,
    lastRateLimitReset: end.lastRateLimitReset,
    lastRateSampleAtMs: end.lastRateSampleAtMs,
  };
}

const OCC_CONTRACT_REGEX = /^([A-Z]{1,6})(\d{6})([CP])(\d{8})$/;

function toOccContractSymbol(
  rootSymbol: string,
  expiry: string,
  optionType: 'call' | 'put',
  strike: number,
): string | null {
  const root = String(rootSymbol ?? '').trim().toUpperCase();
  if (!/^[A-Z]{1,6}$/.test(root)) return null;

  const date = new Date(expiry);
  if (Number.isNaN(date.getTime())) return null;

  const yymmdd = [
    String(date.getUTCFullYear() % 100).padStart(2, '0'),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('');

  const strikeInt = Math.round(strike * 1000);
  if (!Number.isFinite(strikeInt) || strikeInt <= 0) return null;

  const cp = optionType === 'put' ? 'P' : 'C';
  const occ = `${root}${yymmdd}${cp}${String(strikeInt).padStart(8, '0')}`;
  return OCC_CONTRACT_REGEX.test(occ) ? occ : null;
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
}): OptionsOpportunity | null {
  const { symbol, direction, flow, netPremium, gex, volData, longLeg, shortLeg } = params;

  const longOcc = toOccContractSymbol(symbol, longLeg.expiry, longLeg.optionType, longLeg.strike);
  const shortOcc = toOccContractSymbol(symbol, shortLeg.expiry, shortLeg.optionType, shortLeg.strike);
  if (!longOcc || !shortOcc) {
    console.info(
      `[opportunities] integrity gate: invalid OCC contract long=${longOcc ?? 'invalid'} short=${shortOcc ?? 'invalid'} for ${symbol} ${direction}; skipping`
    );
    return null;
  }

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

  // ── Phase 1 integrity gates ──────────────────────────────
  // Discard degenerate spreads before scoring to avoid noisy results.
  if (netDebit <= 0) {
    console.info(`[opportunities] integrity gate: netDebit=${netDebit} <= 0 for ${symbol} ${direction}; skipping`);
    return null;
  }
  if (strikeWidth <= 0) {
    console.info(`[opportunities] integrity gate: strikeWidth=${strikeWidth} <= 0 for ${symbol} ${direction}; skipping`);
    return null;
  }
  if (maxGain <= 0) {
    console.info(`[opportunities] integrity gate: maxGain=${maxGain} <= 0 for ${symbol} ${direction}; skipping`);
    return null;
  }
  if (longLeg.expiry !== shortLeg.expiry) {
    console.info(`[opportunities] integrity gate: expiry mismatch ${longLeg.expiry} vs ${shortLeg.expiry} for ${symbol} ${direction}; skipping`);
    return null;
  }
  // ────────────────────────────────────────────────────────

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
  // eslint-disable-next-line no-var
  var _optsEndpointSnapshots: Map<string, { cachedAt: number; value: unknown }> | undefined;
  // eslint-disable-next-line no-var
  var _optsAiInflight: Promise<void> | undefined;
}

const SCAN_CACHE_TTL_MS = 60_000;
const SYMBOL_ENDPOINT_CACHE_TTL_MS = 45_000;
const WORKER_COUNT = 2;

type OpportunitiesPayload = {
  opportunities: OptionsOpportunity[];
  generatedAt: string;
  total: number;
  dataMode: 'mock' | 'live_strict';
  quotesSource: 'live' | 'unavailable';
  spotPrices: Record<string, number>;
  scanMeta: {
    totalUniverse: number;
    eligibleSymbols: number;
    skippedSymbols: { symbol: string; reason: string }[];
    universe: {
      source: string;
      cachePolicy: UniverseResponse['cachePolicy'];
      symbols: string[];
      candidatesConsidered: number;
      targetEligibleSymbols: number;
    };
    uwTelemetry: UwTelemetrySnapshot;
    aiEnrichment: {
      mode: 'deferred';
      queued: number;
      completed: number;
    };
  };
};

function getEndpointSnapshotStore() {
  if (!globalThis._optsEndpointSnapshots) {
    globalThis._optsEndpointSnapshots = new Map<string, { cachedAt: number; value: unknown }>();
  }
  return globalThis._optsEndpointSnapshots;
}

async function fetchSymbolEndpoint<T>(cacheKey: string, url: string): Promise<T | null> {
  const store = getEndpointSnapshotStore();
  const hit = store.get(cacheKey);
  if (hit && Date.now() - hit.cachedAt < SYMBOL_ENDPOINT_CACHE_TTL_MS) {
    return hit.value as T;
  }

  const value = await fetchJson<T>(url);
  if (value != null) {
    store.set(cacheKey, { cachedAt: Date.now(), value });
  }
  return value;
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, async () => {
    while (true) {
      const idx = cursor;
      cursor += 1;
      if (idx >= items.length) break;
      out[idx] = await worker(items[idx]);
    }
  });

  await Promise.all(workers);
  return out;
}

function startAiEnrichmentInBackground(payload: OpportunitiesPayload) {
  if (globalThis._optsAiInflight) return;

  const toEnrich = payload.opportunities
    .filter((o) => o.score.finalScore >= AI_ENRICH_THRESHOLD)
    .slice(0, MAX_AI_CALLS);

  if (toEnrich.length === 0) return;

  globalThis._optsAiInflight = (async () => {
    const working = JSON.parse(JSON.stringify(payload)) as OpportunitiesPayload;
    const targets = working.opportunities
      .filter((o) => o.score.finalScore >= AI_ENRICH_THRESHOLD)
      .slice(0, MAX_AI_CALLS);

    await Promise.all(
      targets.map(async (opp) => {
        const ai = await withTimeout(getOptionsAiRecommendation(opp), AI_CALL_TIMEOUT_MS);
        if (ai) {
          opp.aiAction = ai.action;
          opp.aiReason = ai.reason;
          opp.aiConfidence = ai.confidence;
          opp.aiRiskFlags = ai.riskFlags;
        }
      })
    );

    working.scanMeta.aiEnrichment.completed = targets.length;
    const body = JSON.stringify(working);
    globalThis._optsCacheResult = { body, cachedAt: Date.now() };
  })()
    .catch((err) => {
      console.warn('[options-opportunities] background AI enrichment failed:', err?.message ?? err);
    })
    .finally(() => {
      globalThis._optsAiInflight = undefined;
    });
}

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
  const requireCached = req.nextUrl.searchParams.get('require_cached') === '1';

  // Snapshot-first: always serve cached snapshot if present.
  // If stale, trigger background refresh while UI gets immediate response.
  const cached = globalThis._optsCacheResult;
  if (cached) {
    const fresh = Date.now() - cached.cachedAt < SCAN_CACHE_TTL_MS;
    if (!fresh && !globalThis._optsInflight) {
      void runScan(req).catch((err) => {
        console.warn('[api/options/opportunities] background refresh failed:', err?.message ?? err);
      });
    }
    return new Response(cached.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Options-Cache': fresh ? 'HIT' : 'STALE',
      },
    });
  }

  // Cron/internal callers that cannot afford a full scan wait pass require_cached=1.
  // Return an empty-safe payload immediately so the caller finishes within its timeout.
  // A background scan is still kicked off so the next call will have a warm cache.
  if (requireCached) {
    if (!globalThis._optsInflight) {
      void runScan(req).catch((err) => {
        console.warn('[api/options/opportunities] background warm failed:', err?.message ?? err);
      });
    }
    return NextResponse.json(
      { opportunities: [], total: 0, generatedAt: new Date().toISOString(), fromCache: false, skipped: true, reason: 'no-cache-yet' },
      { status: 200, headers: { 'X-Options-Cache': 'WARMING' } },
    );
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
    const uwTelemetryStart = uwGetTelemetrySnapshot();
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
      bullLong: UWContractCandidate | null;
      bullShort: UWContractCandidate | null;
      bearLong: UWContractCandidate | null;
      bearShort: UWContractCandidate | null;
      spotPrice: number;
      skippedReason?: string;
    }[] = [];

    // In live mode we force strict no-fallback from UW proxy routes.
    const allowMockParam = hasUwKey ? '&allowMock=0' : '';

    const uwFetchStartedAt = Date.now();
    // Cap processing breadth so the endpoint remains responsive.
    const maxSymbolsToScan = Math.min(universe.length, Math.max(targetEligibleSymbols, 15));
    const symbolsToScan = universe.slice(0, maxSymbolsToScan);
    const scanned = await runWithConcurrency(symbolsToScan, WORKER_COUNT, async (symbol) => {
      const spotParam = liveSpotPrices[symbol] ? `&spotPrice=${liveSpotPrices[symbol]}` : '';
      const flow = await fetchSymbolEndpoint<UWOptionsFlowItem[]>(
        `${symbol}|flow|${allowMockParam}`,
        `${base}/api/unusual-whales/flow?symbol=${symbol}${allowMockParam}`,
      );
      await sleep(uwGetAdaptiveDelayMs(CALL_DELAY_MS));

      const netPremium = await fetchSymbolEndpoint<UWNetPremiumTick>(
        `${symbol}|net-premium|${allowMockParam}`,
        `${base}/api/unusual-whales/net-premium?symbol=${symbol}${allowMockParam}`,
      );
      await sleep(uwGetAdaptiveDelayMs(CALL_DELAY_MS));

      const gex = await fetchSymbolEndpoint<UWGexData>(
        `${symbol}|gex|${allowMockParam}`,
        `${base}/api/unusual-whales/gex?symbol=${symbol}${allowMockParam}`,
      );
      await sleep(uwGetAdaptiveDelayMs(CALL_DELAY_MS));

      const volData = await fetchSymbolEndpoint<UWVolatilityData>(
        `${symbol}|iv|${allowMockParam}`,
        `${base}/api/unusual-whales/iv?symbol=${symbol}${allowMockParam}`,
      );
      await sleep(uwGetAdaptiveDelayMs(CALL_DELAY_MS));

      // Discovery-first: screener provides shortlisted contracts for both directions.
      const allContracts = await fetchSymbolEndpoint<UWContractCandidate[]>(
        `${symbol}|screener|${spotParam}|${allowMockParam}`,
        `${base}/api/unusual-whales/screener?symbol=${symbol}&direction=both${spotParam}${allowMockParam}`,
      );

      const bullCandidates = shortlistContracts(allContracts ?? [], 'bullish');
      const bearCandidates = shortlistContracts(allContracts ?? [], 'bearish');
      const spotPrice = gex?.spotPrice || liveSpotPrices[symbol] || 0;

      // Pre-select legs before greeks hydration so we only pay for 2 contracts
      // per direction (4 calls) rather than the full shortlist (up to 24 calls).
      const { longLeg: bullLong0, shortLeg: bullShort0 } = selectSpreadLegs(bullCandidates, 'bullish', spotPrice);
      const { longLeg: bearLong0, shortLeg: bearShort0 } = selectSpreadLegs(bearCandidates, 'bearish', spotPrice);

      // ── Phase 2: greeks hydration ────────────────────────────────────────
      // UW screener returns delta=0/iv=0. After selecting the two legs we will
      // use, fetch real greeks from the per-contract endpoint so scoring and
      // risk-gating can use real delta/IV values.
      const bullLong  = bullLong0  ? { ...bullLong0  } : null;
      const bullShort = bullShort0 ? { ...bullShort0 } : null;
      const bearLong  = bearLong0  ? { ...bearLong0  } : null;
      const bearShort = bearShort0 ? { ...bearShort0 } : null;

      if (hasUwKey) {
        for (const leg of [bullLong, bullShort, bearLong, bearShort]) {
          if (!leg) continue;
          // Skip hydration if mock data already has a real delta value.
          if (leg.delta !== 0) continue;
          const occSymbol = toOccContractSymbol(symbol, leg.expiry, leg.optionType, leg.strike);
          if (!occSymbol) continue;
          const gk = await fetchSymbolEndpoint<GreeksPatch>(
            `greeks|${occSymbol}`,
            `${base}/api/unusual-whales/contract-greeks?symbol=${encodeURIComponent(occSymbol)}`,
          );
          if (gk) {
            if (gk.delta !== 0)  leg.delta             = gk.delta;
            if (gk.gamma !== 0)  leg.gamma             = gk.gamma;
            if (gk.theta !== 0)  leg.theta             = gk.theta;
            if (gk.vega  !== 0)  leg.vega              = gk.vega;
            if (gk.iv    !== 0)  leg.impliedVolatility = gk.iv;
            if (gk.bid   >  0)   leg.bid               = gk.bid;
            if (gk.ask   >  0)   leg.ask               = gk.ask;
            if (gk.mid   >  0)   leg.mid               = gk.mid;
          }
          await sleep(uwGetAdaptiveDelayMs(GREEKS_DELAY_MS));
        }
      }
      // ─────────────────────────────────────────────────────────────────────

      let skippedReason: string | undefined;
      if (hasUwKey) {
        const missing: string[] = [];
        const hasBullLegs = !!(bullLong && bullShort);
        const hasBearLegs = !!(bearLong && bearShort);
        if (!hasBullLegs && !hasBearLegs) missing.push('no-valid-legs-either-direction');
        if (!(spotPrice > 0)) missing.push('spot-price');
        if (missing.length > 0) skippedReason = `missing ${missing.join(', ')}`;
      }

      await sleep(uwGetAdaptiveDelayMs(SYMBOL_FETCH_DELAY_MS));

      return {
        symbol,
        flow: flow ?? [],
        netPremium,
        gex,
        volData,
        bullLong,
        bullShort,
        bearLong,
        bearShort,
        spotPrice,
        skippedReason,
      };
    });

    symbolData.push(...scanned);
    const uwFetchMs = Date.now() - uwFetchStartedAt;

    const scoringStartedAt = Date.now();
    for (const d of symbolData) {
      if (d.skippedReason) {
        skippedSymbols.push({ symbol: d.symbol, reason: d.skippedReason });
        continue;
      }

      const spotPrice = d.spotPrice > 0 ? d.spotPrice : 100;

      // -- Bullish opportunity (legs pre-selected + greeks-hydrated in fetch phase) --
      const bLong = d.bullLong;
      const bShort = d.bullShort;
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
        if (opp && opp.score.finalScore >= MIN_SCORE && opp.maxGain > 0) {
          opportunities.push(opp);
        }
      }

      // -- Bearish opportunity (legs pre-selected + greeks-hydrated in fetch phase) --
      const aLong = d.bearLong;
      const aShort = d.bearShort;
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
        if (opp && opp.score.finalScore >= MIN_SCORE && opp.maxGain > 0) {
          opportunities.push(opp);
        }
      }
    }
    const scoringMs = Date.now() - scoringStartedAt;

    opportunities.sort((a, b) => b.score.finalScore - a.score.finalScore);

    const aiQueued = opportunities
      .filter((o) => o.score.finalScore >= AI_ENRICH_THRESHOLD)
      .slice(0, MAX_AI_CALLS)
      .length;

    const aiMs = 0;

    const totalMs = Date.now() - scanStartedAt;
    const uwTelemetry = diffUwTelemetry(uwTelemetryStart, uwGetTelemetrySnapshot());
    console.info(
      `[options-opportunities] done totalMs=${totalMs} universeMs=${universeMs} quotesMs=${quotesMs} ` +
      `uwFetchMs=${uwFetchMs} scoringMs=${scoringMs} aiMs=${aiMs} symbolsScanned=${symbolData.length} ` +
      `eligibleSymbols=${symbolData.length - skippedSymbols.length} opportunities=${opportunities.length} ` +
      `aiQueued=${aiQueued} dataMode=${dataMode} quotesSource=${quotesSource} ` +
      `uwRequests=${uwTelemetry.totalRequests} uw429=${uwTelemetry.rateLimit429s} uwRetries=${uwTelemetry.retries} ` +
      `uwErrors=${uwTelemetry.requestErrors} uwDedupHits=${uwTelemetry.dedupHits}`,
    );

    const payload: OpportunitiesPayload = {
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
        uwTelemetry,
        aiEnrichment: {
          mode: 'deferred',
          queued: aiQueued,
          completed: 0,
        },
      },
    };

    const body = JSON.stringify(payload);

    // Cache so concurrent / double-fire requests don't re-scan.
    globalThis._optsCacheResult = { body, cachedAt: Date.now() };
    startAiEnrichmentInBackground(payload);
    return body;
  } catch (err: any) {
    console.error('[api/options/opportunities] _executeScan error:', err);
    throw err;
  }
}
