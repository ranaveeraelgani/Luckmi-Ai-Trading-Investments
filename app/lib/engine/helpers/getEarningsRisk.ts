/**
 * Checks whether any symbols have earnings within a risk window.
 * Blocks fresh entries 2 days before and 1 day after earnings.
 *
 * Uses Polygon/Massive ticker details (vX endpoint) which returns
 * `next_earnings_date`. Fails safe — if the API doesn't return the
 * field or the call fails, the symbol is NOT blocked.
 */

const EARNINGS_PRE_WINDOW_MS  = 2 * 24 * 60 * 60 * 1000; // 2 days before
const EARNINGS_POST_WINDOW_MS = 1 * 24 * 60 * 60 * 1000; // 1 day after (drift risk)

function getApiBase(): string {
  // Support both Massive (Polygon reseller) and direct Polygon
  return process.env.MASSIVE_API_BASE_URL || 'https://api.polygon.io';
}

async function fetchEarningsDate(symbol: string, apiKey: string): Promise<Date | null> {
  const base = getApiBase();
  try {
    const res = await fetch(
      `${base}/vX/reference/tickers/${encodeURIComponent(symbol)}?apiKey=${apiKey}`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const raw = data?.results?.next_earnings_date as string | undefined;
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/**
 * Returns a Set of symbols where fresh entry should be blocked due to
 * upcoming or very recent earnings.
 *
 * Only pass symbols that are NOT already in-position — no need to
 * check stocks we're already holding (we don't force exits for earnings).
 */
export async function getEarningsRiskSymbols(symbols: string[]): Promise<Set<string>> {
  const apiKey = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY;
  if (!apiKey || symbols.length === 0) return new Set();

  const now = Date.now();
  const riskSet = new Set<string>();

  await Promise.all(
    symbols.map(async (symbol) => {
      const earningsDate = await fetchEarningsDate(symbol, apiKey);
      if (!earningsDate) return; // no data — don't block

      const earningsMs = earningsDate.getTime();
      const msUntil = earningsMs - now;

      const isBeforeRisk  = msUntil >= 0 && msUntil < EARNINGS_PRE_WINDOW_MS;
      const isAfterRisk   = msUntil < 0 && Math.abs(msUntil) < EARNINGS_POST_WINDOW_MS;

      if (isBeforeRisk || isAfterRisk) {
        riskSet.add(symbol);
        console.log(
          `[earnings] ${symbol} blocked — earnings ${earningsDate.toISOString()} ` +
          `(${isBeforeRisk ? 'upcoming' : 'recent'})`
        );
      }
    })
  );

  return riskSet;
}
