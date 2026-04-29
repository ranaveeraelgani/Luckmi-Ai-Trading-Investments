import { supabaseAdmin } from '@/app/lib/supabaseAdmin';

export type NotificationPreferences = {
  user_id: string;
  trade_alerts: boolean;
  score_alerts: boolean;
  broker_alerts: boolean;
  daily_summary: boolean;
  marketing_alerts: boolean;
  critical_only: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string;
};

export const DEFAULT_NOTIFICATION_PREFERENCES = {
  trade_alerts: true,
  score_alerts: true,
  broker_alerts: true,
  daily_summary: true,
  marketing_alerts: false,
  critical_only: false,
  quiet_hours_start: null,
  quiet_hours_end: null,
  timezone: 'America/Chicago',
};

export async function getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  const { data, error } = await supabaseAdmin
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    return {
      user_id: userId,
      ...DEFAULT_NOTIFICATION_PREFERENCES,
    };
  }

  return data as NotificationPreferences;
}

export async function upsertNotificationPreferences(
  userId: string,
  patch: Partial<Omit<NotificationPreferences, 'user_id'>>
): Promise<NotificationPreferences> {
  const payload = {
    user_id: userId,
    ...patch,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('notification_preferences')
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return data as NotificationPreferences;
}
