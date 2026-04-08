import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');

  const apiKey = process.env.FINNHUB_API_KEY; // ← same key you use for /api/quotes
  if (!apiKey || !symbol) {
    return NextResponse.json({ error: 'Missing key/symbol' }, { status: 400 });
  }

  try {
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const to = new Date().toISOString().split('T')[0];

    const res = await fetch(
      `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${apiKey}`
    );

    if (!res.ok) throw new Error(`Finnhub ${res.status}`);

    const news = await res.json();
    // Last 10 items only
    const recent = news.slice(0, 10).map((n: any) => ({
      headline: n.headline,
      summary: n.summary || '',
      datetime: new Date(n.datetime * 1000),
    }));

    return NextResponse.json(recent);
  } catch (err) {
    console.error('News error', err);
    return NextResponse.json({ error: 'Failed to fetch news' }, { status: 500 });
  }
}