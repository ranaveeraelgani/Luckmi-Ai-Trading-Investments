import { createClient } from '@/app/lib/supabaseServer';
import { supabaseAdmin } from '@/app/lib/supabaseAdmin';

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from('broker_keys')
      .select('broker, is_paper, connection_status, last_tested_at, last_error, created_at')
      .eq('user_id', user.id)
      .eq('broker', 'alpaca')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    return Response.json(data || null);
  } catch (err) {
    console.error('Broker me error:', err);
    return new Response('Failed to load broker status', { status: 500 });
  }
}