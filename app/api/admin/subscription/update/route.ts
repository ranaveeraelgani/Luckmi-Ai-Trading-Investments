import { createClient } from '@/app/lib/supabaseServer';
import { supabaseAdmin } from '@/app/lib/supabaseAdmin';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    if (!profile?.is_admin) {
      return new Response('Forbidden', { status: 403 });
    }

    const body = await req.json();

      const {
          targetUserId,
          planCode,
          status,
          maxAutoStocks,
          allowManualCycle,
          allowCronAutomation,
          allowBrokerConnect,
          allowAdvancedAnalytics,
          enginePaused,
      } = body;

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('subscriptions')
      .select('id')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) throw existingError;

    const payload = {
      user_id: targetUserId,
      plan_code: planCode,
      status,
      max_auto_stocks: maxAutoStocks,
      allow_manual_cycle: allowManualCycle,
      allow_cron_automation: allowCronAutomation,
      allow_broker_connect: allowBrokerConnect,
      allow_advanced_analytics: allowAdvancedAnalytics,
      engine_paused: enginePaused,
      updated_at: new Date(),
    };

    if (existing?.id) {
      const { error } = await supabaseAdmin
        .from('subscriptions')
        .update(payload)
        .eq('id', existing.id);

      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin
        .from('subscriptions')
        .insert({
          ...payload,
          created_at: new Date(),
        });

      if (error) throw error;
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    console.error('Admin subscription update error:', err);
    return new Response('Failed to update subscription', { status: 500 });
  }
}