import { NotificationProvider } from '@/app/lib/notifications/providers/NotificationProvider';
import { NotificationEventRow, NotificationSendResult } from '@/app/lib/notifications/types';

export class NoopNotificationProvider implements NotificationProvider {
  readonly name = 'noop';

  async send(_event: NotificationEventRow): Promise<NotificationSendResult> {
    return {
      ok: true,
    };
  }
}
