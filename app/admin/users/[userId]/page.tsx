import Link from "next/link";
import { redirect } from "next/navigation";
import TopNav from "@/components/TopNav";
import { createClient } from "@/app/lib/supabaseServer";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";
import { AdminRunCycleButton } from "./run-cycle-button";
import CronRunsCard from "@/components/admin/CronRunsCard";

type PageProps = {
  params: Promise<{ userId: string }>;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "—";
  }
}

function formatNumber(value?: number | null) {
  if (value === null || value === undefined) return "—";
  return Number(value).toLocaleString();
}

function formatMoney(value?: number | null) {
  if (value === null || value === undefined) return "—";
  return `$${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function cardTone(status?: string | null) {
  if (status === "connected" || status === "success") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }
  if (status === "failed") {
    return "border-red-500/30 bg-red-500/10 text-red-300";
  }
  if (status === "blocked") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  }
  return "border-gray-700 bg-[#161b22] text-gray-300";
}

function modeTone(isPaper?: boolean | null) {
  if (isPaper === true) {
    return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  }
  if (isPaper === false) {
    return "border-red-500/30 bg-red-500/10 text-red-300";
  }
  return "border-gray-700 bg-[#161b22] text-gray-300";
}

function planTone(plan?: string | null) {
  const p = (plan || "").toLowerCase();
  if (p === "free") return "border-gray-700 bg-[#161b22] text-gray-300";
  if (p.startsWith("pro")) return "border-blue-500/30 bg-blue-500/10 text-blue-300";
  return "border-violet-500/30 bg-violet-500/10 text-violet-300";
}

function Pill({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${className}`}
    >
      {children}
    </span>
  );
}

function Section({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-gray-800 bg-[#11151c]">
      <div className="flex flex-col gap-3 border-b border-gray-800 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div>
          <h2 className="text-base font-semibold text-white sm:text-lg">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-gray-400">{subtitle}</p> : null}
        </div>
        {right}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function StatCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string | number;
  subtext?: string;
}) {
  return (
    <div className="rounded-3xl border border-gray-800 bg-[#11151c] p-4 sm:p-5">
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-2 text-xl font-semibold text-white sm:text-2xl">{value}</div>
      {subtext ? <div className="mt-1 text-sm text-gray-500">{subtext}</div> : null}
    </div>
  );
}

async function getUserDetail(userId: string) {
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

  const [
    profileRes,
    brokerRes,
    stocksRes,
    positionsRes,
    tradesRes,
    decisionsRes,
    runsRes,
    notesRes,
    subscriptionRes,
  ] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("user_id, email, full_name, plan, is_admin, created_at")
      .eq("user_id", userId)
      .single(),

    supabaseAdmin
      .from("broker_keys")
      .select(`
        id,
        broker,
        is_paper,
        connection_status,
        last_tested_at,
        last_error,
        created_at
      `)
      .eq("user_id", userId)
      .maybeSingle(),

    supabaseAdmin
      .from("auto_stocks")
      .select(`
        id,
        symbol,
        allocation,
        compound_profits,
        rinse_repeat,
        max_repeats,
        repeat_counter,
        status,
        last_sell_time,
        last_evaluated_price,
        created_at
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),

    supabaseAdmin
      .from("positions")
      .select(`
        id,
        auto_stock_id,
        entry_price,
        shares,
        peak_price,
        peak_pnl_percent,
        entry_time,
        updated_at
      `)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),

    supabaseAdmin
      .from("trades")
      .select(`
        id,
        auto_stock_id,
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
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),

    supabaseAdmin
      .from("ai_decisions")
      .select(`
        id,
        auto_stock_id,
        symbol,
        action,
        reason,
        confidence,
        cts_score,
        cts_breakdown,
        created_at
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),

    supabaseAdmin
      .from("engine_runs")
      .select(`
        id,
        status,
        trades_executed,
        error_message,
        created_at
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),

    supabaseAdmin
      .from("admin_notes")
      .select("id, note, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),

    supabaseAdmin
      .from("subscriptions")
      .select(`
        user_id,
        plan_code,
        status,
        max_auto_stocks,
        allow_manual_cycle,
        allow_cron_automation,
        allow_broker_connect,
        allow_advanced_analytics,
        engine_paused
      `)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (profileRes.error || !profileRes.data) {
    throw new Error("User not found");
  }

  return {
    profile: profileRes.data,
    subscription: subscriptionRes.data,
    broker: brokerRes.data,
    stocks: stocksRes.data || [],
    positions: positionsRes.data || [],
    trades: tradesRes.data || [],
    aiDecisions: decisionsRes.data || [],
    engineRuns: runsRes.data || [],
    adminNotes: notesRes.data || [],
  };
}

export default async function AdminUserDetailPage({ params }: PageProps) {
  const { userId } = await params;
  const data = await getUserDetail(userId);

  const {
    profile,
    subscription,
    broker,
    stocks,
    positions,
    trades,
    aiDecisions,
    engineRuns,
    adminNotes,
  } = data;

  const latestRun = engineRuns[0] || null;
  const planLabel = subscription?.plan_code || profile.plan || "free";

  return (
    <div className="min-h-screen bg-[#0b0f16] text-white">
      <TopNav activePage="admin-users" />

      <div className="p-4 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <Link
                href="/admin/users"
                className="text-sm text-gray-400 transition hover:text-white"
              >
                ← Back to users
              </Link>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                  {profile.full_name || "Unnamed User"}
                </h1>

                {profile.is_admin ? (
                  <Pill className="border-blue-500/30 bg-blue-500/10 text-blue-300">
                    Admin
                  </Pill>
                ) : (
                  <Pill className="border-gray-700 bg-[#161b22] text-gray-300">
                    User
                  </Pill>
                )}

                <Pill className={planTone(planLabel)}>{planLabel}</Pill>

                <Pill className={cardTone(broker?.connection_status || "unknown")}>
                  Broker: {broker?.connection_status || "unknown"}
                </Pill>

                <Pill className={cardTone(latestRun?.status || "never")}>
                  Engine: {latestRun?.status || "never"}
                </Pill>
              </div>

              <div className="mt-3 break-all text-sm text-gray-300">{profile.email || "—"}</div>
              <div className="mt-1 break-all text-xs text-gray-500">{profile.user_id}</div>
            </div>

            <div className="w-full xl:w-auto">
              <div className="flex w-full justify-start xl:justify-end">
                <AdminRunCycleButton userId={userId} />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard
              label="Plan"
              value={planLabel}
              subtext={`Joined ${formatDate(profile.created_at)}`}
            />
            <StatCard
              label="Tracked Stocks"
              value={stocks.length}
              subtext="Auto stock entries"
            />
            <StatCard
              label="Open Positions"
              value={positions.length}
              subtext="Current portfolio holdings"
            />
            <StatCard
              label="Recent Trades"
              value={trades.length}
              subtext="Latest 20 loaded"
            />
            <StatCard
              label="Latest Engine"
              value={latestRun?.status || "never"}
              subtext={formatDate(latestRun?.created_at)}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Section
              title="User Profile"
              subtitle="Identity, role, and subscription controls snapshot."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl bg-[#1a1f2e] p-4">
                  <div className="text-xs text-gray-400">Email</div>
                  <div className="mt-1 break-all text-sm font-medium text-white">
                    {profile.email || "—"}
                  </div>
                </div>

                <div className="rounded-2xl bg-[#1a1f2e] p-4">
                  <div className="text-xs text-gray-400">Created</div>
                  <div className="mt-1 text-sm font-medium text-white">
                    {formatDate(profile.created_at)}
                  </div>
                </div>

                <div className="rounded-2xl bg-[#1a1f2e] p-4">
                  <div className="text-xs text-gray-400">Role</div>
                  <div className="mt-1">
                    {profile.is_admin ? (
                      <Pill className="border-blue-500/30 bg-blue-500/10 text-blue-300">
                        Admin
                      </Pill>
                    ) : (
                      <Pill className="border-gray-700 bg-[#161b22] text-gray-300">
                        Standard User
                      </Pill>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl bg-[#1a1f2e] p-4">
                  <div className="text-xs text-gray-400">Plan</div>
                  <div className="mt-1">
                    <Pill className={planTone(planLabel)}>{planLabel}</Pill>
                  </div>
                </div>
              </div>

              {subscription ? (
                <div className="mt-4 rounded-2xl bg-[#1a1f2e] p-4">
                  <div className="mb-3 text-sm font-medium text-white">Subscription Flags</div>
                  <div className="grid gap-2 text-sm text-gray-300 sm:grid-cols-2">
                    <div>Manual cycle: {subscription.allow_manual_cycle ? "On" : "Off"}</div>
                    <div>Cron automation: {subscription.allow_cron_automation ? "On" : "Off"}</div>
                    <div>Broker connect: {subscription.allow_broker_connect ? "On" : "Off"}</div>
                    <div>Advanced analytics: {subscription.allow_advanced_analytics ? "On" : "Off"}</div>
                    <div>Status: {subscription.status || "—"}</div>
                    <div>Max auto stocks: {subscription.max_auto_stocks ?? "—"}</div>
                    <div>
                      Engine pause:{" "}
                      {subscription.engine_paused ? (
                        <span className="text-amber-300">Paused</span>
                      ) : (
                        <span className="text-emerald-300">Active</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </Section>

            <Section
              title="Broker Status"
              subtitle="Connection state and broker health."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl bg-[#1a1f2e] p-4">
                  <div className="text-xs text-gray-400">Broker</div>
                  <div className="mt-1 text-sm font-medium text-white">
                    {broker?.broker || "Not connected"}
                  </div>
                </div>

                <div className="rounded-2xl bg-[#1a1f2e] p-4">
                  <div className="text-xs text-gray-400">Mode</div>
                  <div className="mt-1">
                    <Pill className={modeTone(broker?.is_paper)}>
                      {broker ? (broker.is_paper ? "Paper" : "Live") : "—"}
                    </Pill>
                  </div>
                </div>

                <div className="rounded-2xl bg-[#1a1f2e] p-4">
                  <div className="text-xs text-gray-400">Connection</div>
                  <div className="mt-1">
                    <Pill className={cardTone(broker?.connection_status || "unknown")}>
                      {broker?.connection_status || "unknown"}
                    </Pill>
                  </div>
                </div>

                <div className="rounded-2xl bg-[#1a1f2e] p-4">
                  <div className="text-xs text-gray-400">Last Tested</div>
                  <div className="mt-1 text-sm font-medium text-white">
                    {formatDate(broker?.last_tested_at)}
                  </div>
                </div>
              </div>

              {broker?.last_error ? (
                <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                  <div className="font-medium">Last Broker Error</div>
                  <div className="mt-1 whitespace-pre-wrap break-words text-red-100/90">
                    {broker.last_error}
                  </div>
                </div>
              ) : null}
            </Section>

            <Section
              title="Engine Overview"
              subtitle="Latest run state and operating history snapshot."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl bg-[#1a1f2e] p-4">
                  <div className="text-xs text-gray-400">Latest Status</div>
                  <div className="mt-1">
                    <Pill className={cardTone(latestRun?.status || "never")}>
                      {latestRun?.status || "never"}
                    </Pill>
                  </div>
                </div>

                <div className="rounded-2xl bg-[#1a1f2e] p-4">
                  <div className="text-xs text-gray-400">Latest Run Time</div>
                  <div className="mt-1 text-sm font-medium text-white">
                    {formatDate(latestRun?.created_at)}
                  </div>
                </div>

                <div className="rounded-2xl bg-[#1a1f2e] p-4">
                  <div className="text-xs text-gray-400">Run Records</div>
                  <div className="mt-1 text-sm font-medium text-white">
                    {engineRuns.length}
                  </div>
                </div>

                <div className="rounded-2xl bg-[#1a1f2e] p-4">
                  <div className="text-xs text-gray-400">Recent AI Decisions</div>
                  <div className="mt-1 text-sm font-medium text-white">
                    {aiDecisions.length}
                  </div>
                </div>
              </div>

              {latestRun?.error_message ? (
                <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                  <div className="font-medium">Latest Engine Error</div>
                  <div className="mt-1 whitespace-pre-wrap break-words text-red-100/90">
                    {latestRun.error_message}
                  </div>
                </div>
              ) : null}
            </Section>
          </div>

          <Section
            title="Auto Stocks"
            subtitle="Configured symbols and rinse-repeat state."
            right={<div className="text-sm text-gray-400">{stocks.length} total</div>}
          >
            <div className="space-y-3 md:hidden">
              {stocks.length === 0 ? (
                <div className="text-sm text-gray-400">No auto stocks configured.</div>
              ) : (
                stocks.map((stock: any) => (
                  <div
                    key={stock.id}
                    className="rounded-2xl border border-gray-800 bg-[#1a1f2e] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold text-white">{stock.symbol}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          {formatDate(stock.created_at)}
                        </div>
                      </div>
                      <Pill className="border-gray-700 bg-[#161b22] text-gray-300">
                        {stock.status}
                      </Pill>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-gray-300">
                      <div>Allocation: {stock.allocation ?? "—"}</div>
                      <div>
                        Repeat: {stock.repeat_counter ?? 0}/{stock.max_repeats ?? 0}
                      </div>
                      <div>Compounding: {stock.compound_profits ? "On" : "Off"}</div>
                      <div>Last Price: {stock.last_evaluated_price ?? "—"}</div>
                    </div>

                    <div className="mt-3 text-xs text-gray-500">
                      Last Sell: {formatDate(stock.last_sell_time)}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-sm">
                <thead className="border-b border-gray-800 text-left text-xs uppercase tracking-wide text-gray-400">
                  <tr>
                    <th className="px-3 py-3">Symbol</th>
                    <th className="px-3 py-3">Allocation</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Repeat</th>
                    <th className="px-3 py-3">Compounding</th>
                    <th className="px-3 py-3">Last Price</th>
                    <th className="px-3 py-3">Last Sell</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {stocks.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-gray-400">
                        No auto stocks configured.
                      </td>
                    </tr>
                  ) : (
                    stocks.map((stock: any) => (
                      <tr key={stock.id} className="hover:bg-white/[0.02]">
                        <td className="px-3 py-3 font-medium text-white">{stock.symbol}</td>
                        <td className="px-3 py-3 text-gray-300">{stock.allocation ?? "—"}</td>
                        <td className="px-3 py-3 text-gray-300">{stock.status}</td>
                        <td className="px-3 py-3 text-gray-300">
                          {stock.repeat_counter ?? 0}/{stock.max_repeats ?? 0}
                        </td>
                        <td className="px-3 py-3 text-gray-300">
                          {stock.compound_profits ? "On" : "Off"}
                        </td>
                        <td className="px-3 py-3 text-gray-300">
                          {stock.last_evaluated_price ?? "—"}
                        </td>
                        <td className="px-3 py-3 text-gray-300">
                          {formatDate(stock.last_sell_time)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Section>

          <div className="grid gap-6 xl:grid-cols-2">
            <Section
              title="Open Positions"
              subtitle="Current holdings tracked by the engine."
              right={<div className="text-sm text-gray-400">{positions.length} open</div>}
            >
              <div className="space-y-3 md:hidden">
                {positions.length === 0 ? (
                  <div className="text-sm text-gray-400">No open positions.</div>
                ) : (
                  positions.map((pos: any) => (
                    <div
                      key={pos.id}
                      className="rounded-2xl border border-gray-800 bg-[#1a1f2e] p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-white">
                            Stock ID: {pos.auto_stock_id}
                          </div>
                          <div className="mt-1 text-xs text-gray-500">
                            Updated {formatDate(pos.updated_at)}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-gray-300">
                        <div>Entry: {formatMoney(pos.entry_price)}</div>
                        <div>Shares: {formatNumber(pos.shares)}</div>
                        <div>Peak: {formatMoney(pos.peak_price)}</div>
                        <div>Peak PnL %: {pos.peak_pnl_percent ?? "—"}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-gray-800 text-left text-xs uppercase tracking-wide text-gray-400">
                    <tr>
                      <th className="px-3 py-3">Stock ID</th>
                      <th className="px-3 py-3">Entry</th>
                      <th className="px-3 py-3">Shares</th>
                      <th className="px-3 py-3">Peak</th>
                      <th className="px-3 py-3">Peak PnL %</th>
                      <th className="px-3 py-3">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {positions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-8 text-center text-gray-400">
                          No open positions.
                        </td>
                      </tr>
                    ) : (
                      positions.map((pos: any) => (
                        <tr key={pos.id} className="hover:bg-white/[0.02]">
                          <td className="px-3 py-3 text-gray-300">{pos.auto_stock_id}</td>
                          <td className="px-3 py-3 text-gray-300">
                            {formatMoney(pos.entry_price)}
                          </td>
                          <td className="px-3 py-3 text-gray-300">
                            {formatNumber(pos.shares)}
                          </td>
                          <td className="px-3 py-3 text-gray-300">
                            {formatMoney(pos.peak_price)}
                          </td>
                          <td className="px-3 py-3 text-gray-300">
                            {pos.peak_pnl_percent ?? "—"}
                          </td>
                          <td className="px-3 py-3 text-gray-300">
                            {formatDate(pos.updated_at)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section
              title="Recent Engine Runs"
              subtitle="Last 20 execution outcomes for this user."
            >
              <div className="space-y-3">
                {engineRuns.length === 0 ? (
                  <div className="text-sm text-gray-400">No engine runs found.</div>
                ) : (
                  engineRuns.map((run: any) => (
                    <div
                      key={run.id}
                      className="rounded-2xl border border-gray-800 bg-[#1a1f2e] p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <Pill className={cardTone(run.status)}>{run.status}</Pill>
                          <div className="mt-2 text-xs text-gray-500">
                            {formatDate(run.created_at)}
                          </div>
                        </div>
                        <div className="text-sm text-gray-300 sm:text-right">
                          <div>Trades: {run.trades_executed ?? 0}</div>
                        </div>
                      </div>

                      {run.error_message ? (
                        <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200 break-words">
                          {run.error_message}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </Section>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Section
              title="Recent Trades"
              subtitle="Last 20 trades for this user."
            >
              <div className="space-y-3">
                {trades.length === 0 ? (
                  <div className="text-sm text-gray-400">No recent trades.</div>
                ) : (
                  trades.map((trade: any) => (
                    <div
                      key={trade.id}
                      className="rounded-2xl border border-gray-800 bg-[#1a1f2e] p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="text-sm font-semibold text-white">
                            {trade.symbol} · {trade.type}
                          </div>
                          <div className="mt-1 text-xs text-gray-500">
                            {formatDate(trade.created_at)}
                          </div>
                        </div>
                        <div className="text-sm text-gray-300 sm:text-right">
                          <div>{formatNumber(trade.shares)} shares</div>
                          <div>{formatMoney(trade.price)}</div>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2 text-sm text-gray-300 sm:grid-cols-2">
                        <div>Amount: {formatMoney(trade.amount)}</div>
                        <div>PnL: {trade.pnl ?? "—"}</div>
                        <div>CTS: {trade.cts_score ?? "—"}</div>
                        <div>Confidence: {trade.confidence ?? "—"}</div>
                      </div>

                      {trade.reason ? (
                        <div className="mt-3 break-words text-sm text-gray-400">
                          {trade.reason}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </Section>

            <Section
              title="AI Decisions"
              subtitle="Last 20 decision logs written by the engine."
            >
              <div className="space-y-3">
                {aiDecisions.length === 0 ? (
                  <div className="text-sm text-gray-400">No AI decisions found.</div>
                ) : (
                  aiDecisions.map((decision: any) => (
                    <div
                      key={decision.id}
                      className="rounded-2xl border border-gray-800 bg-[#1a1f2e] p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="text-sm font-semibold text-white">
                            {decision.symbol} · {decision.action}
                          </div>
                          <div className="mt-1 text-xs text-gray-500">
                            {formatDate(decision.created_at)}
                          </div>
                        </div>
                        <div className="text-sm text-gray-300 sm:text-right">
                          <div>CTS: {decision.cts_score ?? "—"}</div>
                          <div>Confidence: {decision.confidence ?? "—"}</div>
                        </div>
                      </div>

                      {decision.reason ? (
                        <div className="mt-3 break-words text-sm text-gray-400">
                          {decision.reason}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </Section>
          </div>

          <Section
            title="Admin Notes"
            subtitle="Latest internal notes for support and operations."
          >
            <div className="space-y-3">
              {adminNotes.length === 0 ? (
                <div className="text-sm text-gray-400">No admin notes yet.</div>
              ) : (
                adminNotes.map((note: any) => (
                  <div
                    key={note.id}
                    className="rounded-2xl border border-gray-800 bg-[#1a1f2e] p-4"
                  >
                    <div className="text-xs text-gray-500">{formatDate(note.created_at)}</div>
                    <div className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-300">
                      {note.note}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Section>
          <CronRunsCard />
        </div>
      </div>
    </div>
  );
}