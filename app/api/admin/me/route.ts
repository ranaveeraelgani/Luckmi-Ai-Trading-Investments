import { createClient } from '@/app/lib/supabaseServer';
import { supabaseAdmin } from '@/app/lib/supabaseAdmin';

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ isAdmin: false }, { status: 401 });
    }

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return Response.json({ isAdmin: !!profile?.is_admin });
  } catch (error) {
    console.error('Admin status route error:', error);
    return Response.json({ isAdmin: false }, { status: 500 });
  }
}