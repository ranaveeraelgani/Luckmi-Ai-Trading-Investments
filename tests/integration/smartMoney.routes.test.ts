import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

vi.mock('@/app/lib/utils/get-base-url', () => ({
  getBaseUrl: () => 'http://localhost:3000',
}));

vi.mock('@/app/lib/smartMoney/fetchSmartMoneyInputs', async () => {
  const actual = await vi.importActual('@/app/lib/smartMoney/fetchSmartMoneyInputs');
  return {
    ...(actual as object),
    fetchSmartMoneyInputs: vi.fn(async (symbol: string) => ({
      symbol,
      flow: [],
      netPremium: null,
      gex: null,
      iv: null,
      ctsScore: 70,
      alignment: 'bullish_timing_weak',
      ctsMeta: {
        dailyCTS: 70,
        intradayCTS: 69,
      },
    })),
  };
});

vi.mock('@/app/lib/supabaseServer', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    },
  })),
}));

vi.mock('@/app/lib/smartMoney/logSmartMoneyAction', () => ({
  logSmartMoneyAction: vi.fn(async () => true),
}));

describe('smart money route integration', () => {
  beforeEach(() => {
    process.env.SMART_MONEY_ENABLED = 'true';
    vi.restoreAllMocks();
  });

  it('dashboard route returns 404 when feature is disabled', async () => {
    process.env.SMART_MONEY_ENABLED = 'false';
    const { GET } = await import('@/app/api/smart-money/dashboard/route');
    const req = new NextRequest('http://localhost:3000/api/smart-money/dashboard');
    const res = await GET(req);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.structuredError?.code).toBe('FEATURE_DISABLED');
  });

  it('dashboard route returns ranked items when enabled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            symbols: ['NVDA', 'AAPL'],
            source: 'test',
            generatedAt: new Date().toISOString(),
          }),
          { status: 200 },
        ),
      ),
    );

    const { GET } = await import('@/app/api/smart-money/dashboard/route');
    const req = new NextRequest('http://localhost:3000/api/smart-money/dashboard?limit=2');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0]).toHaveProperty('aiNarrative');
  });

  it('add-to-watchlist returns unauthorized without auth', async () => {
    const { POST } = await import('@/app/api/smart-money/actions/add-to-watchlist/route');
    const req = new Request('http://localhost:3000/api/smart-money/actions/add-to-watchlist', {
      method: 'POST',
      body: JSON.stringify({ symbol: 'NVDA' }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req as any);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.structuredError?.code).toBe('UNAUTHORIZED');
  });

  it('add-to-auto returns unauthorized without auth', async () => {
    const { POST } = await import('@/app/api/smart-money/actions/add-to-auto-trading/route');
    const req = new Request('http://localhost:3000/api/smart-money/actions/add-to-auto-trading', {
      method: 'POST',
      body: JSON.stringify({ symbol: 'NVDA' }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req as any);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.structuredError?.code).toBe('UNAUTHORIZED');
  });
});
