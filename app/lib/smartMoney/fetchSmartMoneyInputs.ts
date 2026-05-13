import { getCtsForSymbol } from '@/app/lib/evaluateAi/evaluateHelpers/getCtsForSymbol';
import { getBaseUrl } from '@/app/lib/utils/get-base-url';
import type {
  UWGexData,
  UWNetPremiumTick,
  UWOptionsFlowItem,
  UWVolatilityData,
} from '@/app/lib/options/types';
import type { CtsAlignment, SmartMoneySymbolInputs } from '@/app/lib/smartMoney/types';

type SmartMoneyInputFetchOptions = {
  forceRefresh?: boolean;
};

type CachePhase = 'market_hours' | 'off_hours';

const inputCache = new Map<
  string,
  {
    value: SmartMoneySymbolInputs;
    expiresAtMs: number;
  }
>();
const inflight = new Map<string, Promise<SmartMoneySymbolInputs>>();

function getEasternParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );

  return {
    weekday: String(parts.weekday),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

export function getSmartMoneyCachePolicy(date = new Date()): {
  phase: CachePhase;
  ttlSeconds: number;
} {
  const et = getEasternParts(date);
  const minutes = et.hour * 60 + et.minute;
  const open = 9 * 60 + 30;
  const close = 16 * 60;
  const isWeekend = et.weekday === 'Sat' || et.weekday === 'Sun';

  if (!isWeekend && minutes >= open && minutes < close) {
    return { phase: 'market_hours', ttlSeconds: 300 };
  }

  return { phase: 'off_hours', ttlSeconds: 1800 };
}

function parseAlignment(value: unknown): CtsAlignment {
  const normalized = String(value || 'mixed');
  if (
    normalized === 'bullish_confirmed' ||
    normalized === 'bullish_timing_weak' ||
    normalized === 'mixed' ||
    normalized === 'countertrend_bounce' ||
    normalized === 'bearish_confirmed'
  ) {
    return normalized;
  }
  return 'mixed';
}

async function fetchJson<T>(url: string, revalidate: number): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchSmartMoneyInputs(
  symbolInput: string,
  options: SmartMoneyInputFetchOptions = {},
): Promise<SmartMoneySymbolInputs> {
  const symbol = String(symbolInput || '').trim().toUpperCase();
  const { ttlSeconds } = getSmartMoneyCachePolicy();
  const cacheKey = `${symbol}`;

  if (!options.forceRefresh) {
    const cached = inputCache.get(cacheKey);
    if (cached && cached.expiresAtMs > Date.now()) {
      return cached.value;
    }

    const running = inflight.get(cacheKey);
    if (running) {
      return running;
    }
  }

  const promise = (async (): Promise<SmartMoneySymbolInputs> => {
  const baseUrl = getBaseUrl().replace(/\/$/, '');
  const qs = `symbol=${encodeURIComponent(symbol)}`;

    const [flow, netPremium, gex, iv, cts] = await Promise.all([
      fetchJson<UWOptionsFlowItem[]>(`${baseUrl}/api/unusual-whales/flow?${qs}`, ttlSeconds),
      fetchJson<UWNetPremiumTick>(`${baseUrl}/api/unusual-whales/net-premium?${qs}`, ttlSeconds),
      fetchJson<UWGexData>(`${baseUrl}/api/unusual-whales/gex?${qs}`, ttlSeconds),
      fetchJson<UWVolatilityData>(`${baseUrl}/api/unusual-whales/iv?${qs}`, ttlSeconds),
    getCtsForSymbol(symbol),
  ]);

  const ctsScoreRaw = Number(cts?.ctsScore ?? 55);
  const ctsScore = Number.isFinite(ctsScoreRaw) ? ctsScoreRaw : 55;
  const dailyCTSRaw = Number(cts?.dailyCTS ?? 55);
  const intradayCTSRaw = Number(cts?.intradayCTS ?? 55);

    const value = {
      symbol,
      flow: Array.isArray(flow) ? flow : null,
      netPremium: netPremium ?? null,
      gex: gex ?? null,
      iv: iv ?? null,
      ctsScore,
      alignment: parseAlignment(cts?.alignment),
      ctsMeta: {
        dailyCTS: Number.isFinite(dailyCTSRaw) ? dailyCTSRaw : 55,
        intradayCTS: Number.isFinite(intradayCTSRaw) ? intradayCTSRaw : 55,
      },
    };

    inputCache.set(cacheKey, {
      value,
      expiresAtMs: Date.now() + ttlSeconds * 1000,
    });

    return value;
  })().finally(() => {
    inflight.delete(cacheKey);
  });

  inflight.set(cacheKey, promise);
  return promise;
}
