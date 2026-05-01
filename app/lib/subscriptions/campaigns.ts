import { supabaseAdmin } from '@/app/lib/supabaseAdmin';

export type Campaign = {
  id: string;
  name: string;
  description: string | null;
  discountPercent: number;
  eligiblePlans: string[];
  maxRedemptions: number | null;
  redemptionCount: number;
  startsAt: string;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateCampaignInput = {
  name: string;
  description?: string;
  discountPercent: number;
  eligiblePlans: string[];
  maxRedemptions?: number | null;
  startsAt?: string;
  expiresAt?: string | null;
};

function rowToCampaign(row: any): Campaign {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    discountPercent: Number(row.discount_percent),
    eligiblePlans: row.eligible_plans ?? [],
    maxRedemptions: row.max_redemptions ?? null,
    redemptionCount: row.redemption_count ?? 0,
    startsAt: row.starts_at,
    expiresAt: row.expires_at ?? null,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listCampaigns(): Promise<Campaign[]> {
  const { data, error } = await supabaseAdmin
    .from('subscription_campaigns')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(rowToCampaign);
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  const { data, error } = await supabaseAdmin
    .from('subscription_campaigns')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data ? rowToCampaign(data) : null;
}

export async function createCampaign(input: CreateCampaignInput): Promise<Campaign> {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('subscription_campaigns')
    .insert({
      name: input.name,
      description: input.description ?? null,
      discount_percent: input.discountPercent,
      eligible_plans: input.eligiblePlans,
      max_redemptions: input.maxRedemptions ?? null,
      starts_at: input.startsAt ?? now,
      expires_at: input.expiresAt ?? null,
      is_active: true,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) throw error;
  return rowToCampaign(data);
}

export async function updateCampaign(
  id: string,
  patch: Partial<Pick<Campaign, 'name' | 'description' | 'discountPercent' | 'eligiblePlans' | 'maxRedemptions' | 'startsAt' | 'expiresAt' | 'isActive'>>
): Promise<Campaign> {
  const dbPatch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.description !== undefined) dbPatch.description = patch.description;
  if (patch.discountPercent !== undefined) dbPatch.discount_percent = patch.discountPercent;
  if (patch.eligiblePlans !== undefined) dbPatch.eligible_plans = patch.eligiblePlans;
  if (patch.maxRedemptions !== undefined) dbPatch.max_redemptions = patch.maxRedemptions;
  if (patch.startsAt !== undefined) dbPatch.starts_at = patch.startsAt;
  if (patch.expiresAt !== undefined) dbPatch.expires_at = patch.expiresAt;
  if (patch.isActive !== undefined) dbPatch.is_active = patch.isActive;

  const { data, error } = await supabaseAdmin
    .from('subscription_campaigns')
    .update(dbPatch)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return rowToCampaign(data);
}

export async function deleteCampaign(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('subscription_campaigns')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

/** Check if a campaign is currently redeemable (active, not expired, not over limit) */
export function isCampaignRedeemable(campaign: Campaign): boolean {
  if (!campaign.isActive) return false;
  const now = new Date();
  if (new Date(campaign.startsAt) > now) return false;
  if (campaign.expiresAt && new Date(campaign.expiresAt) < now) return false;
  if (campaign.maxRedemptions !== null && campaign.redemptionCount >= campaign.maxRedemptions) return false;
  return true;
}

export type RedeemResult =
  | { success: true; discountPercent: number; campaignName: string }
  | { success: false; error: string };

export async function redeemCampaignForUser(
  campaignId: string,
  userId: string,
  planCode: string
): Promise<RedeemResult> {
  const campaign = await getCampaign(campaignId);
  if (!campaign) return { success: false, error: 'Campaign not found' };
  if (!isCampaignRedeemable(campaign)) return { success: false, error: 'Campaign is not available' };
  if (!campaign.eligiblePlans.includes(planCode)) {
    return { success: false, error: `Campaign is not valid for the ${planCode} plan` };
  }

  // Check if user already redeemed this campaign
  const { data: existing } = await supabaseAdmin
    .from('subscription_campaign_redemptions')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing?.id) return { success: false, error: 'You have already redeemed this campaign' };

  // Insert redemption and increment counter atomically via RPC or two queries
  const { error: redemptionError } = await supabaseAdmin
    .from('subscription_campaign_redemptions')
    .insert({ campaign_id: campaignId, user_id: userId });

  if (redemptionError) {
    if (redemptionError.code === '23505') return { success: false, error: 'You have already redeemed this campaign' };
    return { success: false, error: redemptionError.message };
  }

  await supabaseAdmin
    .from('subscription_campaigns')
    .update({ redemption_count: campaign.redemptionCount + 1, updated_at: new Date().toISOString() })
    .eq('id', campaignId);

  return { success: true, discountPercent: campaign.discountPercent, campaignName: campaign.name };
}
