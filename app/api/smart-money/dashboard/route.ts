import { NextRequest, NextResponse } from 'next/server';
import { getBaseUrl } from '@/app/lib/utils/get-base-url';
import { calculateSmartMoneyScore } from '@/app/lib/smartMoney/calculateSmartMoneyScore';
import { classifyTier } from '@/app/lib/smartMoney/classifyTier';
import {
  fetchSmartMoneyInputs,
  getSmartMoneyCachePolicy,
} from '@/app/lib/smartMoney/fetchSmartMoneyInputs';
import { createSmartMoneyNarrative } from '@/app/lib/smartMoney/createSmartMoneyNarrative';
import { isSmartMoneyEnabled, smartMoneyError } from '@/app/lib/smartMoney/http';
import type { SmartMoneyTier } from '@/app/lib/smartMoney/types';

const DEFAULT_FALLBACK_UNIVERSE = ['NVDA', 'AAPL', 'MSFT', 'META', 'AMZN'];

type UniverseResponse = {
  symbols?: string[];
  source?: string;
  generatedAt?: string;
  cachePolicy?: {
    phase?: string;
    ttlSeconds?: number;
    label?: string;
  };
};

type DashboardRow = {
  symbol: string;
  ctsScore: number;
  alignment: string;
  smartMoneyScore: number;
  finalConviction: number;
  tier: SmartMoneyTier;
  tierReason: string;
  isAutoTradingEligible: boolean;
  breakdown: ReturnType<typeof calculateSmartMoneyScore>['breakdown'];
  signals: ReturnType<typeof calculateSmartMoneyScore>['signals'];
  dataAvailability: ReturnType<typeof calculateSmartMoneyScore>['dataAvailability'];
  ctsMeta: {
    dailyCTS: number;
    intradayCTS: number;
  };
  aiNarrative: string;
  aiConfidence: number;
  generatedAt: string;
};

function parseIntParam(value: string | null, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function parseNumParam(value: string | null, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseTier(value: string | null): SmartMoneyTier | null {
  if (value === 'tier_1' || value === 'tier_2' || value === 'tier_3') {
    return value;
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    if (!isSmartMoneyEnabled()) {
      return smartMoneyError(
        'Smart Money feature is currently disabled',
        404,
        'FEATURE_DISABLED',
      );
    }

    const cachePolicy = getSmartMoneyCachePolicy();
    const maxSymbols = Number(process.env.SMART_MONEY_MAX_DASHBOARD_SYMBOLS ?? 30);
    const limit = Math.max(
      1,
      Math.min(parseIntParam(req.nextUrl.searchParams.get('limit'), 20), maxSymbols),
    );
    const minCts = parseNumParam(req.nextUrl.searchParams.get('minCts'), 50);
    const minSms = parseNumParam(req.nextUrl.searchParams.get('minSms'), 60);
    const tierFilter = parseTier(req.nextUrl.searchParams.get('tier'));

    const baseUrl = getBaseUrl().replace(/\/$/, '');
    let universe: UniverseResponse = {
      symbols: DEFAULT_FALLBACK_UNIVERSE,
      source: 'smart_money_fallback_universe',
      generatedAt: new Date().toISOString(),
      cachePolicy: {
        phase: cachePolicy.phase,
        ttlSeconds: cachePolicy.ttlSeconds,
        label: cachePolicy.phase,
      },
    };
    let usedUniverseFallback = false;

    try {
      const universeRes = await fetch(`${baseUrl}/api/unusual-whales/universe`, {
        next: { revalidate: cachePolicy.ttlSeconds },
      });
      if (universeRes.ok) {
        universe = (await universeRes.json()) as UniverseResponse;
      } else {
        usedUniverseFallback = true;
      }
    } catch {
      usedUniverseFallback = true;
    }

    const symbols = (Array.isArray(universe.symbols) ? universe.symbols : DEFAULT_FALLBACK_UNIVERSE)
      .map((symbol) => String(symbol || '').trim().toUpperCase())
      .filter(Boolean)
      .slice(0, limit);

    const settled = await Promise.allSettled(
      symbols.map(async (symbol): Promise<DashboardRow> => {
        const inputs = await fetchSmartMoneyInputs(symbol);

        const score = calculateSmartMoneyScore({
          symbol,
          flow: inputs.flow,
          netPremium: inputs.netPremium,
          gex: inputs.gex,
          iv: inputs.iv,
          ctsScore: inputs.ctsScore,
          alignment: inputs.alignment,
        });

        const tier = classifyTier(
          score.ctsScore,
          score.smartMoneyScore,
          score.alignment,
          score.finalConviction,
        );
        const narrative = createSmartMoneyNarrative({
          symbol,
          ctsScore: score.ctsScore,
          smartMoneyScore: score.smartMoneyScore,
          finalConviction: score.finalConviction,
          tier: tier.tier,
          alignment: score.alignment,
        });

        return {
          symbol,
          ctsScore: score.ctsScore,
          alignment: score.alignment,
          smartMoneyScore: score.smartMoneyScore,
          finalConviction: score.finalConviction,
          tier: tier.tier,
          tierReason: tier.reason,
          isAutoTradingEligible: tier.isAutoTradingEligible,
          breakdown: score.breakdown,
          signals: score.signals,
          dataAvailability: score.dataAvailability,
          ctsMeta: inputs.ctsMeta,
          aiNarrative: narrative.aiNarrative,
          aiConfidence: narrative.aiConfidence,
          generatedAt: score.generatedAt,
        };
      }),
    );

    const rows = settled
      .filter(
        (item): item is PromiseFulfilledResult<DashboardRow> =>
          item.status === 'fulfilled',
      )
      .map((item) => item.value)
      .filter((row) => row.ctsScore >= minCts && row.smartMoneyScore >= minSms)
      .filter((row) => (tierFilter ? row.tier === tierFilter : true))
      .sort((a, b) => b.finalConviction - a.finalConviction);

    const partialFailures = settled.length - rows.length;

    const tierCounts = rows.reduce(
      (acc, row) => {
        acc[row.tier] += 1;
        return acc;
      },
      { tier_1: 0, tier_2: 0, tier_3: 0 },
    );

    return NextResponse.json({
      items: rows,
      count: rows.length,
      filters: {
        limit,
        minCts,
        minSms,
        tier: tierFilter,
      },
      tierCounts,
      universe: {
        source: universe.source || 'unknown',
        generatedAt: universe.generatedAt || null,
        cachePolicy: universe.cachePolicy || {
          phase: cachePolicy.phase,
          ttlSeconds: cachePolicy.ttlSeconds,
        },
      },
      cachePolicy,
      partialFailures,
      warning: usedUniverseFallback
        ? 'Using fallback universe due to upstream discovery issue.'
        : null,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[smart-money/dashboard] error:', error);
    return smartMoneyError(
      'Failed to load smart money dashboard',
      500,
      'INTERNAL_ERROR',
      {
        route: 'smart-money/dashboard',
      },
    );
  }
}
