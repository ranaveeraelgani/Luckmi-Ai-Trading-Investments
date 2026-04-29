import { createClient } from '@/app/lib/supabaseServer';
import { createNotificationService } from '@/app/lib/notifications/service';

function buildPayload(userId: string) {
  const now = new Date();
  return {
    userId,
    type: 'score_alert' as const,
    title: 'Local test notification',
    body: `Queued at ${now.toLocaleTimeString()}`,
    url: '/notifications',
    metadata: {
      source: 'local-test-endpoint',
      queuedAt: now.toISOString(),
    },
    idempotencyKey: `local-test:${userId}:${now.getTime()}`,
  };
}

async function handleTestNotification() {
  if (process.env.NODE_ENV === 'production') {
    return new Response('Not found', { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const service = createNotificationService();
  const payload = buildPayload(user.id);
  const event = await service.queueEvent(payload);

  return Response.json({
    success: true,
    queued: Boolean(event),
    event,
  });
}

export async function POST() {
  return handleTestNotification();
}

export async function GET() {
  return handleTestNotification();
}
