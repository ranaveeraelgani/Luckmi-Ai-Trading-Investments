import { createClient } from '@/app/lib/supabaseServer';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  getNotificationPreferences,
  upsertNotificationPreferences,
} from '@/app/lib/db/notificationPreferences';

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const prefs = await getNotificationPreferences(user.id);
    return Response.json({ preferences: prefs });
  } catch (error) {
    console.error('Failed to load notification preferences:', error);
    return new Response('Failed to load notification preferences', { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const body = await req.json();

    const existing = await getNotificationPreferences(user.id);

    const patch = {
      trade_alerts:
        typeof body?.trade_alerts === 'boolean'
          ? body.trade_alerts
          : existing.trade_alerts ?? DEFAULT_NOTIFICATION_PREFERENCES.trade_alerts,
      score_alerts:
        typeof body?.score_alerts === 'boolean'
          ? body.score_alerts
          : existing.score_alerts ?? DEFAULT_NOTIFICATION_PREFERENCES.score_alerts,
      broker_alerts:
        typeof body?.broker_alerts === 'boolean'
          ? body.broker_alerts
          : existing.broker_alerts ?? DEFAULT_NOTIFICATION_PREFERENCES.broker_alerts,
      daily_summary:
        typeof body?.daily_summary === 'boolean'
          ? body.daily_summary
          : existing.daily_summary ?? DEFAULT_NOTIFICATION_PREFERENCES.daily_summary,
      marketing_alerts:
        typeof body?.marketing_alerts === 'boolean'
          ? body.marketing_alerts
          : existing.marketing_alerts ?? DEFAULT_NOTIFICATION_PREFERENCES.marketing_alerts,
      critical_only:
        typeof body?.critical_only === 'boolean'
          ? body.critical_only
          : existing.critical_only ?? DEFAULT_NOTIFICATION_PREFERENCES.critical_only,
      quiet_hours_start:
        typeof body?.quiet_hours_start === 'string' || body?.quiet_hours_start === null
          ? body.quiet_hours_start
          : existing.quiet_hours_start ?? DEFAULT_NOTIFICATION_PREFERENCES.quiet_hours_start,
      quiet_hours_end:
        typeof body?.quiet_hours_end === 'string' || body?.quiet_hours_end === null
          ? body.quiet_hours_end
          : existing.quiet_hours_end ?? DEFAULT_NOTIFICATION_PREFERENCES.quiet_hours_end,
      timezone:
        typeof body?.timezone === 'string' && body.timezone.trim().length > 0
          ? body.timezone
          : existing.timezone ?? DEFAULT_NOTIFICATION_PREFERENCES.timezone,
    };

    const preferences = await upsertNotificationPreferences(user.id, patch);
    return Response.json({ success: true, preferences });
  } catch (error) {
    console.error('Failed to update notification preferences:', error);
    return new Response('Failed to update notification preferences', { status: 500 });
  }
}
