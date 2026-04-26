import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabaseServer";

export async function GET(req: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limitParam = Number(searchParams.get("limit") || 100);
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), 500)
      : 100;

    const { data, error } = await supabase
      .from("trades")
      .select(`
        id,
        user_id,
        auto_stock_id,
        broker_order_id,
        broker_mode,
        symbol,
        type,
        shares,
        price,
        amount,
        pnl,
        reason,
        confidence,
        cts_score,
        sell_score,
        created_at
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Trades load error:", error);
      return NextResponse.json(
        { error: error.message || "Failed to load trades" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      trades: data || [],
    });
  } catch (error: any) {
    console.error("Trades route error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}