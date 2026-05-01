/**
 * Subscription plan definitions.
 *
 * These are the fallback/default values used when the DB is unreachable.
 * The authoritative values live in the `subscription_plans` table so admins
 * can update prices without a code deploy.
 */

import { supabaseAdmin } from '@/app/lib/supabaseAdmin';

export type PlanCode = 'free' | 'basic' | 'pro' | 'elite' | 'test_unlimited';

export type SubscriptionPlan = {
  planCode: PlanCode;
  name: string;
  priceMonthly: number;
  maxAutoStocks: number;
  allowManualCycle: boolean;
  allowCronAutomation: boolean;
  allowBrokerConnect: boolean;
  allowAdvancedAnalytics: boolean;
  enginePaused: boolean;
  isVisible: boolean;
  sortOrder: number;
};

/** Local fallback — matches the seeded DB values */
export const PLAN_DEFAULTS: Record<PlanCode, SubscriptionPlan> = {
  free: {
    planCode: 'free',
    name: 'Free',
    priceMonthly: 0,
    maxAutoStocks: 1,
    allowManualCycle: true,
    allowCronAutomation: true,
    allowBrokerConnect: true,
    allowAdvancedAnalytics: false,
    enginePaused: false,
    isVisible: true,
    sortOrder: 0,
  },
  basic: {
    planCode: 'basic',
    name: 'Basic',
    priceMonthly: 15,
    maxAutoStocks: 3,
    allowManualCycle: true,
    allowCronAutomation: true,
    allowBrokerConnect: true,
    allowAdvancedAnalytics: true,
    enginePaused: false,
    isVisible: true,
    sortOrder: 1,
  },
  pro: {
    planCode: 'pro',
    name: 'Pro',
    priceMonthly: 50,
    maxAutoStocks: 10,
    allowManualCycle: true,
    allowCronAutomation: true,
    allowBrokerConnect: true,
    allowAdvancedAnalytics: true,
    enginePaused: false,
    isVisible: true,
    sortOrder: 2,
  },
  elite: {
    planCode: 'elite',
    name: 'Elite',
    priceMonthly: 99,
    maxAutoStocks: 30,
    allowManualCycle: true,
    allowCronAutomation: true,
    allowBrokerConnect: true,
    allowAdvancedAnalytics: true,
    enginePaused: false,
    isVisible: true,
    sortOrder: 3,
  },
  test_unlimited: {
    planCode: 'test_unlimited',
    name: 'Test (Unlimited)',
    priceMonthly: 0,
    maxAutoStocks: 999,
    allowManualCycle: true,
    allowCronAutomation: true,
    allowBrokerConnect: true,
    allowAdvancedAnalytics: true,
    enginePaused: true,
    isVisible: false,
    sortOrder: 99,
  },
};

/** Fetch all visible plans from DB, falls back to PLAN_DEFAULTS on error */
export async function getPlansFromDb(): Promise<SubscriptionPlan[]> {
  const { data, error } = await supabaseAdmin
    .from('subscription_plans')
    .select('*')
    .eq('is_visible', true)
    .order('sort_order', { ascending: true });

  if (error || !data?.length) {
    return Object.values(PLAN_DEFAULTS).filter((p) => p.isVisible);
  }

  return data.map((row) => ({
    planCode: row.plan_code as PlanCode,
    name: row.name,
    priceMonthly: Number(row.price_monthly),
    maxAutoStocks: row.max_auto_stocks,
    allowManualCycle: row.allow_manual_cycle,
    allowCronAutomation: row.allow_cron_automation,
    allowBrokerConnect: row.allow_broker_connect,
    allowAdvancedAnalytics: row.allow_advanced_analytics,
    enginePaused: row.engine_paused,
    isVisible: row.is_visible,
    sortOrder: row.sort_order,
  }));
}

/** Fetch a single plan from DB, falls back to PLAN_DEFAULTS */
export async function getPlanFromDb(planCode: PlanCode): Promise<SubscriptionPlan> {
  const { data, error } = await supabaseAdmin
    .from('subscription_plans')
    .select('*')
    .eq('plan_code', planCode)
    .maybeSingle();

  if (error || !data) {
    return PLAN_DEFAULTS[planCode] ?? PLAN_DEFAULTS['free'];
  }

  return {
    planCode: data.plan_code as PlanCode,
    name: data.name,
    priceMonthly: Number(data.price_monthly),
    maxAutoStocks: data.max_auto_stocks,
    allowManualCycle: data.allow_manual_cycle,
    allowCronAutomation: data.allow_cron_automation,
    allowBrokerConnect: data.allow_broker_connect,
    allowAdvancedAnalytics: data.allow_advanced_analytics,
    enginePaused: data.engine_paused,
    isVisible: data.is_visible,
    sortOrder: data.sort_order,
  };
}

/** Convert a SubscriptionPlan into an Entitlements shape (without isTestUser) */
export function planToEntitlements(plan: SubscriptionPlan): {
  planCode: string;
  status: string;
  maxAutoStocks: number;
  allowManualCycle: boolean;
  allowCronAutomation: boolean;
  allowBrokerConnect: boolean;
  allowAdvancedAnalytics: boolean;
  engine_paused: boolean;
} {
  return {
    planCode: plan.planCode,
    status: 'active',
    maxAutoStocks: plan.maxAutoStocks,
    allowManualCycle: plan.allowManualCycle,
    allowCronAutomation: plan.allowCronAutomation,
    allowBrokerConnect: plan.allowBrokerConnect,
    allowAdvancedAnalytics: plan.allowAdvancedAnalytics,
    engine_paused: plan.enginePaused,
  };
}
