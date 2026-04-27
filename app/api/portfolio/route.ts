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
      .from("portfolios")
      .select("positions")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Error loading portfolio:", error);
      return NextResponse.json({ error: "Failed to load portfolio" }, { status: 500 });
    }

    const positions = Array.isArray(data?.positions) ? data.positions : [];

    return NextResponse.json(positions);
  } catch (error) {
    console.error("Portfolio route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}