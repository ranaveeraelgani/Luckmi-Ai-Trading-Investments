import { redirect } from "next/navigation";
import TopNav from "@/components/TopNav";
import { createClient } from "@/app/lib/supabaseServer";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";
import { AdminUsersTable, type AdminUserRow } from "./users-table";

async function getAdminUsers(): Promise<AdminUserRow[]> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: me, error: meError } = await supabaseAdmin
    .from("profiles")
    .select("user_id, is_admin")
    .eq("user_id", user.id)
    .single();

  if (meError || !me?.is_admin) {
    redirect("/dashboard");
  }

  const { data: profiles, error } = await supabaseAdmin
    .from("profiles")
    .select("user_id, email, full_name, plan, is_admin, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load users: ${error.message}`);
  }

  if (!profiles || profiles.length === 0) {
    return [];
  }

  const userIds = profiles.map((p) => p.user_id);

  const [stocksRes, runsRes, subscriptionsRes] = await Promise.all([
    supabaseAdmin
      .from("auto_stocks")
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

  const subscriptionMap = new Map(
    (subscriptionsRes.data || []).map((row) => [row.user_id, row.plan_code])
  );

  const stocksByUser = new Map<string, number>();
  for (const stock of stocksRes.data || []) {
    stocksByUser.set(stock.user_id, (stocksByUser.get(stock.user_id) || 0) + 1);
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

  return profiles.map((profile) => ({
    user_id: profile.user_id,
    full_name: profile.full_name,
    email: profile.email,
    is_admin: profile.is_admin,
    created_at: profile.created_at,
    plan: subscriptionMap.get(profile.user_id) || profile.plan || "free",
    stock_count: stocksByUser.get(profile.user_id) || 0,
    last_engine_run: latestRunByUser.get(profile.user_id) || null,
  }));
}

export default async function AdminUsersPage() {
  const users = await getAdminUsers();

  return (
    <div className="min-h-screen bg-[#0b0f16] text-white">
      <TopNav activePage="admin-users" />

      <div className="p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <div>
            <div className="text-sm font-medium text-blue-400">Admin / Users</div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Users</h1>
            <p className="mt-2 text-sm text-gray-400">
              Manage users with fast filtering, sorting, and row-level access to details.
            </p>
          </div>

          <AdminUsersTable users={users} />
        </div>
      </div>
    </div>
  );
}