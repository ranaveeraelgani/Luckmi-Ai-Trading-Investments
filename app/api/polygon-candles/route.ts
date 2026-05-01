import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol')?.toUpperCase();
  const multiplier = searchParams.get('multiplier') || '5';
  const timespan = searchParams.get('timespan') || 'minute';
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  if (!symbol || !from || !to) {
    return NextResponse.json({ error: 'Missing required params: symbol, from, to' }, { status: 400 });
  }

  const apiKey = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Massive API key missing on server' }, { status: 500 });
  }

  try {
    const url = `https://api.massive.com/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&limit=50000&apiKey=${apiKey}`;

    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();

    if (!res.ok || data.error) {
      console.error('Massive error:', data);
      return NextResponse.json({ error: data.error || 'Failed to fetch from Massive' }, { status: res.status });
    }

    if (!data.results || data.results.length === 0) {
      return NextResponse.json({ error: 'No candle data available' }, { status: 404 });
    }

    return NextResponse.json({
      t: data.results.map((r: any) => r.t / 1000), // timestamp in seconds
      o: data.results.map((r: any) => r.o),
      h: data.results.map((r: any) => r.h),
      l: data.results.map((r: any) => r.l),
      c: data.results.map((r: any) => r.c),
      v: data.results.map((r: any) => r.v),
    });
  } catch (err) {
    console.error('Massive fetch error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}