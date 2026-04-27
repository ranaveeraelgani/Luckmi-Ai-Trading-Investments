import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

export async function getBrokerExecutionMode(userId: string) {
  if (process.env.BROKER_EXECUTION_ENABLED !== "true") {
    return {
      enabled: false,
      mode: null as null,
      reason: "Broker execution is disabled by platform settings.",
    };
  }

  const { data: brokerKey, error } = await supabaseAdmin
    .from("broker_keys")
    .select("connection_status, is_paper, live_trading_enabled")
    .eq("user_id", userId)
    .eq("broker", "alpaca")
    .maybeSingle();

  if (error) {
    return {
      enabled: false,
      mode: null as null,
      reason: error.message,
    };
  }

  if (!brokerKey || brokerKey.connection_status !== "connected") {
    return {
      enabled: false,
      mode: null as null,
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
      mode: null as null,
      reason: "Live trading is connected but not enabled.",
    };
  }

  if (process.env.LIVE_TRADING_ENABLED !== "true") {
    return {
      enabled: false,
      mode: null as null,
      reason: "Live trading is disabled by platform settings.",
    };
  }

  return {
    enabled: true,
    mode: "live" as const,
    reason: null,
  };
}