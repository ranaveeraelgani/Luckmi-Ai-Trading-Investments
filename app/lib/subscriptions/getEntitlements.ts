import { supabaseAdmin } from '@/app/lib/supabaseAdmin';

export type Entitlements = {
  planCode: string;
  status: string;
  maxAutoStocks: number;
  allowManualCycle: boolean;
  allowCronAutomation: boolean;
  allowBrokerConnect: boolean;
  allowAdvancedAnalytics: boolean;
  engine_paused: boolean;
};

export function subscriptionsEnforced() {
  return process.env.SUBSCRIPTIONS_ENFORCED === 'true';
}

export async function getEntitlements(userId: string): Promise<Entitlements> {
  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return {
      planCode: 'test_unlimited',
      status: 'active',
      maxAutoStocks: 999,
      allowManualCycle: true,
      allowCronAutomation: true,
      allowBrokerConnect: true,
      allowAdvancedAnalytics: true,
      engine_paused: true,
    };
  }

  return {
    planCode: data.plan_code,
    status: data.status,
    maxAutoStocks: data.max_auto_stocks,
    allowManualCycle: data.allow_manual_cycle,
    allowCronAutomation: data.allow_cron_automation,
    allowBrokerConnect: data.allow_broker_connect,
    allowAdvancedAnalytics: data.allow_advanced_analytics,
    engine_paused: data.engine_paused,
  };
}