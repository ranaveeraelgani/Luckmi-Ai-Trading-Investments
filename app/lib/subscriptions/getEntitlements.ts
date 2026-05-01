import { supabaseAdmin } from '@/app/lib/supabaseAdmin';
import { getPlanFromDb, planToEntitlements, PLAN_DEFAULTS } from '@/app/lib/subscriptions/plans';

export type Entitlements = {
  planCode: string;
  status: string;
  maxAutoStocks: number;
  allowManualCycle: boolean;
  allowCronAutomation: boolean;
  allowBrokerConnect: boolean;
  allowAdvancedAnalytics: boolean;
  engine_paused: boolean;
  isTestUser: boolean;
};

/** Global enforcement switch — only true when env var is explicitly 'true' */
export function subscriptionsEnforced(): boolean {
  return process.env.NEXT_PUBLIC_SUBSCRIPTIONS_ENFORCED === 'true';
}

/**
 * Per-user enforcement check.
 * Returns false (not enforced) when:
 *   - the global env switch is off, OR
 *   - the user is flagged as a test user
 * Use this everywhere instead of bare subscriptionsEnforced().
 */
export function isEnforcedForUser(entitlements: Entitlements): boolean {
  if (!subscriptionsEnforced()) return false;
  if (entitlements.isTestUser) return false;
  return true;
}

export async function getEntitlements(userId: string): Promise<Entitlements> {
  // Fetch subscription row + profile test flag in parallel
  const [subResult, profileResult] = await Promise.all([
    supabaseAdmin
      .from('subscriptions')
      .select('plan_code, status, max_auto_stocks, allow_manual_cycle, allow_cron_automation, allow_broker_connect, allow_advanced_analytics, engine_paused')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('profiles')
      .select('is_test_user')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  if (subResult.error) throw subResult.error;

  const isTestUser = profileResult.data?.is_test_user === true;
  const data = subResult.data;

  // Test users always get full unlimited access
  if (isTestUser) {
    return { ...planToEntitlements(PLAN_DEFAULTS['test_unlimited']), isTestUser: true };
  }

  // No subscription row → test phase fallback (all access, engine paused)
  if (!data) {
    return { ...planToEntitlements(PLAN_DEFAULTS['test_unlimited']), isTestUser: false };
  }

  const planCode = data.plan_code;

  // If the subscription row has explicit entitlement columns set (admin override),
  // use them directly. Otherwise resolve from the subscription_plans table.
  const hasExplicitEntitlements =
    data.max_auto_stocks != null &&
    data.allow_manual_cycle != null;

  if (hasExplicitEntitlements) {
    return {
      planCode: planCode ?? 'free',
      status: data.status,
      maxAutoStocks: data.max_auto_stocks,
      allowManualCycle: data.allow_manual_cycle,
      allowCronAutomation: data.allow_cron_automation,
      allowBrokerConnect: data.allow_broker_connect,
      allowAdvancedAnalytics: data.allow_advanced_analytics,
      engine_paused: data.engine_paused ?? false,
      isTestUser: false,
    };
  }

  // Resolve entitlements from the subscription_plans table (plan_code driven)
  const plan = await getPlanFromDb(planCode ?? 'free');
  return { ...planToEntitlements(plan), isTestUser: false };
}