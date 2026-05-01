// app/api/market-news/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const apiKey = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json({ error: 'Massive API key not configured' }, { status: 500 });
    }

    // Fetch general market news from Massive
    const response = await fetch(
      `https://api.massive.com/v2/reference/news?order=desc&sort=published_utc&limit=8&apiKey=${apiKey}`,
      { cache: 'no-store' }
    );

    if (!response.ok) {
      throw new Error(`Massive error: ${response.status}`);
    }

    const data = await response.json();
    const rows = Array.isArray(data?.results) ? data.results : [];

    // Return only the most relevant fields
    const formattedNews = rows.slice(0, 8).map((item: any) => ({
      headline: item.title || 'No headline',
      summary: item.description || '',
      url: item.article_url || '',
      source: item?.publisher?.name || 'Massive',
      datetime: item.published_utc ? new Date(item.published_utc).toLocaleDateString() : 'Recent',
    }));

    return NextResponse.json(formattedNews);
  } catch (error) {
    console.error('Market news fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch market news' },
      { status: 500 }
    );
  }
}