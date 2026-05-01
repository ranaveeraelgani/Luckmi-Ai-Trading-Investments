import { createClient } from '@/app/lib/supabaseServer';
import { selectPlanForUser } from '@/app/lib/subscriptions/selectPlan';
import type { PlanCode } from '@/app/lib/subscriptions/plans';

/**
 * POST /api/subscription/select
 * Body: { planCode: PlanCode }
 * Lets an authenticated user change their own subscription plan.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const planCode = body?.planCode as PlanCode | undefined;

    if (!planCode) {
      return new Response(JSON.stringify({ error: 'planCode required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await selectPlanForUser(user.id, planCode);

    if (!result.success) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ status: 'updated', plan: result.plan }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[subscription/select] error:', err);
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
