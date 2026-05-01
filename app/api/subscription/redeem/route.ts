import { createClient } from '@/app/lib/supabaseServer';
import { supabaseAdmin } from '@/app/lib/supabaseAdmin';
import { redeemCampaignForUser } from '@/app/lib/subscriptions/campaigns';
import { getPlanFromDb, PLAN_DEFAULTS, PlanCode } from '@/app/lib/subscriptions/plans';

/**
 * POST /api/subscription/redeem
 * Body: { campaignId: string }
 *
 * Applies a campaign discount to the user's current active subscription.
 * Records the redemption and updates price_paid on the subscription row.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    const campaignId: string | undefined = body?.campaignId;
    if (!campaignId) {
      return new Response(JSON.stringify({ error: 'campaignId required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Get user's current subscription
    const { data: sub, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('id, plan_code, price_paid')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subError) throw subError;
    if (!sub) {
      return new Response(JSON.stringify({ error: 'No active subscription found' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const planCode = sub.plan_code ?? 'free';
    const result = await redeemCampaignForUser(campaignId, user.id, planCode);

    if (!result.success) {
      return new Response(JSON.stringify({ error: result.error }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Apply the discount to price_paid on the subscription row
    const safeCode = (planCode in PLAN_DEFAULTS ? planCode : 'free') as PlanCode;
    const plan = await getPlanFromDb(safeCode).catch(() => PLAN_DEFAULTS[safeCode]);
    const originalPrice = plan.priceMonthly;
    const discountedPrice = parseFloat((originalPrice * (1 - result.discountPercent / 100)).toFixed(2));

    await supabaseAdmin
      .from('subscriptions')
      .update({ price_paid: discountedPrice, updated_at: new Date().toISOString() })
      .eq('id', sub.id);

    return new Response(JSON.stringify({
      status: 'redeemed',
      campaignName: result.campaignName,
      discountPercent: result.discountPercent,
      originalPrice,
      discountedPrice,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('[subscription/redeem] error:', err);
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
