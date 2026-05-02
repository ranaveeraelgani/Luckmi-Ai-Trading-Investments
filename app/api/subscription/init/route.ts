import { supabaseAdmin } from '@/app/lib/supabaseAdmin';
import { getPlanFromDb } from '@/app/lib/subscriptions/plans';

/**
 * POST /api/subscription/init
 * Called immediately after signup to create a Free subscription row.
 * Idempotent — does nothing if the user already has a subscription.
 *
 * Body: { userId: string }
 * This endpoint is internal — callers must supply the correct userId.
 * No sensitive financial action occurs (Free plan, $0).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const userId: string | undefined = body?.userId;

    if (!userId || typeof userId !== 'string') {
      return new Response(JSON.stringify({ error: 'userId required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if a subscription row already exists
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('subscriptions')
      .select('id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existing?.id) {
      return new Response(JSON.stringify({ status: 'already_exists' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Keep profile row in sync from auth metadata on first signup.
    // This captures first/last name entered at account creation.
    const { data: authUserData, error: authUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (authUserError) throw authUserError;

    const authUser = authUserData?.user;
    const profileEmail = authUser?.email || null;
    const profilePhone = String(authUser?.user_metadata?.phone || '').trim() || null;
    const firstName = String(authUser?.user_metadata?.first_name || '').trim();
    const lastName = String(authUser?.user_metadata?.last_name || '').trim();
    const profileName =
      String(authUser?.user_metadata?.full_name || '').trim() ||
      [firstName, lastName].filter(Boolean).join(' ').trim() ||
      String(authUser?.user_metadata?.name || '').trim() ||
      profileEmail;

    const { error: profileUpsertError } = await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          user_id: userId,
          email: profileEmail,
          full_name: profileName,
          phone: profilePhone,
        },
        { onConflict: 'user_id' }
      );

    if (profileUpsertError) throw profileUpsertError;

    // Resolve Free plan entitlements from the DB (respects any admin price/config changes)
    const freePlan = await getPlanFromDb('free');

    const now = new Date().toISOString();
    const { error: insertError } = await supabaseAdmin.from('subscriptions').insert({
      user_id: userId,
      plan_code: 'free',
      status: 'active',
      price_paid: 0,
      max_auto_stocks: freePlan.maxAutoStocks,
      allow_manual_cycle: freePlan.allowManualCycle,
      allow_cron_automation: freePlan.allowCronAutomation,
      allow_broker_connect: freePlan.allowBrokerConnect,
      allow_advanced_analytics: freePlan.allowAdvancedAnalytics,
      engine_paused: freePlan.enginePaused,
      created_at: now,
      updated_at: now,
    });

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ status: 'created', plan: 'free' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[subscription/init] error:', err);
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
