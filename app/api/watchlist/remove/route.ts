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

    const { data: existing, error: existingError } = await supabase
      .from("watchlists")
      .select("id, symbols")
      .eq("user_id", user.id)
      .single();

    if (existingError || !existing) {
      return NextResponse.json(
        { error: "Watchlist not found" },
        { status: 404 }
      );
    }

    const currentSymbols = Array.isArray(existing.symbols) ? existing.symbols : [];
    const nextSymbols = currentSymbols.filter((s: string) => s !== symbol);

    const { error: updateError } = await supabase
      .from("watchlists")
      .update({ symbols: nextSymbols })
      .eq("id", existing.id)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("Error removing from watchlist:", updateError);
      return NextResponse.json(
        { error: "Failed to update watchlist" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, symbol });
  } catch (error) {
    console.error("Watchlist remove route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}