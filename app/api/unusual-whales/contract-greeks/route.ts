// ============================================================
// UW Proxy — Per-contract greeks
// GET /api/unusual-whales/contract-greeks?symbol=AAPL260620C00200000
//
// Proxies: GET /api/contract/{symbol}/greeks
// Returns real delta/gamma/theta/vega/iv for a specific OCC contract.
// Used by the opportunities route for Phase-2 greeks hydration.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { uwFetch } from '@/app/lib/uw/client';

export type GreeksPatch = {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  iv: number;
  bid: number;
  ask: number;
  mid: number;
};

const ZERO_GREEKS: GreeksPatch = {
  delta: 0, gamma: 0, theta: 0, vega: 0, iv: 0, bid: 0, ask: 0, mid: 0,
};

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol');
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  // Validate the symbol looks like an OCC contract before proxying.
  const OCC_REGEX = /^[A-Z]{1,6}\d{6}[CP]\d{8}$/;
  if (!OCC_REGEX.test(symbol.toUpperCase())) {
    return NextResponse.json({ error: 'invalid OCC symbol' }, { status: 400 });
  }

  if (!process.env.UNUSUAL_WHALES_API_KEY) {
    // Return zeros so hydration is a no-op in mock mode.
    return NextResponse.json(ZERO_GREEKS);
  }

  try {
    const { data } = await uwFetch<{ data?: any }>(
      `/api/contract/${encodeURIComponent(symbol.toUpperCase())}/greeks`,
      { revalidate: 60 },
    );

    const d = data?.data ?? data ?? {};
    const bid = Number(d.bid ?? 0);
    const ask = Number(d.ask ?? 0);

    const result: GreeksPatch = {
      delta: Number(d.delta ?? 0),
      gamma: Number(d.gamma ?? 0),
      theta: Number(d.theta ?? 0),
      vega:  Number(d.vega  ?? 0),
      iv:    Number(d.implied_volatility ?? d.iv ?? 0),
      bid,
      ask,
      mid:   bid > 0 && ask > 0 ? (bid + ask) / 2 : Number(d.mid ?? 0),
    };

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[unusual-whales/contract-greeks] error:', err?.message ?? err);
    // Return zeros on failure so the caller degrades gracefully.
    return NextResponse.json(ZERO_GREEKS);
  }
}
