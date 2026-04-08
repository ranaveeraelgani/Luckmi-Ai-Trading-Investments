import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbols = searchParams.get('symbols');

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey || !symbols) {
    return NextResponse.json({ error: 'Missing Finnhub API key or symbols' }, { status: 400 });
  }

  try {
    const symbolList = symbols.split(',');
    const results = [];

    // Finnhub quote is per-symbol, so we make parallel calls
    const promises = symbolList.map(async (symbol) => {
      try {
        const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`);
        if (!res.ok) throw new Error(`Finnhub error ${res.status}`);

        const data = await res.json();

        return {
          symbol,
          price: data.c ? data.c.toFixed(2) : 'N/A',
          change: data.d ? data.d.toFixed(2) : '0',
          percentChange: data.dp ? data.dp.toFixed(2) : '0',
        };
      } catch (err) {
        return { symbol, error: true, price: 'N/A', change: 0, percentChange: 0 };
      }
    });

    const data = await Promise.all(promises);
    return NextResponse.json(data);
  } catch (err) {
    console.error('Quotes route error', err);
    return NextResponse.json({ error: 'Failed to fetch quotes' }, { status: 500 });
  }
}