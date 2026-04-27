import { createClient } from '@/app/lib/supabaseServer';
import { supabaseAdmin } from '@/app/lib/supabaseAdmin';

export async function GET(
  req: Request,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return new Response('Unauthorized', { status: 401 });

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile?.is_admin) {
      return new Response('Forbidden', { status: 403 });
    }

    const { userId } = await context.params;

    const { data, error } = await supabaseAdmin
      .from('admin_notes')
      .select('*')
      .eq('target_user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return Response.json(data || []);
  } catch (err) {
    console.error('Admin notes fetch error:', err);
    return new Response('Failed to fetch notes', { status: 500 });
  }
}