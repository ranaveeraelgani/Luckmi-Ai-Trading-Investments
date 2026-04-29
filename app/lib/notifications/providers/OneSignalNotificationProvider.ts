import { NotificationProvider } from '@/app/lib/notifications/providers/NotificationProvider';
import { NotificationEventRow, NotificationSendResult } from '@/app/lib/notifications/types';

type OneSignalResponse = {
  id?: string;
  errors?: string[];
};

export class OneSignalNotificationProvider implements NotificationProvider {
  readonly name = 'onesignal';

  private readonly appId = process.env.ONESIGNAL_APP_ID;
  private readonly apiKey = process.env.ONESIGNAL_API_KEY;

  async send(event: NotificationEventRow): Promise<NotificationSendResult> {
    if (!this.appId || !this.apiKey) {
      return {
        ok: false,
        error: 'Missing ONESIGNAL_APP_ID or ONESIGNAL_API_KEY',
      };
    }

    const payload = {
      app_id: this.appId,
      include_aliases: {
        external_id: [event.user_id],
      },
      target_channel: 'push',
      headings: { en: event.title },
      contents: { en: event.body },
      url: event.url || undefined,
      data: event.metadata || {},
    };

    try {
      const res = await fetch('https://api.onesignal.com/notifications', {
        method: 'POST',
        headers: {
          Authorization: `Key ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const json = (await res.json().catch(() => null)) as OneSignalResponse | null;

      if (!res.ok) {
        const errorText = json?.errors?.join(', ') || `OneSignal HTTP ${res.status}`;
        return {
          ok: false,
          error: errorText,
        };
      }

      return {
        ok: true,
        providerMessageId: json?.id,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'OneSignal request failed',
      };
    }
  }
}
