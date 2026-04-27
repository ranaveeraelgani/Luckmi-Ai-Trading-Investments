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
      .from("engine_runs")
      .select(`
        id,
        run_type,
        status,
        trades_executed,
        stocks_processed,
        blocked_reason,
        error_message,
        created_at
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error loading last engine run:", error);
      return NextResponse.json(
        { error: "Failed to load last engine run" },
        { status: 500 }
      );
    }

    return NextResponse.json(data || null);
  } catch (error) {
    console.error("Last engine run route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}