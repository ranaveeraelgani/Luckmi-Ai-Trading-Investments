import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

const LOCK_TTL_SECONDS = 120;

export async function acquireEngineLock(
  userId: string,
  source: "manual" | "admin" | "cron"
): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOCK_TTL_SECONDS * 1000).toISOString();

  const { error } = await supabaseAdmin
    .from("engine_locks")
    .upsert(
      {
        user_id: userId,
        source,
        locked_at: now.toISOString(),
        expires_at: expiresAt,
      },
      {
        onConflict: "user_id",
        ignoreDuplicates: false,
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

  const { error: replaceError } = await supabaseAdmin
    .from("engine_locks")
    .upsert(
      {
        user_id: userId,
        source,
        locked_at: now.toISOString(),
        expires_at: expiresAt,
      },
      {
        onConflict: "user_id",
      }
    );

  if (replaceError) {
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