import { syncAlpacaForUser } from "@/app/lib/broker/syncAlpacaForUser";

const DEFAULT_SYNC_TTL_MS = 20_000;

declare global {
  // eslint-disable-next-line no-var
  var _alpacaSyncAtByUserId: Map<string, number> | undefined;
}

function getSyncCache() {
  if (!globalThis._alpacaSyncAtByUserId) {
    globalThis._alpacaSyncAtByUserId = new Map<string, number>();
  }
  return globalThis._alpacaSyncAtByUserId;
}

export async function syncAlpacaIfStale(userId: string, ttlMs = DEFAULT_SYNC_TTL_MS) {
  const cache = getSyncCache();
  const lastSyncAt = cache.get(userId) ?? 0;

  if (Date.now() - lastSyncAt < ttlMs) return;

  await syncAlpacaForUser(userId);
  cache.set(userId, Date.now());
}
