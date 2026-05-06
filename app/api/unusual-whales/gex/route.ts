// ============================================================
// UW Proxy — GEX (Gamma Exposure) by Strike
// GET /api/unusual-whales/gex?symbol=NVDA
//
// Proxies: GET /api/stock/{ticker}/greek-exposure/strike
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import type { UWGexData, GexBias } from '@/app/lib/options/types';
import { uwFetch } from '@/app/lib/uw/client';

function getMockGex(symbol: string): UWGexData {
  return {
    symbol,
    totalGex: -850_000_000,
    spotPrice: 897.50,
    gexBias: 'negative',
    keyStrikes: [
      { strike: 900, gexValue: -250_000_000, distancePct: 0.28 },
      { strike: 920, gexValue: -180_000_000, distancePct: 2.5 },
      { strike: 880, gexValue: 120_000_000, distancePct: -1.95 },
      { strike: 950, gexValue: -90_000_000, distancePct: 5.85 },
    ],
    maxPainStrike: 885,
    highestGexStrike: 900,
  };
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol');
  const allowMock = req.nextUrl.searchParams.get('allowMock') !== '0';
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  if (!process.env.UNUSUAL_WHALES_API_KEY) {
    if (!allowMock) {
      return NextResponse.json({ error: 'UW API key missing and mock disabled' }, { status: 503 });
    }
    return NextResponse.json(getMockGex(symbol.toUpperCase()));
  }

  try {
    const { data } = await uwFetch<{ data?: unknown[] }>(
      `/api/stock/${encodeURIComponent(symbol.toUpperCase())}/greek-exposure/strike`,
      { revalidate: 120 }
    );
    // Response: { data: [{ strike, call_gex, put_gex, call_delta, put_delta, ... }] }
    const rows: any[] = Array.isArray(data?.data) ? data.data : [];

    const strikes = rows.map((s: any) => ({
      strike: Number(s.strike ?? 0),
      gexValue: Number(s.call_gex ?? 0) + Number(s.put_gex ?? 0),
      distancePct: 0, // spot price not available from this endpoint
    }));

    const totalGex = strikes.reduce((sum, s) => sum + s.gexValue, 0);
    const gexBias: GexBias = totalGex < -100_000_000
      ? 'negative'
      : totalGex > 100_000_000
        ? 'positive'
        : 'neutral';

    const sorted = [...strikes].sort((a, b) => Math.abs(b.gexValue) - Math.abs(a.gexValue));

    const result: UWGexData = {
      symbol: symbol.toUpperCase(),
      totalGex,
      spotPrice: 0, // not available from greek-exposure/strike endpoint
      gexBias,
      keyStrikes: sorted.slice(0, 10),
      maxPainStrike: 0,
      highestGexStrike: sorted[0]?.strike ?? 0,
    };
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[unusual-whales/gex] error:', err);
    if (!allowMock) {
      return NextResponse.json({ error: 'UW gex request failed' }, { status: 502 });
    }
    return NextResponse.json(getMockGex(symbol.toUpperCase()));
  }
}
