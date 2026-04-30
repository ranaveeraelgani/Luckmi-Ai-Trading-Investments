import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

export function resolveOverviewRange(rangeRaw: string) {
  const range = (rangeRaw || "30d").toLowerCase();
  const now = Date.now();
  const rangeDays =
    range === "7d" ? 7 : range === "90d" ? 90 : range === "all" ? null : 30;
  const cutoffIso = rangeDays
    ? new Date(now - rangeDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  return { range, cutoffIso };
}

export async function loadAdminSystemReviewData() {
  const [
    profilesRes,
    tradesRes,
    decisionsRes,
    runsRes,
    positionsRes,
    brokerOrdersRes,
    subscriptionsRes,
  ] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("user_id")
      .order("created_at", { ascending: false })
      .limit(5000),
    supabaseAdmin
      .from("trades")
      .select("user_id, symbol, type, pnl, confidence, cts_score, created_at")
      .order("created_at", { ascending: false })
      .limit(10000),
    supabaseAdmin
      .from("ai_decisions")
      .select("user_id, symbol, action, confidence, cts_score, created_at")
      .order("created_at", { ascending: false })
      .limit(10000),
    supabaseAdmin
      .from("engine_runs")
      .select("user_id, status, trades_executed, created_at")
      .order("created_at", { ascending: false })
      .limit(10000),
    supabaseAdmin
      .from("positions")
      .select("user_id, symbol, status, pnl")
      .limit(10000),
    supabaseAdmin
      .from("broker_orders")
      .select("user_id, symbol, side, status, qty, created_at")
      .order("created_at", { ascending: false })
      .limit(5000),
    supabaseAdmin
      .from("subscriptions")
      .select("user_id, plan_code, status")
      .limit(5000),
  ]);

  const loadError =
    profilesRes.error ||
    tradesRes.error ||
    decisionsRes.error ||
    runsRes.error ||
    positionsRes.error ||
    brokerOrdersRes.error ||
    subscriptionsRes.error;

  if (loadError) {
    throw new Error(loadError.message || "Failed to load admin system review data");
  }

  return {
    profiles: profilesRes.data || [],
    trades: tradesRes.data || [],
    decisions: decisionsRes.data || [],
    runs: runsRes.data || [],
    positions: positionsRes.data || [],
    brokerOrders: brokerOrdersRes.data || [],
    subscriptions: subscriptionsRes.data || [],
  };
}

export async function loadAdminOverviewData(rangeRaw: string) {
  const { range, cutoffIso } = resolveOverviewRange(rangeRaw);

  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from("profiles")
    .select("user_id, full_name, email, created_at")
    .order("created_at", { ascending: false });

  if (profilesError) {
    throw new Error(profilesError.message || "Failed to load profiles");
  }

  const users = profiles || [];
  const userIds = users.map((u) => u.user_id);

  if (userIds.length === 0) {
    return {
      range,
      users,
      userIds,
      subscriptions: [],
      positions: [],
      trades: [],
      decisions: [],
      runs: [],
      brokerOrders: [],
    };
  }

  const tradesQuery = supabaseAdmin
    .from("trades")
    .select("user_id, symbol, type, pnl, cts_score, created_at")
    .in("user_id", userIds)
    .order("created_at", { ascending: false })
    .limit(range === "all" ? 50000 : 20000);

  const decisionsQuery = supabaseAdmin
    .from("ai_decisions")
    .select("user_id, symbol, action, confidence, cts_score, created_at")
    .in("user_id", userIds)
    .order("created_at", { ascending: false })
    .limit(range === "all" ? 50000 : 20000);

  const runsQuery = supabaseAdmin
    .from("engine_runs")
    .select("user_id, status, trades_executed, stocks_processed, created_at")
    .in("user_id", userIds)
    .order("created_at", { ascending: false })
    .limit(range === "all" ? 50000 : 20000);

  const brokerOrdersQuery = supabaseAdmin
    .from("broker_orders")
    .select("user_id, symbol, side, status, qty, created_at")
    .in("user_id", userIds)
    .order("created_at", { ascending: false })
    .limit(range === "all" ? 50000 : 20000);

  if (cutoffIso) {
    tradesQuery.gte("created_at", cutoffIso);
    decisionsQuery.gte("created_at", cutoffIso);
    runsQuery.gte("created_at", cutoffIso);
    brokerOrdersQuery.gte("created_at", cutoffIso);
  }

  const [subscriptionsRes, positionsRes, tradesRes, decisionsRes, runsRes, brokerOrdersRes] =
    await Promise.all([
      supabaseAdmin
        .from("subscriptions")
        .select("user_id, plan_code, status")
        .in("user_id", userIds),
      supabaseAdmin
        .from("positions")
        .select("user_id, symbol, status, pnl")
        .in("user_id", userIds),
      tradesQuery,
      decisionsQuery,
      runsQuery,
      brokerOrdersQuery,
    ]);

  const loadError =
    subscriptionsRes.error ||
    positionsRes.error ||
    tradesRes.error ||
    decisionsRes.error ||
    runsRes.error ||
    brokerOrdersRes.error;

  if (loadError) {
    throw new Error(loadError.message || "Failed to load report data");
  }

  return {
    range,
    users,
    userIds,
    subscriptions: subscriptionsRes.data || [],
    positions: positionsRes.data || [],
    trades: tradesRes.data || [],
    decisions: decisionsRes.data || [],
    runs: runsRes.data || [],
    brokerOrders: brokerOrdersRes.data || [],
  };
}
