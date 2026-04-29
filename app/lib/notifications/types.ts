export const NotificationStatuses = [
  'pending',
  'processing',
  'sent',
  'failed',
] as const;

export type NotificationStatus = (typeof NotificationStatuses)[number];

export const NotificationTypes = [
  'trade_filled',
  'trade_skipped_safety',
  'broker_sync_failed',
  'engine_cycle_completed',
  'score_alert',
  'daily_summary',
] as const;

export type NotificationType = (typeof NotificationTypes)[number];

export type NotificationEventPayload = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  url?: string | null;
  idempotencyKey: string;
  metadata?: Record<string, unknown> | null;
  provider?: string | null;
};

export type NotificationEventRow = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  url: string | null;
  status: NotificationStatus;
  provider: string | null;
  provider_message_id: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  idempotency_key: string;
  retry_count: number;
  attempts: number;
  last_attempt_at: string | null;
  next_retry_at: string | null;
  read_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationSendResult = {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
};
