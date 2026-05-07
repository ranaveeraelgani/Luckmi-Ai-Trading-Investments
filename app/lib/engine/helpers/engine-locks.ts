import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

const LOCK_TTL_SECONDS = 120;

export async function acquireEngineLock(
  userId: string,
  source: "manual" | "admin" | "cron"
): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOCK_TTL_SECONDS * 1000).toISOString();

  // First attempt: plain insert should succeed only when no lock row exists.
  const { error } = await supabaseAdmin
    .from("engine_locks")
    .insert(
      {
        user_id: userId,
        source,
        locked_at: now.toISOString(),
        expires_at: expiresAt,
      }
    );

  if (!error) {
    return true;
  }

  const { data: existingLock, error: fetchError } = await supabaseAdmin
    .from("engine_locks")
    .select("user_id, expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Failed to inspect engine lock: ${fetchError.message}`);
  }

  if (!existingLock) {
    return false;
  }

  const expired = new Date(existingLock.expires_at).getTime() <= Date.now();

  if (!expired) {
    return false;
  }

  // Existing row is expired: take over only if the row is still expired at update time.
  const { data: replacedRows, error: replaceError } = await supabaseAdmin
    .from("engine_locks")
    .update({
      source,
      locked_at: now.toISOString(),
      expires_at: expiresAt,
    })
    .eq("user_id", userId)
    .lte("expires_at", now.toISOString())
    .select("user_id");

  if (replaceError || !replacedRows || replacedRows.length === 0) {
    return false;
  }

  return true;
}

export async function releaseEngineLock(userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("engine_locks")
    .delete()
    .eq("user_id", userId);

  if (error) {
    console.error("Failed to release engine lock:", error.message);
  }
}