// Startup cron hooks for cache warming
import { warmOpportunityCache, scheduleOpportunityCacheWarmup } from '../options/opportunityCacheWarmup';

export async function runStartupCrons() {
  // Warm the opportunity cache immediately
  await warmOpportunityCache();
  // Schedule periodic warming every 10 minutes
  scheduleOpportunityCacheWarmup(10 * 60 * 1000);
}
