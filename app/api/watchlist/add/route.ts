import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const symbol = String(body.symbol || "").trim().toUpperCase();

    if (!symbol) {
      return NextResponse.json(
        { error: "Symbol is required" },
        { status: 400 }
      );
    }

    const massiveApiKey = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY;
    if (!massiveApiKey) {
      return NextResponse.json(
        { error: "Price validation is unavailable right now" },
        { status: 503 }
      );
    }

    const quoteRes = await fetch(
      `https://api.massive.com/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${encodeURIComponent(symbol)}&apiKey=${massiveApiKey}`,
      { cache: "no-store" }
    );

    if (!quoteRes.ok) {
      return NextResponse.json(
        { error: `Unable to validate live price for ${symbol}` },
        { status: 400 }
      );
    }

    const quoteData = await quoteRes.json();
    const row = Array.isArray(quoteData?.tickers) ? quoteData.tickers[0] : null;
    const lastPrice = Number(row?.lastTrade?.p ?? row?.min?.c ?? row?.day?.c ?? row?.prevDay?.c);
    if (!Number.isFinite(lastPrice) || lastPrice <= 0) {
      return NextResponse.json(
        { error: `${symbol} has no live price and cannot be added` },
        { status: 400 }
      );
    }

    const { data: existing, error: existingError } = await supabase
      .from("watchlists")
      .select("id, symbols")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingError) {
      console.error("Error loading watchlist for add:", existingError);
      return NextResponse.json(
        { error: "Failed to load watchlist" },
        { status: 500 }
      );
    }

    const currentSymbols = Array.isArray(existing?.symbols) ? existing.symbols : [];

    if (currentSymbols.includes(symbol)) {
      return NextResponse.json(
        { error: `${symbol} is already in your watchlist` },
        { status: 409 }
      );
    }

    const nextSymbols = [...currentSymbols, symbol];

    if (existing?.id) {
      const { error: updateError } = await supabase
        .from("watchlists")
        .update({ symbols: nextSymbols })
        .eq("id", existing.id)
        .eq("user_id", user.id);

      if (updateError) {
        console.error("Error updating watchlist:", updateError);
        return NextResponse.json(
          { error: "Failed to update watchlist" },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, symbol });
    }

    const { error: insertError } = await supabase.from("watchlists").insert({
      user_id: user.id,
      symbols: [symbol],
    });

    if (insertError) {
      console.error("Error creating watchlist:", insertError);
      return NextResponse.json(
        { error: "Failed to create watchlist" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, symbol });
  } catch (error) {
    console.error("Watchlist add route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}