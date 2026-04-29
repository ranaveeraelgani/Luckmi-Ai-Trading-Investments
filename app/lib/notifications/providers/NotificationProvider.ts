import { NotificationEventRow, NotificationSendResult } from '@/app/lib/notifications/types';

export interface NotificationProvider {
  readonly name: string;
  send(event: NotificationEventRow): Promise<NotificationSendResult>;
}
