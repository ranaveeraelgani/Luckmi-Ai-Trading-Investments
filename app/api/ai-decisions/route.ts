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
      .from("ai_decisions")
      .select(`
        id,
        user_id,
        auto_stock_id,
        broker_order_id,
        symbol,
        action,
        reason,
        confidence,
        cts_score,
        cts_breakdown,
        created_at
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("AI decisions load error:", error);
      return NextResponse.json(
        { error: "Failed to load AI decisions" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      decisions: data || [],
    });
  } catch (error) {
    console.error("AI decisions route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}