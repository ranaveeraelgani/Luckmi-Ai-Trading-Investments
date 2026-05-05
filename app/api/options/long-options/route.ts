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
  UWOptionsFlowItem,
  UWContractCandidate,
  UWNetPremiumTick,
  UWVolatilityData,
  OptionDirection,
  StrategyFamily,
  DteBucket,
  LiquidityQuality,
} from '@/app/lib/options/types';

// ── Constants ─────────────────────────────────────────────────────────────────
const MIN_SCORE = 35;
const AI_ENRICH_THRESHOLD = 55;
const MAX_AI_CALLS = 5;
const CALL_DELAY_MS = 550;
const SYMBOL_FETCH_DELAY_MS = 550;
const RETRY_429_MAX_ATTEMPTS = 3;
const RETRY_429_BASE_DELAY_MS = 180;

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
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function getBaseUrl(req: NextRequest) {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
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

    // Delta filter — use absolute value; puts have negative delta
    const absDelta = Math.abs(c.delta ?? 0);
    if (absDelta < DELTA_MIN || absDelta > DELTA_MAX) return false;

    // Must have a non-zero mid price
    if ((c.mid ?? 0) <= 0) return false;

    return true;
  });

  if (candidates.length === 0) return null;

  // Sort: prefer high open interest + delta closest to 0.40 (sweet spot)
  return candidates.sort((a, b) => {
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
  flowData: UWOptionsFlowItem[];
  netPremium: UWNetPremiumTick | null;
  ivRank: number;
  contract: UWContractCandidate;
  spotPrice: number;
}): number {
  const { direction, flowData, netPremium, ivRank, contract, spotPrice } = params;
  let score = 0;

  // ── Flow bias (0-40 pts) ──────────────────────────────────────────────────
  if (netPremium) {
    const netBias = netPremium.callPremium - netPremium.putPremium;
    if (direction === 'bullish' && netBias > 0) {
      score += Math.min(40, 20 + (netBias / 50_000));
    } else if (direction === 'bearish' && netBias < 0) {
      score += Math.min(40, 20 + (Math.abs(netBias) / 50_000));
    } else {
      score += 5; // counter-flow — weak signal
    }
  } else {
    // Fallback: count unusual flow items
    const unusual = flowData.filter(f =>
      f.isUnusual &&
      f.optionType === (direction === 'bullish' ? 'call' : 'put')
    );
    score += Math.min(30, unusual.length * 6);
  }

  // ── IV rank fit (0-25 pts) ────────────────────────────────────────────────
  // Long options benefit from LOW IV (cheap premium). Penalise high IV.
  if (ivRank < 20) score += 25;
  else if (ivRank < 35) score += 18;
  else if (ivRank < 50) score += 10;
  else score += 2; // IV too expensive for long options

  // ── Liquidity (0-20 pts) ──────────────────────────────────────────────────
  const liq = deriveLiquidityQuality(contract);
  if (liq === 'excellent') score += 20;
  else if (liq === 'good') score += 14;
  else if (liq === 'fair') score += 6;

  // ── Delta quality (0-15 pts) ─────────────────────────────────────────────
  const absDelta = Math.abs(contract.delta ?? 0);
  // Sweet spot 0.35-0.50: highest leverage without heavy premium
  if (absDelta >= 0.35 && absDelta <= 0.50) score += 15;
  else if (absDelta >= 0.28 && absDelta <= 0.60) score += 8;

  return Math.min(100, Math.round(score));
}

// ── GET handler ───────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const base = getBaseUrl(req);

    // ── 1. Resolve symbol universe ─────────────────────────────────────────
    type UniverseResp = { symbols?: string[] };
    const universeData = await fetchJson<UniverseResp>(`${base}/api/auto-stocks`);
    const symbols: string[] = (universeData?.symbols?.length ? universeData.symbols : STATIC_UNIVERSE)
      .slice(0, 15);

    // ── 2. Fetch spot prices ───────────────────────────────────────────────
    type QuotesResp = { quotes?: Record<string, { price?: number }> };
    let spotPrices: Record<string, number> = {};
    const quotesData = await fetchJson<QuotesResp>(
      `${base}/api/quotes?symbols=${symbols.join(',')}`
    );
    if (quotesData?.quotes) {
      for (const [sym, q] of Object.entries(quotesData.quotes)) {
        if (q?.price) spotPrices[sym] = q.price;
      }
    }
    await sleep(CALL_DELAY_MS);

    // ── 3. Scan each symbol ────────────────────────────────────────────────
    const opportunities: OptionsOpportunity[] = [];

    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      if (i > 0) await sleep(SYMBOL_FETCH_DELAY_MS);

      const spotPrice = spotPrices[symbol] ?? 0;
      if (spotPrice <= 0) continue;

      // -- Flow data
      type FlowResp = { flow?: UWOptionsFlowItem[] };
      const flowData = await fetchJson<FlowResp>(
        `${base}/api/options/flow?symbol=${symbol}`
      );
      await sleep(CALL_DELAY_MS);

      // -- Net premium
      type NetPremiumResp = { netPremium?: UWNetPremiumTick };
      const npmData = await fetchJson<NetPremiumResp>(
        `${base}/api/options/net-premium?symbol=${symbol}`
      );
      await sleep(CALL_DELAY_MS);

      // -- IV / volatility
      type VolResp = { volatility?: UWVolatilityData };
      const volData = await fetchJson<VolResp>(
        `${base}/api/options/volatility?symbol=${symbol}`
      );
      await sleep(CALL_DELAY_MS);

      // -- Contracts
      type ContractsResp = { contracts?: UWContractCandidate[] };
      const contractsData = await fetchJson<ContractsResp>(
        `${base}/api/options/contracts?symbol=${symbol}`
      );
      await sleep(CALL_DELAY_MS);

      const flow = flowData?.flow ?? [];
      const netPremium = npmData?.netPremium ?? null;
      const ivRank = volData?.volatility?.ivRank ?? 50;
      const contracts = contractsData?.contracts ?? [];

      if (contracts.length === 0) continue;

      // ── Determine direction from net premium / flow bias ──────────────
      const directions: OptionDirection[] = ['bullish', 'bearish'];
      for (const direction of directions) {
        const contract = selectLongContract(contracts, direction, spotPrice);
        if (!contract) continue;

        const score = scoreLongOption({
          direction,
          flowData: flow,
          netPremium,
          ivRank,
          contract,
          spotPrice,
        });

        if (score < MIN_SCORE) continue;

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

        const thesis = direction === 'bullish'
          ? `${symbol} long call at $${contract.strike} — delta ${contract.delta?.toFixed(2)} | IV rank ${ivRank}`
          : `${symbol} long put at $${contract.strike} — delta ${contract.delta?.toFixed(2)} | IV rank ${ivRank}`;

        const now = new Date();
        const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

        const opp: OptionsOpportunity = {
          id: `${symbol}-${strategy}-${contract.strike}-${contract.expiry}`,
          symbol,
          direction,
          strategy,
          score: {
            flowScore: Math.min(100, score + 5),
            structureScore: 50, // single-leg — no spread structure scoring
            volatilityFitScore: ivRank < 30 ? 80 : ivRank < 50 ? 55 : 30,
            executionQualityScore: liquidityQuality === 'excellent' ? 90 : liquidityQuality === 'good' ? 70 : 40,
            finalScore: score,
            flowDetail: {},
            structureDetail: {},
            volatilityDetail: {},
            executionDetail: {},
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
          flowSummary: netPremium
            ? `Net ${direction === 'bullish' ? 'call' : 'put'} premium: $${(direction === 'bullish' ? netPremium.callPremium : netPremium.putPremium).toLocaleString()}`
            : `${flow.filter(f => f.isUnusual).length} unusual flow items`,
          structureSummary: `Single-leg ${strategy.replace('_', ' ')} — ${dte}d to expiry`,
          ivRank,
          gexBias: 'neutral',
          liquidityQuality,
          status: 'active',
          createdAt: now.toISOString(),
          expiresAt,
        };

        opportunities.push(opp);
      }
    }

    // ── 4. Sort by score ────────────────────────────────────────────────────
    opportunities.sort((a, b) => b.score.finalScore - a.score.finalScore);

    // ── 5. AI enrichment for top results ───────────────────────────────────
    let aiCallCount = 0;
    for (const opp of opportunities) {
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
      opportunities,
      count: opportunities.length,
      scannedSymbols: symbols.length,
      source: 'long-options-scanner',
    });
  } catch (err: any) {
    console.error('[long-options] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
