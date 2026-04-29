'use client';

import { useOneSignal } from '@/hooks/useOneSignal';

/**
 * Mount this once at app root (layout.tsx).
 * Renders nothing — only initializes OneSignal push subscription.
 */
export function OneSignalInit() {
  useOneSignal();
  return null;
}
