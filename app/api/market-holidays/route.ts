import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Massive API key not configured' }, { status: 500 });
  }

  try {
    const res = await fetch(
      `https://api.massive.com/v1/marketstatus/upcoming?apiKey=${apiKey}`,
      { next: { revalidate: 3600 } } // cache 1 hour
    );

    if (!res.ok) throw new Error(`Massive ${res.status}`);

    const data = await res.json();

    // Massive returns an array of upcoming market events
    const events: Array<{ date: string; exchange: string; name: string; status: string }> =
      Array.isArray(data) ? data : [];

    // Return the next 5 events relevant to NYSE/NASDAQ
    const relevant = events
      .filter((e) => {
        const ex = String(e.exchange || '').toUpperCase();
        return ex === 'NYSE' || ex === 'NASDAQ' || ex === 'OTC';
      })
      .slice(0, 5)
      .map((e) => ({
        date: e.date,
        name: e.name,
        status: e.status, // "closed" | "early-close"
        exchange: e.exchange,
      }));

    return NextResponse.json(relevant);
  } catch (err) {
    console.error('Market holidays fetch error:', err);
    return NextResponse.json([], { status: 200 }); // soft fail — banner just won't show
  }
}
