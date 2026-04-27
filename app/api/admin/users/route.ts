import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth/admin";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

export async function GET() {
  try {
    await requireAdmin();

    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select(`
        user_id,
        email,
        full_name,
        plan,
        is_admin,
        created_at
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Admin users fetch error:", error);
      return NextResponse.json(
        { error: "Failed to load users" },
        { status: 500 }
      );
    }

    const userIds = (profiles || []).map((p) => p.user_id);

    const [
      brokerRes,
      stocksRes,
      positionsRes,
      runsRes,
      subscriptionsRes,
    ] = await Promise.all([
      supabaseAdmin
        .from("broker_keys")
        .select("user_id, broker, is_paper, connection_status, last_tested_at")
        .in("user_id", userIds),

      supabaseAdmin
        .from("auto_stocks")
        .select("user_id, id, symbol, status")
        .in("user_id", userIds),

      supabaseAdmin
        .from("positions")
        .select("user_id, id")
        .in("user_id", userIds),

      supabaseAdmin
        .from("engine_runs")
        .select("user_id, status, created_at")
        .in("user_id", userIds)
        .order("created_at", { ascending: false }),

      supabaseAdmin
        .from("subscriptions")
        .select("user_id, plan_code")
        .in("user_id", userIds),
    ]);

    const brokerMap = new Map(
      (brokerRes.data || []).map((row) => [row.user_id, row])
    );

    const subscriptionMap = new Map(
      (subscriptionsRes.data || []).map((row) => [row.user_id, row.plan_code])
    );

    const stocksByUser = new Map<string, number>();
    for (const stock of stocksRes.data || []) {
      stocksByUser.set(stock.user_id, (stocksByUser.get(stock.user_id) || 0) + 1);
    }

    const positionsByUser = new Map<string, number>();
    for (const pos of positionsRes.data || []) {
      positionsByUser.set(pos.user_id, (positionsByUser.get(pos.user_id) || 0) + 1);
    }

    const latestRunByUser = new Map<string, { status: string; created_at: string }>();
    for (const run of runsRes.data || []) {
      if (!latestRunByUser.has(run.user_id)) {
        latestRunByUser.set(run.user_id, {
          status: run.status,
          created_at: run.created_at,
        });
      }
    }

    const users = (profiles || []).map((profile) => ({
      ...profile,
      subscription_plan: subscriptionMap.get(profile.user_id) || null,
      broker: brokerMap.get(profile.user_id) || null,
      stock_count: stocksByUser.get(profile.user_id) || 0,
      position_count: positionsByUser.get(profile.user_id) || 0,
      last_engine_run: latestRunByUser.get(profile.user_id) || null,
    }));

    return NextResponse.json({ users });
  } catch (error: any) {
    const message = error?.message || "Unauthorized";

    if (message === "Unauthorized") {
      return NextResponse.json({ error: message }, { status: 401 });
    }

    if (message === "Forbidden") {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    console.error("Admin users route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}