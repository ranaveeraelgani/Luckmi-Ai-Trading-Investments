import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const resolution = searchParams.get('resolution') || '5';

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
  }

  const apiKey = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Massive API key missing on server' }, { status: 500 });
  }

  try {
    const multiplier = Number.isFinite(Number(resolution)) ? Math.max(1, Number(resolution)) : 5;
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fromDate = from.toISOString().slice(0, 10);
    const toDate = to.toISOString().slice(0, 10);

    const url = `https://api.massive.com/v2/aggs/ticker/${symbol}/range/${multiplier}/minute/${fromDate}/${toDate}?adjusted=true&sort=asc&limit=50000&apiKey=${apiKey}`;
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();

    if (!res.ok || String(data?.status || '').toUpperCase() !== 'OK') {
      return NextResponse.json({ error: 'No candle data available' }, { status: 404 });
    }

    const results = Array.isArray(data?.results) ? data.results : [];
    if (results.length === 0) {
      return NextResponse.json({ error: 'No candle data available' }, { status: 404 });
    }

    return NextResponse.json({
      t: results.map((r: any) => Math.floor(Number(r.t) / 1000)),
      o: results.map((r: any) => r.o),
      h: results.map((r: any) => r.h),
      l: results.map((r: any) => r.l),
      c: results.map((r: any) => r.c),
      v: results.map((r: any) => r.v),
    });
  } catch (err) {
    console.error('Candles fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch candles' }, { status: 500 });
  }
}