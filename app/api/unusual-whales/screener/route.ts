// ============================================================
// UW Proxy — Contract Screener
// GET /api/unusual-whales/screener?symbol=NVDA&direction=bullish
//
// Proxies: GET /api/screener/option-contracts
// Returns up to 4 candidate contracts for spread construction.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import type { UWContractCandidate } from '@/app/lib/options/types';

const UW_BASE = 'https://api.unusualwhales.com';

function strikeIncrement(price: number): number {
  if (price >= 500) return 10;
  if (price >= 100) return 5;
  if (price >= 20)  return 2.5;
  return 1;
}

function roundToIncrement(value: number, inc: number): number {
  return Math.round(value / inc) * inc;
}

// spotPrice is passed in as a query param from the opportunities route (which fetches
// real quotes). We never hardcode per-symbol prices here.
function getMockContracts(symbol: string, direction: string, spotPrice: number): UWContractCandidate[] {
  if (direction === 'both') {
    return [
      ...getMockContracts(symbol, 'bullish', spotPrice),
      ...getMockContracts(symbol, 'bearish', spotPrice),
    ];
  }

  const isCall = direction === 'bullish';
  const optionType = isCall ? 'call' : 'put';
  const spot = spotPrice > 0 ? spotPrice : 100;
  const inc = strikeIncrement(spot);

  // Long leg: slightly OTM in the direction of the trade
  const longStrike  = roundToIncrement(spot * (isCall ? 1.01 : 0.99), inc);
  // Short leg: 2 increments further OTM
  const shortStrike = isCall ? longStrike + inc * 2 : longStrike - inc * 2;

  // Rough premium: ATM ≈ 3% of spot, further OTM ≈ 45% of that
  const longMid  = Number((spot * 0.030).toFixed(2));
  const shortMid = Number((longMid * 0.45).toFixed(2));

  return [
    {
      symbol, expiry: '2026-05-22',
      strike: longStrike, optionType,
      bid: Number((longMid * 0.97).toFixed(2)), ask: Number((longMid * 1.03).toFixed(2)), mid: longMid,
      openInterest: 6000, volume: 1800,
      impliedVolatility: 0.28, delta: isCall ? 0.49 : -0.49, gamma: 0.012, theta: -0.35, vega: 0.50,
    },
    {
      symbol, expiry: '2026-05-22',
      strike: shortStrike, optionType,
      bid: Number((shortMid * 0.97).toFixed(2)), ask: Number((shortMid * 1.03).toFixed(2)), mid: shortMid,
      openInterest: 4000, volume: 900,
      impliedVolatility: 0.26, delta: isCall ? 0.30 : -0.30, gamma: 0.009, theta: -0.28, vega: 0.40,
    },
  ];
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol');
  const directionRaw = (req.nextUrl.searchParams.get('direction') ?? 'bullish').toLowerCase();
  const direction = directionRaw === 'both' || directionRaw === 'bearish' ? directionRaw : 'bullish';
  const allowMock = req.nextUrl.searchParams.get('allowMock') !== '0';
  // spotPrice is passed by the opportunities route (which fetches live quotes) so mock
  // strikes are anchored to the real current price rather than a stale lookup table.
  const spotPrice = Number(req.nextUrl.searchParams.get('spotPrice') ?? 0);
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  const apiKey = process.env.UNUSUAL_WHALES_API_KEY;
  if (!apiKey) {
    if (!allowMock) {
      return NextResponse.json({ error: 'UW API key missing and mock disabled' }, { status: 503 });
    }
    return NextResponse.json(getMockContracts(symbol.toUpperCase(), direction, spotPrice));
  }

  try {
    const requestedTypes: Array<'call' | 'put'> =
      direction === 'both' ? ['call', 'put'] : [direction === 'bullish' ? 'call' : 'put'];

    // UW contract screener — filter by symbol and option type.
    // Omit min_volume: the global universe screener aggregates volume across all
    // contracts, so a symbol can rank highly in the universe but have no single
    // contract exceeding 200 volume. Let UW apply its own server-side floor.
    const requestType = async (optionType: 'call' | 'put'): Promise<any[]> => {
      const params = new URLSearchParams({
        ticker_symbol: symbol.toUpperCase(),
        type: optionType,
        min_dte: '7',
        max_dte: '90',
      });

      const res = await fetch(
        `${UW_BASE}/api/screener/option-contracts?${params.toString()}`,
        { headers: { Authorization: `Bearer ${apiKey}` }, next: { revalidate: 120 } }
      );

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.warn(`[unusual-whales/screener] UW returned ${res.status}. Body: ${body.slice(0, 200)}`);
        throw new Error(`UW screener unavailable for ${optionType} (${res.status})`);
      }

      const data = await res.json();
      const raw = Array.isArray(data?.data) ? data.data : data ?? [];
      return Array.isArray(raw) ? raw : [];
    };

    const settled = await Promise.allSettled(requestedTypes.map((t) => requestType(t)));
    const allRaw: any[] = [];
    let successCount = 0;
    for (const s of settled) {
      if (s.status === 'fulfilled') {
        allRaw.push(...s.value);
        successCount += 1;
      }
    }

    // If every requested type failed, preserve strict-mode behavior.
    if (successCount === 0) {
      if (!allowMock) {
        return NextResponse.json({ error: 'UW screener request failed for all requested contract types' }, { status: 502 });
      }
      return NextResponse.json(getMockContracts(symbol.toUpperCase(), direction, spotPrice));
    }

    // Parse OCC option symbol: e.g. TSLA230908C00255000
    // Format: {TICKER}{YYMMDD}{C|P}{8-digit-strike/1000}
    // Greedy ticker match handles multi-char tickers (AAPL, GOOGL, etc).
    // Some UW symbols include a dot adjustment suffix (e.g. TSLA1230908C...) — strip it.
    function parseOcc(sym: string) {
      const compact = String(sym ?? '').replace(/\s+/g, '').toUpperCase();
      const m = compact.match(/(\d{6})([CP])(\d{8})$/);
      if (!m) return { expiry: '', strike: 0 };
      const [, d, , s] = m;
      const expiry = `20${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 6)}`;
      return { expiry, strike: Number(s) / 1000 };
    }

    const normalized: UWContractCandidate[] = allRaw.slice(0, 20).map((item: any) => {
      const optionSymbol = String(item.option_symbol ?? '').replace(/\s+/g, '').toUpperCase();
      const { expiry, strike } = parseOcc(optionSymbol);
      const mid = Number(item.avg_price ?? item.close ?? 0);
      const cpMatch = optionSymbol.match(/(\d{6})([CP])(\d{8})$/);
      const cp = cpMatch?.[2] ?? '';
      const optionType: 'call' | 'put' = cp === 'P' ? 'put' : 'call';
      return {
        symbol: symbol.toUpperCase(),
        expiry,
        strike,
        optionType,
        bid: mid * 0.95,
        ask: mid * 1.05,
        mid,
        openInterest: Number(item.open_interest ?? 0),
        volume: Number(item.volume ?? 0),
        impliedVolatility: 0, // not returned by screener
        delta: 0,
        gamma: 0,
        theta: 0,
        vega: 0,
      };
    }).filter((c) => Number.isFinite(c.strike) && c.strike > 0 && !!c.expiry);

    // If UW returned an empty list: in mock mode return synthetic legs; in strict
    // mode return an empty array (200) so the caller can decide per-direction whether
    // to skip, rather than treating 0 contracts the same as an API failure (502).
    if (normalized.length === 0) {
      console.info(`[unusual-whales/screener] UW returned 0 contracts for ${symbol.toUpperCase()} (${requestedTypes.join('+')})`);
      if (!allowMock) {
        return NextResponse.json([]);
      }
      return NextResponse.json(getMockContracts(symbol.toUpperCase(), direction === 'both' ? 'bullish' : direction, spotPrice));
    }

    return NextResponse.json(normalized);
  } catch (err: any) {
    console.error('[unusual-whales/screener] error:', err);
    if (!allowMock) {
      return NextResponse.json({ error: 'UW screener request failed' }, { status: 502 });
    }
    return NextResponse.json(getMockContracts(symbol.toUpperCase(), direction, spotPrice));
  }
}
