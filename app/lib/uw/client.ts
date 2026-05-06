// ============================================================
// Shared Unusual Whales API client
// Centralises auth headers, retry/backoff, rate-limit telemetry,
// and in-flight request deduplication for all UW proxy routes.
// ============================================================

const UW_BASE = 'https://api.unusualwhales.com';

export type UwFetchOptions = {
  /** Next.js ISR revalidate seconds (passed to fetch `next.revalidate`). */
  revalidate?: number;
  signal?: AbortSignal;
};

export type UwResponse<T> = {
  data: T;
  rateLimitRemaining: number | null;
  rateLimitReset: number | null;
};

export type UwTelemetrySnapshot = {
  totalRequests: number;
  dedupHits: number;
  dedupMisses: number;
  retries: number;
  rateLimit429s: number;
  requestErrors: number;
  lowRateLimitWarnings: number;
  inflightPeak: number;
  inflightCurrent: number;
  lastRateLimitRemaining: number | null;
  lastRateLimitReset: number | null;
  lastRateSampleAtMs: number | null;
};

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

// ── In-flight deduplication ──────────────────────────────────────────────────
// Maps a cache key (url + revalidate bucket) → the in-flight Promise.
// When two concurrent callers request the same UW URL before the first
// response returns, the second caller waits on the same promise instead of
// issuing a duplicate HTTP request.  The map entry is deleted as soon as
// the promise settles so future calls get a fresh fetch.
const inflight = new Map<string, Promise<UwResponse<unknown>>>();
const telemetry: Omit<UwTelemetrySnapshot, 'inflightCurrent'> = {
  totalRequests: 0,
  dedupHits: 0,
  dedupMisses: 0,
  retries: 0,
  rateLimit429s: 0,
  requestErrors: 0,
  lowRateLimitWarnings: 0,
  inflightPeak: 0,
  lastRateLimitRemaining: null,
  lastRateLimitReset: null,
  lastRateSampleAtMs: null,
};

export function uwGetTelemetrySnapshot(): UwTelemetrySnapshot {
  return {
    ...telemetry,
    inflightCurrent: inflight.size,
  };
}

// Returns a dynamic inter-call delay based on UW remaining/reset headers.
// Fallback is returned when no usable rate sample exists yet.
export function uwGetAdaptiveDelayMs(
  fallbackMs: number,
  minMs = 120,
  maxMs = 2000,
): number {
  const remaining = telemetry.lastRateLimitRemaining;
  const reset = telemetry.lastRateLimitReset;
  const sampleAt = telemetry.lastRateSampleAtMs;

  if (!Number.isFinite(remaining) || !Number.isFinite(reset) || !sampleAt || remaining == null || reset == null) {
    return Math.max(minMs, Math.min(maxMs, fallbackMs));
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const secondsToReset = Math.max(1, reset - nowSec);

  if (remaining <= 0) {
    return maxMs;
  }

  const budgetMsPerCall = Math.ceil((secondsToReset * 1000) / remaining);
  const staleSample = Date.now() - sampleAt > 60_000;
  const paced = staleSample ? fallbackMs : Math.max(fallbackMs, budgetMsPerCall);
  return Math.max(minMs, Math.min(maxMs, paced));
}

/**
 * Fetch a UW API endpoint with automatic retry / exponential backoff on 429.
 * Concurrent identical requests are coalesced into a single HTTP call.
 * @param path   Path starting with `/api/…`
 * @param opts   Optional ISR revalidate and AbortSignal
 */
export function uwFetch<T = unknown>(
  path: string,
  opts: UwFetchOptions = {}
): Promise<UwResponse<T>> {
  // AbortSignal is caller-specific and should never be shared across callers,
  // so requests that differ only in signal are still treated as the same key.
  const key = `${path}::${opts.revalidate ?? ''}`;

  const existing = inflight.get(key);
  if (existing) {
    telemetry.dedupHits += 1;
    return existing as Promise<UwResponse<T>>;
  }

  telemetry.dedupMisses += 1;
  telemetry.totalRequests += 1;

  const promise = _doFetch<T>(path, opts).finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise as Promise<UwResponse<unknown>>);
  telemetry.inflightPeak = Math.max(telemetry.inflightPeak, inflight.size);
  return promise;
}

async function _doFetch<T>(
  path: string,
  opts: UwFetchOptions
): Promise<UwResponse<T>> {
  const apiKey = process.env.UNUSUAL_WHALES_API_KEY;
  if (!apiKey) throw new Error('UNUSUAL_WHALES_API_KEY not configured');

  const url = `${UW_BASE}${path}`;
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      telemetry.retries += 1;
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }

    const fetchOpts: RequestInit & { next?: { revalidate: number } } = {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: opts.signal,
    };
    if (opts.revalidate != null) {
      fetchOpts.next = { revalidate: opts.revalidate };
    }

    const res = await fetch(url, fetchOpts);

    const rateLimitRemaining = parseIntHeader(res.headers.get('x-ratelimit-remaining'));
    const rateLimitReset = parseIntHeader(res.headers.get('x-ratelimit-reset'));

    if (rateLimitRemaining !== null) telemetry.lastRateLimitRemaining = rateLimitRemaining;
    if (rateLimitReset !== null) telemetry.lastRateLimitReset = rateLimitReset;
    if (rateLimitRemaining !== null || rateLimitReset !== null) telemetry.lastRateSampleAtMs = Date.now();

    if (res.status === 429) {
      telemetry.rateLimit429s += 1;
      const retryAfterRaw = res.headers.get('retry-after');
      const waitMs = retryAfterRaw ? parseRetryAfter(retryAfterRaw) : 2000;
      console.warn(`[uw-client] 429 rate limit on ${path}, waiting ${waitMs}ms (attempt ${attempt + 1})`);
      await new Promise((r) => setTimeout(r, waitMs));
      lastErr = new Error(`UW 429 rate limit: ${path}`);
      continue;
    }

    if (!res.ok) {
      telemetry.requestErrors += 1;
      const body = await res.text().catch(() => '');
      throw new Error(`UW ${res.status} on ${path}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as T;

    if (rateLimitRemaining !== null && rateLimitRemaining < 10) {
      telemetry.lowRateLimitWarnings += 1;
      console.warn(
        `[uw-client] low rate limit: ${rateLimitRemaining} remaining, reset at ${rateLimitReset}`
      );
    }

    return { data, rateLimitRemaining, rateLimitReset };
  }

  throw lastErr ?? new Error(`UW fetch failed after ${MAX_RETRIES} attempts: ${path}`);
}

function parseIntHeader(val: string | null): number | null {
  if (!val) return null;
  const n = parseInt(val, 10);
  return Number.isFinite(n) ? n : null;
}

function parseRetryAfter(val: string): number {
  const seconds = parseFloat(val);
  if (Number.isFinite(seconds)) return Math.ceil(seconds * 1000);
  const date = Date.parse(val);
  if (!isNaN(date)) return Math.max(0, date - Date.now());
  return 2000;
}
