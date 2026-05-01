import { createClient } from '@/app/lib/supabaseServer';
import { supabaseAdmin } from '@/app/lib/supabaseAdmin';
import { listCampaigns, createCampaign } from '@/app/lib/subscriptions/campaigns';

async function assertAdmin(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabaseAdmin
    .from('profiles').select('is_admin').eq('user_id', user.id).maybeSingle();
  return profile?.is_admin ? user : null;
}

/** GET /api/admin/campaigns — list all campaigns */
export async function GET(req: Request) {
  try {
    const user = await assertAdmin(req);
    if (!user) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });

    const campaigns = await listCampaigns();
    return new Response(JSON.stringify({ campaigns }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

/** POST /api/admin/campaigns — create a campaign */
export async function POST(req: Request) {
  try {
    const user = await assertAdmin(req);
    if (!user) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });

    const body = await req.json();
    const { name, description, discountPercent, eligiblePlans, maxRedemptions, startsAt, expiresAt } = body;

    if (!name || discountPercent == null || !Array.isArray(eligiblePlans) || eligiblePlans.length === 0) {
      return new Response(JSON.stringify({ error: 'name, discountPercent, and eligiblePlans are required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const campaign = await createCampaign({ name, description, discountPercent, eligiblePlans, maxRedemptions, startsAt, expiresAt });
    return new Response(JSON.stringify({ campaign }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
