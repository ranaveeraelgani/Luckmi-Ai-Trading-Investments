import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const resolution = searchParams.get('resolution') || '5';

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
  }

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Finnhub API key missing on server' }, { status: 500 });
  }

  try {
    const from = Math.floor(Date.now() / 1000) - 86400 * 30; // last 30 days
    const to = Math.floor(Date.now() / 1000);
    //const url = `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=${resolution}&from=${from}&to=${to}&token=${apiKey}`;
    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/5/minute/${from}/${to}?adjusted=true&sort=asc&limit=50000&apiKey=${process.env.POLYGON_API_KEY}`;
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();

    if (data.s !== 'ok') {
      return NextResponse.json({ error: 'No candle data available' }, { status: 404 });
    }

    return NextResponse.json({
      t: data.t,
      o: data.o,
      h: data.h,
      l: data.l,
      c: data.c,
      v: data.v,
    });
  } catch (err) {
    console.error('Candles fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch candles' }, { status: 500 });
  }
}