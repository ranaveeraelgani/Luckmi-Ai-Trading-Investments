import { createClient } from '@/app/lib/supabaseServer';
import { getEntitlements, subscriptionsEnforced } from '@/app/lib/subscriptions/getEntitlements';

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const entitlements = await getEntitlements(user.id);
  const subscriptionEnabled =
    process.env.SUBSCRIPTION_ENABLED === 'true' ||
    process.env.NEXT_PUBLIC_SUBSCRIPTION_ENABLED === 'true';

  return Response.json({
    ...entitlements,
    enforced: subscriptionsEnforced(),
    subscription_enabled: subscriptionEnabled,
  });
}