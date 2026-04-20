import { createClient } from '@/app/lib/supabaseServer';
import { supabaseAdmin } from '@/app/lib/supabaseAdmin';

export async function POST(req: Request) {
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

    const body = await req.json();

    const { error } = await supabaseAdmin.from('admin_notes').insert({
      target_user_id: body.targetUserId,
      admin_user_id: user.id,
      note: body.note,
      created_at: new Date(),
    });

    if (error) throw error;

    return Response.json({ success: true });
  } catch (err) {
    console.error('Admin note create error:', err);
    return new Response('Failed to create note', { status: 500 });
  }
}