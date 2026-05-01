import { createClient } from '@/app/lib/supabaseServer';
import { getPlansFromDb } from '@/app/lib/subscriptions/plans';

/**
 * GET /api/subscription/plans
 * Returns all visible subscription plans from the subscription_plans table.
 * Public (auth required for context, but plan list itself is not sensitive).
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const plans = await getPlansFromDb();

    return new Response(JSON.stringify({ plans }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[subscription/plans] error:', err);
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
