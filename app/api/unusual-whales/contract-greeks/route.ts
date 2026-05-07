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

const OCC_REGEX = /^([A-Z]{1,6})(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/;

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    if (k in obj) {
      const n = toNumber(obj[k]);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

function normalizeFromContractRow(row: Record<string, unknown>): GreeksPatch {
  const bid = pickNumber(row, ['bid', 'bid_price']);
  const ask = pickNumber(row, ['ask', 'ask_price']);
  const explicitMid = pickNumber(row, ['mid', 'mid_price', 'mark', 'mark_price']);

  return {
    delta: pickNumber(row, ['delta']),
    gamma: pickNumber(row, ['gamma']),
    theta: pickNumber(row, ['theta']),
    vega: pickNumber(row, ['vega']),
    iv: pickNumber(row, ['implied_volatility', 'iv', 'iv_current']),
    bid,
    ask,
    mid: bid > 0 && ask > 0 ? (bid + ask) / 2 : explicitMid,
  };
}

function firstArrayPayload(data: any): Record<string, unknown>[] {
  if (Array.isArray(data?.data)) return data.data as Record<string, unknown>[];
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  return [];
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol');
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  // Validate the symbol looks like an OCC contract before proxying.
  const occ = symbol.toUpperCase();
  const m = occ.match(OCC_REGEX);
  if (!m) {
    return NextResponse.json({ error: 'invalid OCC symbol' }, { status: 400 });
  }

  const [, ticker, yy, mm, dd, cp, strikeRaw] = m;
  const expiry = `20${yy}-${mm}-${dd}`;
  const optionType = cp === 'P' ? 'put' : 'call';
  const strike = Number(strikeRaw) / 1000;

  if (!process.env.UNUSUAL_WHALES_API_KEY) {
    // Return zeros so hydration is a no-op in mock mode.
    return NextResponse.json(ZERO_GREEKS);
  }

  const errors: string[] = [];

  // Primary path from UW OpenAPI: filter option-contracts by exact option symbol.
  try {
    const params = new URLSearchParams({
      expiry,
      option_type: optionType,
      'option_symbol[]': occ,
      limit: '5',
    });
    const { data } = await uwFetch<{ data?: any[] }>(
      `/api/stock/${encodeURIComponent(ticker)}/option-contracts?${params.toString()}`,
      { revalidate: 60 },
    );

    const rows = firstArrayPayload(data);
    const exact = rows.find((r) => String(r.option_symbol ?? '').toUpperCase() === occ) ?? rows[0];
    if (exact) {
      const normalized = normalizeFromContractRow(exact);
      if (Object.values(normalized).some((v) => v !== 0)) {
        return NextResponse.json(normalized);
      }
    }
  } catch (err: any) {
    errors.push(`option-contracts: ${String(err?.message ?? err).slice(0, 180)}`);
  }

  // Fallback path from UW OpenAPI: per-expiry greeks by ticker.
  try {
    const params = new URLSearchParams({ expiry });
    const { data } = await uwFetch<{ data?: any[] }>(
      `/api/stock/${encodeURIComponent(ticker)}/greeks?${params.toString()}`,
      { revalidate: 60 },
    );

    const rows = firstArrayPayload(data);
    const matched = rows.find((r) => {
      const rowType = String(r.option_type ?? r.type ?? '').toLowerCase();
      const rowStrike = toNumber(r.strike ?? r.strike_price);
      const strikeClose = Math.abs(rowStrike - strike) < 0.001;
      const typeMatches = rowType ? rowType === optionType : true;
      return strikeClose && typeMatches;
    });

    if (matched) {
      const normalized = normalizeFromContractRow(matched);
      return NextResponse.json(normalized);
    }
  } catch (err: any) {
    errors.push(`stock-greeks: ${String(err?.message ?? err).slice(0, 180)}`);
  }

  if (errors.length > 0) {
    console.warn(`[unusual-whales/contract-greeks] no greeks for ${occ}; ${errors.join(' | ')}`);
  }

  // Degrade gracefully; opportunities route can continue with deterministic score.
  return NextResponse.json(ZERO_GREEKS);
}
