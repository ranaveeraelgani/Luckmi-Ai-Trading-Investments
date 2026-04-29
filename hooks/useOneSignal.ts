'use client';

import { useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

/**
 * Initializes OneSignal web push and links the authenticated Supabase user
 * as the external_id so server-side notifications can target them by user_id.
 *
 * Called once at app root. Safe to call on every page load — OneSignal
 * deduplicates its own init internally.
 */
export function useOneSignal() {
  useEffect(() => {
    const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
    if (!appId || typeof window === 'undefined') return;
    const oneSignalAppId: string = appId;

    async function init() {
      const OneSignal = (await import('react-onesignal')).default;

      await OneSignal.init({
        appId: oneSignalAppId,
        serviceWorkerPath: '/OneSignalSDKWorker.js',
        serviceWorkerUpdaterPath: '/OneSignalSDKUpdaterWorker.js',
        serviceWorkerParam: { scope: '/' },
        allowLocalhostAsSecureOrigin: process.env.NODE_ENV === 'development',
      });

      // Link the Supabase user ID as OneSignal external_id so
      // the server can target pushes by user_id via include_aliases.external_id
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await OneSignal.login(user.id);
      }

      // Ensure browser permission is requested at least once so
      // users can actually receive push notifications.
      const oneSignalApi = OneSignal as unknown as {
        Notifications?: {
          permission?: boolean;
          requestPermission?: () => Promise<void>;
        };
        User?: {
          PushSubscription?: {
            optedIn?: boolean;
            optIn?: () => Promise<void>;
          };
        };
      };

      if (oneSignalApi.Notifications?.permission !== true) {
        await oneSignalApi.Notifications?.requestPermission?.();
      }

      if (oneSignalApi.User?.PushSubscription?.optedIn === false) {
        await oneSignalApi.User?.PushSubscription?.optIn?.();
      }
    }

    init().catch((err) => {
      console.warn('[OneSignal] init failed:', err);
    });
  }, []);
}
