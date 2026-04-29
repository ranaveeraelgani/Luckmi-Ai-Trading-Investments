import { isMarketOpenNow } from '@/app/lib/market/isMarketOpenNow';
import { NotificationType } from '@/app/lib/notifications/types';

export type QuietHoursPrefs = {
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
  timezone?: string | null;
  critical_only?: boolean;
};

const CRITICAL_TYPES = new Set<NotificationType>([
  'trade_skipped_safety',
  'broker_sync_failed',
]);

function toMinutes(hhmmss: string) {
  const [h = '0', m = '0'] = hhmmss.split(':');
  return Number(h) * 60 + Number(m);
}

function getMinutesInTimeZone(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function isInsideConfiguredQuietWindow(prefs: QuietHoursPrefs, now = new Date()) {
  if (!prefs.quiet_hours_start || !prefs.quiet_hours_end) return false;

  const timezone = prefs.timezone || 'America/Chicago';
  const current = getMinutesInTimeZone(now, timezone);
  const start = toMinutes(prefs.quiet_hours_start);
  const end = toMinutes(prefs.quiet_hours_end);

  if (start === end) return true;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

export function shouldDeferForQuietHours(
  type: NotificationType,
  prefs: QuietHoursPrefs,
  now = new Date()
) {
  if (prefs.critical_only && !CRITICAL_TYPES.has(type)) {
    return true;
  }

  if (isInsideConfiguredQuietWindow(prefs, now) && !CRITICAL_TYPES.has(type)) {
    return true;
  }

  // Default behavior: market-closed periods are treated as quiet hours.
  if (!isMarketOpenNow(now) && !CRITICAL_TYPES.has(type)) {
    return true;
  }

  return false;
}

export function getNextMarketOpenRetryAt(now = new Date()) {
  const probe = new Date(now.getTime());

  // Scan forward in 15-minute increments for the next market-open window.
  for (let i = 1; i <= 14 * 24 * 4; i += 1) {
    probe.setMinutes(probe.getMinutes() + 15);
    if (isMarketOpenNow(probe)) {
      return probe.toISOString();
    }
  }

  // Fallback in case holiday table drifts.
  return new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();
}
