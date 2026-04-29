import { supabaseAdmin } from '@/app/lib/supabaseAdmin';
import { getNotificationPreferences } from '@/app/lib/db/notificationPreferences';
import { NotificationEventPayload, NotificationEventRow } from '@/app/lib/notifications/types';

const MAX_RETRY_COUNT = 6;

function isTypeEnabledByPreference(
  type: NotificationEventPayload['type'],
  prefs: Awaited<ReturnType<typeof getNotificationPreferences>>
) {
  if (type === 'trade_filled') return prefs.trade_alerts;
  if (type === 'trade_skipped_safety') return prefs.broker_alerts;
  if (type === 'broker_sync_failed') return prefs.broker_alerts;
  if (type === 'score_alert') return prefs.score_alerts;
  if (type === 'daily_summary') return prefs.daily_summary;
  if (type === 'engine_cycle_completed') return prefs.daily_summary;
  return true;
}

function computeNextRetryAt(retryCount: number): string {
  const backoffMinutes = Math.min(60, Math.pow(2, retryCount));
  const next = new Date(Date.now() + backoffMinutes * 60 * 1000);
  return next.toISOString();
}

export async function enqueueNotificationEvent(payload: NotificationEventPayload) {
  const prefs = await getNotificationPreferences(payload.userId);
  const enabled = isTypeEnabledByPreference(payload.type, prefs);

  if (!enabled) {
    return null;
  }

  const row = {
    user_id: payload.userId,
    type: payload.type,
    title: payload.title,
    body: payload.body,
    url: payload.url ?? null,
    status: 'pending',
    provider: payload.provider ?? null,
    metadata: payload.metadata ?? null,
    idempotency_key: payload.idempotencyKey,
  };

  const { data, error } = await supabaseAdmin
    .from('notification_events')
    .insert(row)
    .select('*')
    .maybeSingle();

  if (error) {
    // Duplicate idempotency key means this exact event was already recorded.
    if (error.code === '23505') {
      const { data: existing, error: existingError } = await supabaseAdmin
        .from('notification_events')
        .select('*')
        .eq('user_id', payload.userId)
        .eq('idempotency_key', payload.idempotencyKey)
        .maybeSingle();

      if (existingError) throw existingError;
      return existing as NotificationEventRow | null;
    }

    throw error;
  }

  return data as NotificationEventRow;
}

export async function claimPendingNotificationEvents(limit = 50): Promise<NotificationEventRow[]> {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseAdmin.rpc('claim_notification_events', {
    p_limit: limit,
    p_now: nowIso,
  });

  if (error) throw error;
  return (data ?? []) as NotificationEventRow[];
}

export async function markNotificationSent(params: {
  eventId: string;
  provider: string;
  providerMessageId?: string;
}) {
  const { error } = await supabaseAdmin
    .from('notification_events')
    .update({
      status: 'sent',
      provider: params.provider,
      provider_message_id: params.providerMessageId ?? null,
      error_message: null,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.eventId);

  if (error) throw error;
}

export async function markNotificationDeferred(params: {
  eventId: string;
  nextRetryAt: string;
}) {
  const { error } = await supabaseAdmin
    .from('notification_events')
    .update({
      status: 'pending',
      next_retry_at: params.nextRetryAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.eventId);

  if (error) throw error;
}

export async function markNotificationFailed(params: {
  eventId: string;
  errorMessage: string;
  currentRetryCount: number;
  provider?: string;
}) {
  const nextRetryCount = params.currentRetryCount + 1;
  const shouldRetry = nextRetryCount <= MAX_RETRY_COUNT;

  const { error } = await supabaseAdmin
    .from('notification_events')
    .update({
      status: shouldRetry ? 'pending' : 'failed',
      provider: params.provider ?? null,
      error_message: params.errorMessage.slice(0, 1000),
      retry_count: nextRetryCount,
      next_retry_at: shouldRetry ? computeNextRetryAt(nextRetryCount) : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.eventId);

  if (error) throw error;
}

export async function listUserNotificationEvents(userId: string, limit = 30) {
  const safeLimit = Math.min(Math.max(limit, 1), 200);

  const { data, error } = await supabaseAdmin
    .from('notification_events')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error) throw error;
  return data ?? [];
}

export async function getUnreadNotificationCount(userId: string) {
  const { count, error } = await supabaseAdmin
    .from('notification_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) throw error;
  return count || 0;
}

export async function markAllNotificationsRead(userId: string) {
  const { error } = await supabaseAdmin
    .from('notification_events')
    .update({
      read_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) throw error;
}
