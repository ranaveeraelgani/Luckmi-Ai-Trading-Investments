import {
  claimPendingNotificationEvents,
  enqueueNotificationEvent,
  markNotificationDeferred,
  markNotificationFailed,
  markNotificationSent,
} from '@/app/lib/db/notifications';
import { getNotificationPreferences } from '@/app/lib/db/notificationPreferences';
import { NoopNotificationProvider } from '@/app/lib/notifications/providers/NoopNotificationProvider';
import { OneSignalNotificationProvider } from '@/app/lib/notifications/providers/OneSignalNotificationProvider';
import { NotificationProvider } from '@/app/lib/notifications/providers/NotificationProvider';
import { getNextMarketOpenRetryAt, shouldDeferForQuietHours } from '@/app/lib/notifications/quietHours';
import { NotificationEventPayload } from '@/app/lib/notifications/types';

export class NotificationService {
  constructor(private readonly provider: NotificationProvider) {}

  async queueEvent(payload: NotificationEventPayload) {
    return enqueueNotificationEvent(payload);
  }

  async processPending(limit = 50) {
    const events = await claimPendingNotificationEvents(limit);

    let sent = 0;
    let failed = 0;

    for (const event of events) {
      try {
        const prefs = await getNotificationPreferences(event.user_id);
        if (shouldDeferForQuietHours(event.type, prefs)) {
          await markNotificationDeferred({
            eventId: event.id,
            nextRetryAt: getNextMarketOpenRetryAt(),
          });
          continue;
        }

        const result = await this.provider.send(event);

        if (result.ok) {
          await markNotificationSent({
            eventId: event.id,
            provider: this.provider.name,
            providerMessageId: result.providerMessageId,
          });
          sent += 1;
        } else {
          await markNotificationFailed({
            eventId: event.id,
            errorMessage: result.error || 'Unknown provider error',
            currentRetryCount: event.retry_count,
            provider: this.provider.name,
          });
          failed += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown dispatch error';
        await markNotificationFailed({
          eventId: event.id,
          errorMessage: message,
          currentRetryCount: event.retry_count,
          provider: this.provider.name,
        });
        failed += 1;
      }
    }

    return {
      processed: events.length,
      sent,
      failed,
      provider: this.provider.name,
    };
  }
}

export function createNotificationService() {
  const providerName = String(process.env.NOTIFICATION_PROVIDER || 'onesignal').toLowerCase();

  if (providerName === 'onesignal') {
    return new NotificationService(new OneSignalNotificationProvider());
  }

  return new NotificationService(new NoopNotificationProvider());
}
