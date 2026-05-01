import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol')?.trim().toUpperCase();

  const apiKey = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY;
  if (!apiKey || !symbol) {
    return NextResponse.json({ error: 'Missing key or symbol' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://api.massive.com/v3/reference/tickers/${encodeURIComponent(symbol)}?apiKey=${apiKey}`,
      { next: { revalidate: 3600 } } // cache 1 hour — company info rarely changes
    );

    if (!res.ok) throw new Error(`Massive ${res.status}`);

    const data = await res.json();
    const r = data?.results;

    if (!r) {
      return NextResponse.json({ error: 'No company data found' }, { status: 404 });
    }

    return NextResponse.json({
      symbol: r.ticker,
      name: r.name || null,
      description: r.description || null,
      sector: r.sic_description || null,
      exchange: r.primary_exchange || null,
      marketCap: r.market_cap || null,
      employees: r.total_employees || null,
      homepageUrl: r.homepage_url || null,
      iconUrl: r.branding?.icon_url ? `${r.branding.icon_url}?apiKey=${apiKey}` : null,
      logoUrl: r.branding?.logo_url ? `${r.branding.logo_url}?apiKey=${apiKey}` : null,
    });
  } catch (err) {
    console.error('Company info fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch company info' }, { status: 500 });
  }
}
