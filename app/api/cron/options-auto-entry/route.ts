/**
 * @swagger
 * /api/cron/options-auto-entry:
 *   post:
 *     summary: Auto options entry — place trades for users with auto-entry ON
 *     description: |
 *       For every user who has auto_entry_enabled=true in option_preferences:
 *         1. Validates broker connection and account tradability.
 *         2. Checks available option slot capacity (max_open_positions - current_open).
 *         3. Fetches current ranked opportunities from the scan cache.
 *         4. Filters by min_score_threshold and max_loss_per_trade.
 *         5. Places up to auto_entry_max_positions new trades using broker entry.
 *
 *       Pre-requisites enforced per user (skip, not error):
 *         - Broker keys configured + connection_status = connected
 *         - Broker account not blocked
 *         - options_buying_power >= max_loss_per_trade for at least one contract
 *
 *     tags: [Cron]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Batch processed (or skipped — market closed)
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Cycle failed
 *
 * Trigger: every 15–30 min during market hours after options-cycle runs.
 * Use the same ENGINE_SECRET bearer token.
 */

import { NextResponse } from 'next/server';
import { isMarketOpenNowLive } from '@/app/lib/market/isMarketOpenNow';
import { supabaseAdmin } from '@/app/lib/supabaseAdmin';
import { getBrokerExecutionMode } from '@/app/lib/broker/getBrokerExecutionMode';
import { checkBrokerAccountCanTrade } from '@/app/lib/broker/checkBrokerAccountCanTrade';
import { executeOptionEntriesForUser } from '@/app/lib/options/executeOptionEntriesForUser';
import type { OptionsOpportunity } from '@/app/lib/options/types';

export const maxDuration = 120;

const MAX_USERS_PER_RUN = 50;
const AUTO_ENTRY_MIN_SCORE_FLOOR = 55;

// ── Internal helpers ─────────────────────────────────────────────────────────

/** Resolve the deployment origin for internal fetches. */
function getOrigin(req: Request): string {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost:3000';
  const proto = req.headers.get('x-forwarded-proto') ?? 'http';
  return `${proto}://${host}`;
}


/** Fetch opportunities from the scan cache endpoint.
 *  Uses require_cached=1 so the cron never blocks on a cold full scan (which
 *  can take 60-65 s and exceed Supabase's 55 s cron timeout).  If no snapshot
 *  is ready the endpoint returns an empty payload AND kicks a background warm,
 *  so the next scheduled run will find a hot cache.
 */
async function fetchOpportunities(origin: string): Promise<{ opportunities: OptionsOpportunity[]; dataMode: 'mock' | 'live_strict' | 'unknown'; fromCache: boolean }> {
  try {
    const res = await fetch(`${origin}/api/options/opportunities?require_cached=1`, {
      headers: { 'x-internal-cron': 'true' },
    });
    if (!res.ok) return { opportunities: [], dataMode: 'unknown', fromCache: false };
    const data = await res.json();
    const fromCache = data?.skipped !== true;
    return {
      opportunities: Array.isArray(data?.opportunities) ? (data.opportunities as OptionsOpportunity[]) : [],
      dataMode: data?.dataMode === 'live_strict' ? 'live_strict' : data?.dataMode === 'mock' ? 'mock' : 'unknown',
      fromCache,
    };
  } catch {
    return { opportunities: [], dataMode: 'unknown', fromCache: false };
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.ENGINE_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Market hours guard ────────────────────────────────────────────────────
  if (!(await isMarketOpenNowLive())) {
    return NextResponse.json({ skipped: true, reason: 'Market closed' });
  }

  const origin = getOrigin(req);

  // ── Load users with auto-entry enabled ───────────────────────────────────
  const { data: prefRows, error: prefErr } = await supabaseAdmin
    .from('option_preferences')
    .select('user_id, max_loss_per_trade, max_open_positions, min_score_threshold, auto_entry_max_positions')
    .eq('auto_entry_enabled', true)
    .limit(MAX_USERS_PER_RUN);

  if (prefErr) {
    console.error('[options-auto-entry] failed to load preferences:', prefErr.message);
    return NextResponse.json({ error: prefErr.message }, { status: 500 });
  }

  const users = prefRows ?? [];

  if (users.length === 0) {
    return NextResponse.json({ success: true, usersProcessed: 0, tradesPlaced: 0 });
  }

  // ── Fetch opportunities once — shared across all users ───────────────────
  // require_cached=1 ensures we never block here waiting for a full 60s scan.
  const { opportunities: allOpportunities, dataMode, fromCache } = await fetchOpportunities(origin);

  if (!fromCache) {
    // Cache was cold — background scan has been kicked off. Skip this cycle
    // so Supabase cron does not time out; next run will have a warm cache.
    console.info('[options-auto-entry] no cached opportunities yet — skipping cycle, background warm started');
    return NextResponse.json({
      success: true,
      usersProcessed: 0,
      tradesPlaced: 0,
      skippedUsers: users.length,
      reason: 'Opportunities cache was cold — background scan started, retry next cycle.',
      details: users.map((u) => ({ userId: u.user_id, placed: 0, skippedReason: 'cache-warming' })),
    });
  }

  if (dataMode !== 'live_strict') {
    return NextResponse.json({
      success: true,
      usersProcessed: 0,
      tradesPlaced: 0,
      skippedUsers: users.length,
      reason: 'Auto-entry disabled because opportunities are not in live_strict mode.',
      details: users.map((u) => ({ userId: u.user_id, placed: 0, skippedReason: 'mock data mode' })),
    });
  }

  let totalPlaced = 0;
  let totalSkippedUsers = 0;
  let totalEligibleCandidates = 0;
  let totalExecutableCandidates = 0;
  let totalRejectedNonExecutable = 0;
  const userResults: Array<{
    userId: string;
    placed: number;
    skippedReason?: string;
    eligibleCandidates?: number;
    executableCandidates?: number;
    nonExecutableRejected?: number;
  }> = [];

  for (const prefs of users) {
    const userId: string = prefs.user_id;

    try {
      // ── Pre-check 1: broker enabled + connected ──────────────────────────
      const brokerMode = await getBrokerExecutionMode(userId);
      if (!brokerMode.enabled) {
        totalSkippedUsers++;
        userResults.push({ userId, placed: 0, skippedReason: `broker: ${brokerMode.reason}` });
        continue;
      }

      // ── Pre-check 2: account not blocked ────────────────────────────────
      const canTrade = await checkBrokerAccountCanTrade(userId);
      if (!canTrade.allowed) {
        totalSkippedUsers++;
        userResults.push({ userId, placed: 0, skippedReason: `account: ${canTrade.reason}` });
        continue;
      }

      const result = await executeOptionEntriesForUser({
        userId,
        opportunities: allOpportunities,
        policy: {
          maxLossPerTrade: prefs.max_loss_per_trade ?? 300,
          maxOpenPositions: prefs.max_open_positions ?? 5,
          minScoreThreshold: prefs.min_score_threshold ?? 35,
          maxEntriesPerRun: prefs.auto_entry_max_positions ?? 3,
        },
        minScoreFloor: AUTO_ENTRY_MIN_SCORE_FLOOR,
        aiSource: 'auto_entry',
      });

      totalPlaced += result.placed;
      totalEligibleCandidates += result.attempted;
      totalExecutableCandidates += result.executableCandidates;
      totalRejectedNonExecutable += result.nonExecutableRejected;

      userResults.push({
        userId,
        placed: result.placed,
        skippedReason: result.skippedReason,
        eligibleCandidates: result.attempted,
        executableCandidates: result.executableCandidates,
        nonExecutableRejected: result.nonExecutableRejected,
      });
    } catch (userErr: any) {
      console.error(`[options-auto-entry] unhandled error for user=${userId}:`, userErr?.message);
      totalSkippedUsers++;
      userResults.push({ userId, placed: 0, skippedReason: `error: ${userErr?.message}` });
    }
  }

  console.info(
    `[options-auto-entry] done users=${users.length} placed=${totalPlaced} skippedUsers=${totalSkippedUsers} eligible=${totalEligibleCandidates} executable=${totalExecutableCandidates} rejectedNonExecutable=${totalRejectedNonExecutable}`,
  );

  return NextResponse.json({
    success: true,
    usersProcessed: users.length,
    tradesPlaced: totalPlaced,
    skippedUsers: totalSkippedUsers,
    metrics: {
      eligibleCandidates: totalEligibleCandidates,
      executableCandidates: totalExecutableCandidates,
      nonExecutableRejected: totalRejectedNonExecutable,
    },
    details: userResults,
  });
}
