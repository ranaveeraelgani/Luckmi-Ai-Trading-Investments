import { NextResponse } from 'next/server';

const UW_BASE = 'https://api.unusualwhales.com';
const DEFAULT_UNIVERSE = [
  'NVDA', 'SPY', 'QQQ', 'AAPL', 'MSFT',
  'TSLA', 'AMZN', 'META', 'AMD', 'PLTR',
  'GOOGL', 'AVGO', 'COIN', 'NFLX', 'CRM',
];
const TARGET_ELIGIBLE_UNIVERSE_SIZE = 15;
const CANDIDATE_UNIVERSE_SIZE = 20; // tight cap keeps scan fast; static fallback fills gaps
const SCREENER_LIMIT = 100;
const ALLOWED_ISSUE_TYPES = new Set(['Common Stock', 'ETF', 'ADR']);

type CachePhase = 'open_priority' | 'regular_session' | 'off_hours';

type UniverseSymbolRow = {
  symbol: string;
  premium: number;
  volume: number;
  contracts: number;
};

function getEasternParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );

  return {
    weekday: parts.weekday,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function getUniverseCachePolicy(date = new Date()) {
  const et = getEasternParts(date);
  const minutes = et.hour * 60 + et.minute;
  const open = 9 * 60 + 30;
  const firstHourEnd = 10 * 60 + 30;
  const close = 16 * 60;

  if (et.weekday === 'Sat' || et.weekday === 'Sun') {
    return { phase: 'off_hours' as CachePhase, ttlSeconds: 3600, label: '60m off-hours cache' };
  }

  if (minutes >= open && minutes < firstHourEnd) {
    return { phase: 'open_priority' as CachePhase, ttlSeconds: 900, label: '15m first-hour cache' };
  }

  if (minutes >= open && minutes < close) {
    return { phase: 'regular_session' as CachePhase, ttlSeconds: 1800, label: '30m regular-session cache' };
  }

  return { phase: 'off_hours' as CachePhase, ttlSeconds: 3600, label: '60m off-hours cache' };
}

// Index option tickers that have no per-symbol stock flow/GEX/IV endpoints.
const EXCLUDE_SYMBOLS = new Set(['SPX', 'SPXW', 'NDX', 'VIX', 'RUT', 'XSP']);

function sanitizeSymbol(value: unknown) {
  const symbol = String(value ?? '').trim().toUpperCase();
  if (!symbol) return '';
  if (!/^[A-Z.]{1,10}$/.test(symbol)) return '';
  return symbol;
}

function toNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function buildFallbackUniverse() {
  const rows: UniverseSymbolRow[] = DEFAULT_UNIVERSE.map((symbol, index) => ({
    symbol,
    premium: DEFAULT_UNIVERSE.length - index,
    volume: 0,
    contracts: 0,
  }));

  return {
    symbols: DEFAULT_UNIVERSE,
    source: 'fallback_static' as const,
    leaders: rows,
  };
}

export async function GET() {
  const policy = getUniverseCachePolicy();
  const apiKey = process.env.UNUSUAL_WHALES_API_KEY;

  if (!apiKey) {
    const fallback = buildFallbackUniverse();
    return NextResponse.json({
      ...fallback,
      generatedAt: new Date().toISOString(),
      cachePolicy: policy,
      note: 'UW API key missing; using static development universe.',
    });
  }

  try {
    const params = new URLSearchParams({
      limit: String(SCREENER_LIMIT),
      order_by: 'premium',
      order_direction: 'desc',
      min_dte: '7',
      max_dte: '60',
      min_volume: '200',
      is_otm: 'true',
    });

    const res = await fetch(
      `${UW_BASE}/api/screener/option-contracts?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        next: { revalidate: policy.ttlSeconds },
      }
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[unusual-whales/universe] UW returned ${res.status}. Body: ${body.slice(0, 200)}`);
      const fallback = buildFallbackUniverse();
      return NextResponse.json({
        ...fallback,
        generatedAt: new Date().toISOString(),
        cachePolicy: policy,
        note: `UW universe discovery unavailable (${res.status}); using static fallback universe.`,
      });
    }

    const data = await res.json();
    const raw = Array.isArray(data?.data) ? data.data : [];
    const bySymbol = new Map<string, UniverseSymbolRow>();

    for (const item of raw) {
      const symbol = sanitizeSymbol(item?.ticker_symbol);
      if (!symbol) continue;
      if (EXCLUDE_SYMBOLS.has(symbol)) continue;

      const issueType = String(item?.issue_type ?? '').trim();
      if (issueType && !ALLOWED_ISSUE_TYPES.has(issueType)) continue;

      const stockPrice = toNumber(item?.stock_price);
      if (stockPrice > 0 && stockPrice < 10) continue;

      const existing = bySymbol.get(symbol) ?? {
        symbol,
        premium: 0,
        volume: 0,
        contracts: 0,
      };

      existing.premium += toNumber(item?.premium);
      existing.volume += toNumber(item?.volume);
      existing.contracts += 1;
      bySymbol.set(symbol, existing);
    }

    const leaders = [...bySymbol.values()]
      .sort((a, b) => {
        if (b.premium !== a.premium) return b.premium - a.premium;
        if (b.volume !== a.volume) return b.volume - a.volume;
        return b.contracts - a.contracts;
      })
      .slice(0, CANDIDATE_UNIVERSE_SIZE);

    if (leaders.length === 0) {
      const fallback = buildFallbackUniverse();
      return NextResponse.json({
        ...fallback,
        generatedAt: new Date().toISOString(),
        cachePolicy: policy,
        note: 'UW universe discovery returned 0 symbols; using static fallback universe.',
      });
    }

    return NextResponse.json({
      symbols: leaders.map((row) => row.symbol),
      leaders,
      source: 'dynamic_uw_screener' as const,
      generatedAt: new Date().toISOString(),
      cachePolicy: policy,
      targetEligibleSymbols: TARGET_ELIGIBLE_UNIVERSE_SIZE,
    });
  } catch (err: any) {
    console.error('[unusual-whales/universe] error:', err);
    const fallback = buildFallbackUniverse();
    return NextResponse.json({
      ...fallback,
      generatedAt: new Date().toISOString(),
      cachePolicy: policy,
      note: 'UW universe discovery request failed; using static fallback universe.',
    });
  }
}