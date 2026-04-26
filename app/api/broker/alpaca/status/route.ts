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

    const [{ data: account }, { data: positions }, { data: orders }] =
      await Promise.all([
        supabase
          .from("broker_accounts")
          .select("*")
          .eq("user_id", user.id)
          .eq("broker", "alpaca")
          .order("last_synced_at", { ascending: false })
          .limit(1)
          .maybeSingle(),

        supabase
          .from("broker_positions")
          .select("*")
          .eq("user_id", user.id)
          .eq("broker", "alpaca")
          .order("symbol", { ascending: true }),

        supabase
          .from("broker_orders")
          .select("*")
          .eq("user_id", user.id)
          .eq("broker", "alpaca")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

    return NextResponse.json({
      account: account || null,
      positions: positions || [],
      recentOrders: orders || [],
    });
  } catch (error) {
    console.error("Broker status route error:", error);
    return NextResponse.json(
      { error: "Failed to load broker status" },
      { status: 500 }
    );
  }
}