import { supabaseAdmin } from "@/app/lib/supabaseAdmin";
export async function checkBrokerAccountCanTrade(userId: string) {
  const { data: account } = await supabaseAdmin
    .from("broker_accounts")
    .select(`
      equity,
      buying_power,
      trading_blocked,
      account_blocked,
      pattern_day_trader,
      daytrade_count
    `)
    .eq("user_id", userId)
    .order("last_synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!account) {
    return {
      allowed: false,
      reason: "Broker account not synced.",
    };
  }

  if (account.account_blocked || account.trading_blocked) {
    return {
      allowed: false,
      reason: "Broker account is blocked from trading.",
    };
  }

  const equity = Number(account.equity || 0);
  const daytradeCount = Number(account.daytrade_count || 0);

  if (equity < 25000 && daytradeCount >= 3) {
    return {
      allowed: false,
      reason: "Day trade protection: near PDT limit.",
    };
  }

  return {
    allowed: true,
    reason: null,
  };
}