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

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile?.is_admin) {
      return new Response('Forbidden', { status: 403 });
    }

    const { data: users, error } = await supabaseAdmin
      .from('profiles')
      .select(`
        user_id,
        full_name,
        email,
        plan,
        is_admin
      `);

    if (error) throw error;

    const enriched = await Promise.all(
      (users || []).map(async (u) => {
          const [{ count: stockCount }, { data: sub }, { data: lastRun }, { data: broker }] = await Promise.all([
              supabaseAdmin
                  .from('auto_stocks')
                  .select('*', { count: 'exact', head: true })
                  .eq('user_id', u.user_id),

              supabaseAdmin
                  .from('subscriptions')
                  .select('*')
                  .eq('user_id', u.user_id)
                  .order('created_at', { ascending: false })
                  .limit(1)
                  .maybeSingle(),

              supabaseAdmin
                  .from('engine_runs')
                  .select('*')
                  .eq('user_id', u.user_id)
                  .order('created_at', { ascending: false })
                  .limit(1)
                  .maybeSingle(),

              supabaseAdmin
                  .from('broker_keys')
                  .select('id, broker, is_paper, created_at, connection_status, last_tested_at, last_error')
                  .eq('user_id', u.user_id)
                  .order('created_at', { ascending: false })
                  .limit(1)
                  .maybeSingle(),
          ]);

          return {
              ...u,
              stockCount: stockCount || 0,
              subscription: sub || null,
              lastRun: lastRun || null,
              broker: broker || null,
          };
      })
    );

    return Response.json(enriched);
  } catch (err) {
    console.error('Admin users fetch error:', err);
    return new Response('Failed to fetch users', { status: 500 });
  }
}