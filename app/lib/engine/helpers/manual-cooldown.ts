import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

function subscriptionsEnforced(): boolean {
  return String(process.env.NEXT_PUBLIC_SUBSCRIPTIONS_ENFORCED).toLowerCase() === "true";
}

export function getManualCooldownSeconds(): number {
  return subscriptionsEnforced() ? 180 : 60;
}

export async function getLastManualRunTime(userId: string): Promise<Date | null> {
  const { data, error } = await supabaseAdmin
    .from("engine_runs")
    .select("created_at, run_type")
    .eq("user_id", userId)
    .eq("run_type", "manual")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch last manual run: ${error.message}`);
  }

  if (!data?.created_at) return null;
  return new Date(data.created_at);
}

export async function getRemainingManualCooldownSeconds(userId: string): Promise<number> {
  const cooldownSeconds = getManualCooldownSeconds();
  const lastRun = await getLastManualRunTime(userId);

  if (!lastRun) return 0;

  const elapsedSeconds = Math.floor((Date.now() - lastRun.getTime()) / 1000);
  return Math.max(0, cooldownSeconds - elapsedSeconds);
}