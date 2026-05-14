// Opportunity cache warmup utility
// Triggers a background scan to warm the opportunities cache at startup and on demand

import fetch from 'node-fetch';

const WARMUP_URL = process.env.OPPORTUNITY_WARMUP_URL || 'http://localhost:3000/api/options/opportunities';

export async function warmOpportunityCache() {
  try {
    // Trigger a scan (no require_cached, so it will always scan)
    await fetch(WARMUP_URL, { method: 'GET', headers: { 'x-internal-cron': 'true' } });
    // Optionally log or handle response
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[opportunityCacheWarmup] failed:', err);
  }
}

// Optionally, schedule periodic warming (every 10 min)
export function scheduleOpportunityCacheWarmup(intervalMs = 10 * 60 * 1000) {
  setInterval(() => {
    warmOpportunityCache();
  }, intervalMs);
}
