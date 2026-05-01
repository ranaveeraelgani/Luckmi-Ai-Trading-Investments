import { createClient } from '@/app/lib/supabaseServer';
import { supabaseAdmin } from '@/app/lib/supabaseAdmin';
import { updateCampaign, deleteCampaign } from '@/app/lib/subscriptions/campaigns';

async function assertAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabaseAdmin
    .from('profiles').select('is_admin').eq('user_id', user.id).maybeSingle();
  return profile?.is_admin ? user : null;
}

/** PATCH /api/admin/campaigns/[id] — update a campaign */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await assertAdmin();
    if (!user) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });

    const { id } = await params;
    const body = await req.json();

    const campaign = await updateCampaign(id, {
      name: body.name,
      description: body.description,
      discountPercent: body.discountPercent,
      eligiblePlans: body.eligiblePlans,
      maxRedemptions: body.maxRedemptions,
      startsAt: body.startsAt,
      expiresAt: body.expiresAt,
      isActive: body.isActive,
    });

    return new Response(JSON.stringify({ campaign }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

/** DELETE /api/admin/campaigns/[id] — delete a campaign */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await assertAdmin();
    if (!user) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });

    const { id } = await params;
    await deleteCampaign(id);

    return new Response(JSON.stringify({ status: 'deleted' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
