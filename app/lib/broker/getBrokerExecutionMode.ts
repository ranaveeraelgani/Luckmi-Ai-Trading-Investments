import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

export async function getBrokerExecutionMode(userId: string) {
  const brokerExecutionEnabled =
    process.env.BROKER_EXECUTION_ENABLED === "true";

  if (!brokerExecutionEnabled) {
    return {
      enabled: false,
      mode: null,
      reason: "Broker execution is currently disabled.",
    };
  }

  const { data: brokerKey } = await supabaseAdmin
    .from("broker_keys")
    .select("connection_status, is_paper, live_trading_enabled")
    .eq("user_id", userId)
    .eq("broker", "alpaca")
    .maybeSingle();

  if (!brokerKey || brokerKey.connection_status !== "connected") {
    return {
      enabled: false,
      mode: null,
      reason: "Connect Alpaca paper trading before running the engine.",
    };
  }

  if (brokerKey.is_paper) {
    return {
      enabled: true,
      mode: "paper" as const,
      reason: null,
    };
  }

  if (!brokerKey.live_trading_enabled) {
    return {
      enabled: false,
      mode: null,
      reason: "Live trading is connected but not enabled.",
    };
  }

  return {
    enabled: true,
    mode: "live" as const,
    reason: null,
  };
}