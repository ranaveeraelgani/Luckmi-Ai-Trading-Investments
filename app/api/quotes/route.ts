import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbols = searchParams.get('symbols');

  const apiKey = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY;
  if (!apiKey || !symbols) {
    return NextResponse.json({ error: 'Missing Massive API key or symbols' }, { status: 400 });
  }

  try {
    const symbolList = symbols
      .split(',')
      .map((s) => String(s || '').trim().toUpperCase())
      .filter(Boolean);

    if (symbolList.length === 0) {
      return NextResponse.json([]);
    }

    const url = `https://api.massive.com/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${encodeURIComponent(symbolList.join(','))}&apiKey=${apiKey}`;
    const res = await fetch(url, { cache: 'no-store' });

    if (!res.ok) {
      throw new Error(`Massive error ${res.status}`);
    }

    const payload = await res.json();
    const rows: any[] = Array.isArray(payload?.tickers) ? payload.tickers : [];
    const byTicker = new Map<string, any>(
      rows
        .filter((r) => r?.ticker)
        .map((r) => [String(r.ticker).toUpperCase(), r])
    );

    const data = symbolList.map((symbol) => {
      const row = byTicker.get(symbol);
      if (!row) {
        return { symbol, error: true, price: 'N/A', change: 0, percentChange: 0 };
      }

      const price = Number(row?.lastTrade?.p ?? row?.min?.c ?? row?.day?.c ?? row?.prevDay?.c);
      const change = Number(row?.todaysChange ?? 0);
      const percentChange = Number(row?.todaysChangePerc ?? 0);

      return {
        symbol,
        price: Number.isFinite(price) ? price.toFixed(2) : 'N/A',
        change: Number.isFinite(change) ? change.toFixed(2) : '0',
        percentChange: Number.isFinite(percentChange) ? percentChange.toFixed(2) : '0',
      };
    });

    return NextResponse.json(data);
  } catch (err) {
    console.error('Quotes route error', err);
    return NextResponse.json({ error: 'Failed to fetch quotes' }, { status: 500 });
  }
}