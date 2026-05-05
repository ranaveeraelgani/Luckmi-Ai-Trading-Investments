// ============================================================
// UW Proxy — IV Rank
// GET /api/unusual-whales/iv?symbol=NVDA
//
// Proxies: GET /api/stock/{ticker}/iv-rank
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import type { UWVolatilityData } from '@/app/lib/options/types';

const UW_BASE = 'https://api.unusualwhales.com';

function getMockIv(symbol: string): UWVolatilityData {
  return {
    symbol,
    ivRank: 28,
    ivPercentile: 22,
    atmIv: 0.32,
    termStructure: 'contango',
  };
}

function normalizePercent(value: number): number {
  // UW can return iv_rank_1y either as 0-1 fraction or 0-100 percent.
  // Handle both and clamp to a valid 0-100 range.
  if (!Number.isFinite(value)) return 50;
  if (value <= 1) return Math.max(0, Math.min(100, Math.round(value * 100)));
  if (value <= 100) return Math.max(0, Math.min(100, Math.round(value)));
  // Guardrail for malformed scaling (e.g. 7625 for 76.25).
  return Math.max(0, Math.min(100, Math.round(value / 100)));
}

function normalizeIvDecimal(value: number): number {
  // UW volatility may arrive as decimal (0.32) or percent (32).
  if (!Number.isFinite(value)) return 0.30;
  if (value <= 2) return Number(value.toFixed(4));
  return Number((value / 100).toFixed(4));
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
    return NextResponse.json(getMockIv(symbol.toUpperCase()));
  }

  try {
    const res = await fetch(
      `${UW_BASE}/api/stock/${encodeURIComponent(symbol.toUpperCase())}/iv-rank`,
      { headers: { Authorization: `Bearer ${apiKey}` }, next: { revalidate: 300 } }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[unusual-whales/iv] UW returned ${res.status}. Body: ${body.slice(0, 200)}`);
      if (!allowMock) {
        return NextResponse.json({ error: `UW iv unavailable (${res.status})` }, { status: 502 });
      }
      return NextResponse.json(getMockIv(symbol.toUpperCase()));
    }
    const data = await res.json();
    // Response: { data: [{ iv_rank_1y, volatility, date, close }] } — array sorted by date.
    // NOTE: iv_rank_1y units are inconsistent across UW symbols/tiers (0-1 or 0-100).
    // Normalize safely to 0-100.
    const rows: any[] = Array.isArray(data?.data) ? data.data : [];
    const latest = rows[rows.length - 1] ?? {};
    const ivRankRaw = Number(latest.iv_rank_1y ?? 0.50);
    const ivRank = normalizePercent(ivRankRaw);
    const atmIv = normalizeIvDecimal(Number(latest.volatility ?? 0.30));

    // Term structure: compare near vs far IV using the first and last entries
    let termStructure: 'contango' | 'backwardation' | 'flat' = 'flat';
    if (rows.length >= 2) {
      const nearIv = Number(rows[0]?.volatility ?? 0);
      const farIv = Number(rows[rows.length - 1]?.volatility ?? 0);
      if (nearIv > 0 && farIv > 0) {
        termStructure = farIv > nearIv ? 'contango' : farIv < nearIv ? 'backwardation' : 'flat';
      }
    }

    const result: UWVolatilityData = {
      symbol: symbol.toUpperCase(),
      ivRank,
      ivPercentile: ivRank, // UW iv-rank only provides iv_rank_1y; use same value
      atmIv,
      termStructure,
    };
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[unusual-whales/iv] error:', err);
    if (!allowMock) {
      return NextResponse.json({ error: 'UW iv request failed' }, { status: 502 });
    }
    return NextResponse.json(getMockIv(symbol.toUpperCase()));
  }
}
