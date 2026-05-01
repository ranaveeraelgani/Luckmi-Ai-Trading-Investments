import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol')?.trim().toUpperCase();

  const apiKey = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY;
  if (!apiKey || !symbol) {
    return NextResponse.json({ error: 'Missing key/symbol' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://api.massive.com/v2/reference/news?ticker=${encodeURIComponent(symbol)}&order=desc&sort=published_utc&limit=10&apiKey=${apiKey}`,
      { cache: 'no-store' }
    );

    if (!res.ok) throw new Error(`Massive ${res.status}`);

    const data = await res.json();
    const rows = Array.isArray(data?.results) ? data.results : [];

    const recent = rows.slice(0, 10).map((n: any) => ({
      headline: n.title || 'No headline',
      summary: n.description || '',
      datetime: n.published_utc ? new Date(n.published_utc) : new Date(),
    }));

    return NextResponse.json(recent);
  } catch (err) {
    console.error('News error', err);
    return NextResponse.json({ error: 'Failed to fetch news' }, { status: 500 });
  }
}