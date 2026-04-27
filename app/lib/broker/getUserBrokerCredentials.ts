import { supabaseAdmin } from "@/app/lib/supabaseAdmin";
import { decrypt } from "@/app/lib/crypto/encrypt";

export async function getUserBrokerCredentials(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("broker_keys")
    .select("api_key, api_secret, is_paper, connection_status")
    .eq("user_id", userId)
    .eq("broker", "alpaca")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load broker keys: ${error.message}`);
  }

  if (!data) {
    throw new Error("No Alpaca broker keys found");
  }

  if (data.connection_status !== "connected") {
    throw new Error("Alpaca broker is not connected");
  }

  return {
    apiKey: decrypt(data.api_key),
    apiSecret: decrypt(data.api_secret),
    isPaper: Boolean(data.is_paper),
  };
}