import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.POLYGON_API_KEY;

  if (!apiKey) {
    console.error('Missing POLYGON_API_KEY in environment');
    return NextResponse.json(
      { error: 'Server configuration error: API key missing' },
      { status: 500 }
    );
  }

  try {
    const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/gainers?apiKey=${apiKey}`;
    console.log('Fetching Polygon gainers from:', url.replace(apiKey, '***')); // hide key in logs

    const res = await fetch(url, {
      next: { revalidate: 180 }, // 3 min cache
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Polygon fetch failed: ${res.status} - ${errorText}`);
      return NextResponse.json(
        { error: `Polygon API error: ${res.status} - ${errorText.slice(0, 200)}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    console.log('Polygon raw response:', JSON.stringify(data, null, 2).slice(0, 500)); // truncate for logs

    const tickers = data.tickers || [];
    if (tickers.length === 0) {
      console.warn('Polygon returned empty gainers list');
    }

    const trending = tickers.slice(0, 10).map((t: any) => ({
      symbol: t.ticker || 'N/A',
      price: t.lastQuote?.p?.toFixed(2) ?? 'N/A',
      changePercent: t.todaysChangePerc?.toFixed(2) ?? '0',
      volume: t.day?.v ?? 0,
    }));

    return NextResponse.json(trending);
  } catch (err: any) {
    console.error('API route crash:', err.message, err.stack?.slice(0, 300));
    return NextResponse.json(
      { error: 'Internal server error while fetching trending stocks' },
      { status: 500 }
    );
  }
}