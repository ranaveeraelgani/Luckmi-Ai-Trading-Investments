// app/api/market-news/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const apiKey = process.env.FINNHUB_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json({ error: 'Finnhub API key not configured' }, { status: 500 });
    }

    // Fetch general market news from Finnhub
    const response = await fetch(
      `https://finnhub.io/api/v1/news?category=general&token=${apiKey}`,
      { cache: 'no-store' } // or 'force-cache' if you want some caching
    );

    if (!response.ok) {
      throw new Error(`Finnhub error: ${response.status}`);
    }

    const data = await response.json();

    // Return only the most relevant fields
    const formattedNews = data.slice(0, 8).map((item: any) => ({
      headline: item.headline || 'No headline',
      summary: item.summary || '',
      url: item.url || '',
      source: item.source || 'Finnhub',
      datetime: item.datetime ? new Date(item.datetime * 1000).toLocaleDateString() : 'Recent',
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