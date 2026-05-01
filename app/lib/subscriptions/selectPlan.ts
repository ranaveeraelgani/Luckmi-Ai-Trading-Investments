import { supabaseAdmin } from '@/app/lib/supabaseAdmin';
import { getPlanFromDb, PLAN_DEFAULTS } from '@/app/lib/subscriptions/plans';
import type { PlanCode } from '@/app/lib/subscriptions/plans';

export type SelectPlanResult =
  | { success: true; plan: PlanCode }
  | { success: false; error: string };

export async function selectPlanForUser(
  userId: string,
  planCode: PlanCode
): Promise<SelectPlanResult> {
  // Validate plan exists and is a real user-selectable plan
  const allowedCodes: PlanCode[] = ['free', 'basic', 'pro', 'elite'];
  if (!allowedCodes.includes(planCode)) {
    return { success: false, error: 'Invalid plan' };
  }

  const plan = await getPlanFromDb(planCode).catch(() => PLAN_DEFAULTS[planCode]);

  const now = new Date().toISOString();

  // Check if user already has a subscription row
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('subscriptions')
    .select('id, plan_code')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    return { success: false, error: existingError.message };
  }

  const payload = {
    user_id: userId,
    plan_code: plan.planCode,
    status: 'active',
    price_paid: plan.priceMonthly,
    max_auto_stocks: plan.maxAutoStocks,
    allow_manual_cycle: plan.allowManualCycle,
    allow_cron_automation: plan.allowCronAutomation,
    allow_broker_connect: plan.allowBrokerConnect,
    allow_advanced_analytics: plan.allowAdvancedAnalytics,
    engine_paused: plan.enginePaused,
    updated_at: now,
  };

  if (existing?.id) {
    const { error } = await supabaseAdmin
      .from('subscriptions')
      .update(payload)
      .eq('id', existing.id);

    if (error) return { success: false, error: error.message };
  } else {
    const { error } = await supabaseAdmin
      .from('subscriptions')
      .insert({ ...payload, created_at: now });

    if (error) return { success: false, error: error.message };
  }

  return { success: true, plan: plan.planCode };
}
