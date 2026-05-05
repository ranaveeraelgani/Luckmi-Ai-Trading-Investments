// ============================================================
// UW Proxy — Net Premium Ticks
// GET /api/unusual-whales/net-premium?symbol=NVDA
//
// Proxies: GET /api/stock/{ticker}/net-prem-ticks
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import type { UWNetPremiumTick } from '@/app/lib/options/types';

const UW_BASE = 'https://api.unusualwhales.com';

function getMockNetPremium(symbol: string): UWNetPremiumTick {
  return {
    symbol,
    callPremium: 3_250_000,
    putPremium: 1_100_000,
    netBias: 2_150_000,
    timestamp: new Date().toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol');
  const allowMock = req.nextUrl.searchParams.get('allowMock') !== '0';
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  const apiKey = process.env.UNUSUAL_WHALES_API_KEY;
  if (!apiKey) {
    if (!allowMock) {
      return NextResponse.json({ error: 'UW API key missing and mock disabled' }, { status: 503 });
    }
    return NextResponse.json(getMockNetPremium(symbol.toUpperCase()));
  }

  try {
    const res = await fetch(
      `${UW_BASE}/api/stock/${encodeURIComponent(symbol.toUpperCase())}/net-prem-ticks`,
      { headers: { Authorization: `Bearer ${apiKey}` }, next: { revalidate: 60 } }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[unusual-whales/net-premium] UW returned ${res.status}. Body: ${body.slice(0, 200)}`);
      if (!allowMock) {
        return NextResponse.json({ error: `UW net-premium unavailable (${res.status})` }, { status: 502 });
      }
      return NextResponse.json(getMockNetPremium(symbol.toUpperCase()));
    }
    const data = await res.json();

    // UW returns per-minute ticks: net_call_premium / net_put_premium are deltas.
    // Sum all ticks to get the cumulative day total.
    const ticks: any[] = Array.isArray(data?.data) ? data.data : [];
    let callPremium = 0, putPremium = 0;
    for (const t of ticks) {
      callPremium += Number(t.net_call_premium ?? t.call_premium ?? 0);
      putPremium += Number(t.net_put_premium ?? t.put_premium ?? 0);
    }
    const result: UWNetPremiumTick = {
      symbol: symbol.toUpperCase(),
      callPremium,
      putPremium,
      netBias: callPremium - putPremium,
      timestamp: ticks[ticks.length - 1]?.tape_time ?? new Date().toISOString(),
    };
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[unusual-whales/net-premium] error:', err);
    if (!allowMock) {
      return NextResponse.json({ error: 'UW net-premium request failed' }, { status: 502 });
    }
    return NextResponse.json(getMockNetPremium(symbol.toUpperCase()));
  }
}
