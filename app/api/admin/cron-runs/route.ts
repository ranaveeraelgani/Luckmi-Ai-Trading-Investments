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

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile?.is_admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("cron_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ runs: data || [] });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to load cron runs" },
      { status: 500 }
    );
  }
}