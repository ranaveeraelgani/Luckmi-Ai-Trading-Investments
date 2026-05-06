// ============================================================
// UW Proxy — Options Flow
// GET /api/unusual-whales/flow?symbol=NVDA
//
// Proxies: GET /api/stock/{ticker}/flow-recent
// Returns aggregated call/put flow per expiry for the ticker.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import type { UWOptionsFlowItem } from '@/app/lib/options/types';
import { uwFetch } from '@/app/lib/uw/client';

function getMockFlow(symbol: string): UWOptionsFlowItem[] {
  const now = new Date().toISOString();
  return [
    {
      symbol,
      expiry: '2026-05-22',
      strike: 900,
      optionType: 'call',
      premium: 125000,
      size: 500,
      openInterest: 8200,
      impliedVolatility: 0.28,
      flowType: 'sweep',
      isUnusual: true,
      side: 'ask',
      timestamp: now,
    },
    {
      symbol,
      expiry: '2026-05-22',
      strike: 910,
      optionType: 'call',
      premium: 85000,
      size: 300,
      openInterest: 5500,
      impliedVolatility: 0.27,
      flowType: 'block',
      isUnusual: true,
      side: 'ask',
      timestamp: now,
    },
    {
      symbol,
      expiry: '2026-05-15',
      strike: 880,
      optionType: 'put',
      premium: 45000,
      size: 200,
      openInterest: 3100,
      impliedVolatility: 0.31,
      flowType: 'split',
      isUnusual: false,
      side: 'bid',
      timestamp: now,
    },
  ];
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol');
  const allowMock = req.nextUrl.searchParams.get('allowMock') !== '0';
  if (!symbol) {
    return NextResponse.json({ error: 'symbol required' }, { status: 400 });
  }

  // ── MOCK MODE (no API key) ───────────────────────────────
  if (!process.env.UNUSUAL_WHALES_API_KEY) {
    if (!allowMock) {
      return NextResponse.json({ error: 'UW API key missing and mock disabled' }, { status: 503 });
    }
    return NextResponse.json(getMockFlow(symbol.toUpperCase()));
  }

  // ── REAL UW API ──────────────────────────────────────────
  try {
    const { data } = await uwFetch<{ data?: unknown[] }>(
      `/api/stock/${encodeURIComponent(symbol.toUpperCase())}/flow-recent`,
      { revalidate: 60 }
    );
    // flow-recent returns aggregated data per expiry (not individual contracts).
    // We create one synthetic call item and one put item per expiry row.
    const rows: any[] = Array.isArray(data?.data) ? data.data : [];
    const timestamp = new Date().toISOString();

    const normalized: UWOptionsFlowItem[] = rows.flatMap((item: any) => {
      const expiry: string = item.expiry ?? '';
      const callPrem = Number(item.call_premium ?? 0);
      const putPrem = Number(item.put_premium ?? 0);
      const callAsk = Number(item.call_premium_ask_side ?? 0);
      const callBid = Number(item.call_premium_bid_side ?? 0);
      const putAsk = Number(item.put_premium_ask_side ?? 0);
      const putBid = Number(item.put_premium_bid_side ?? 0);
      const items: UWOptionsFlowItem[] = [];
      if (callPrem > 0) items.push({
        symbol: symbol.toUpperCase(), expiry, strike: 0, optionType: 'call',
        premium: callPrem, size: Number(item.call_volume ?? 0), openInterest: 0,
        impliedVolatility: 0,
        flowType: 'block',
        isUnusual: callPrem > 1_000_000,
        side: callAsk >= callBid ? 'ask' : 'bid',
        timestamp,
      });
      if (putPrem > 0) items.push({
        symbol: symbol.toUpperCase(), expiry, strike: 0, optionType: 'put',
        premium: putPrem, size: Number(item.put_volume ?? 0), openInterest: 0,
        impliedVolatility: 0,
        flowType: 'block',
        isUnusual: putPrem > 1_000_000,
        side: putAsk >= putBid ? 'ask' : 'bid',
        timestamp,
      });
      return items;
    });

    if (normalized.length === 0) {
      // Zero flow items is a valid market state (no recent unusual activity for this symbol).
      // Return an empty array with 200 so the scoring engine can penalise the flow score
      // without treating this as a hard infrastructure failure.
      console.info(`[unusual-whales/flow] ${symbol.toUpperCase()}: 0 flow items from UW (valid empty response)`);
      return NextResponse.json([]);
    }
    return NextResponse.json(normalized);
  } catch (err: any) {
    console.error('[unusual-whales/flow] error:', err);
    if (!allowMock) {
      return NextResponse.json({ error: 'UW flow request failed' }, { status: 502 });
    }
    return NextResponse.json(getMockFlow(symbol.toUpperCase()));
  }
}
