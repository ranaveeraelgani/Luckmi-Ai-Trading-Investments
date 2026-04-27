import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabaseServer";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("watchlists")
      .select("id, symbols")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Error loading watchlist:", error);
      return NextResponse.json({ error: "Failed to load watchlist" }, { status: 500 });
    }

    const items = Array.isArray(data?.symbols)
      ? data.symbols.map((symbol: string, index: number) => ({
          id: `${data.id}-${index}`,
          watchlist_id: data.id,
          symbol,
        }))
      : [];

    return NextResponse.json(items);
  } catch (error) {
    console.error("Watchlist route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}