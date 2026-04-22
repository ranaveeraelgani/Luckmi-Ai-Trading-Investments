import { createClient } from "@/app/lib/supabaseServer";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

export async function requireAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Unauthorized");
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("user_id, is_admin, email, full_name")
    .eq("user_id", user.id)
    .single();

  if (profileError || !profile || !profile.is_admin) {
    throw new Error("Forbidden");
  }

  return {
    authUser: user,
    profile,
  };
}