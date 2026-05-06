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
import { placeOptionsBrokerEntry } from '@/app/lib/options/placeOptionsBrokerEntry';
import type { OptionsOpportunity } from '@/app/lib/options/types';

// ── OCC symbol builder (same logic as UI buildOccSymbol) ─────────────────────
function buildOccSymbol(underlying: string, expiry: string, optionType: 'call' | 'put', strike: number): string {
  const d = expiry.replace(/-/g, '');
  const ymd = d.length === 8 ? d.slice(2) : d;
  const cp = optionType === 'call' ? 'C' : 'P';
  const strikePadded = Math.round(strike * 1000).toString().padStart(8, '0');
  return `${underlying.toUpperCase()}${ymd}${cp}${strikePadded}`;
}

export const maxDuration = 120;

const MAX_USERS_PER_RUN = 50;

// ── Internal helpers ─────────────────────────────────────────────────────────

/** Resolve the deployment origin for internal fetches. */
function getOrigin(req: Request): string {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost:3000';
  const proto = req.headers.get('x-forwarded-proto') ?? 'http';
  return `${proto}://${host}`;
}

/** Fetch opportunities list from the scan cache endpoint. */
async function fetchOpportunities(origin: string): Promise<{ opportunities: OptionsOpportunity[]; dataMode: 'mock' | 'live_strict' | 'unknown' }> {
  try {
    const res = await fetch(`${origin}/api/options/opportunities`, {
      headers: { 'x-internal-cron': 'true' },
      // deliberately no revalidate — let the endpoint manage its own cache TTL
    });
    if (!res.ok) return { opportunities: [], dataMode: 'unknown' };
    const data = await res.json();
    return {
      opportunities: Array.isArray(data?.opportunities) ? (data.opportunities as OptionsOpportunity[]) : [],
      dataMode: data?.dataMode === 'live_strict' ? 'live_strict' : data?.dataMode === 'mock' ? 'mock' : 'unknown',
    };
  } catch {
    return { opportunities: [], dataMode: 'unknown' };
  }
}

/** Count how many option trades the user currently has open. */
async function countOpenTrades(userId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from('option_paper_trades')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'open');
  return count ?? 0;
}

/** Return set of underlying symbols the user already has open options trades on. */
async function getOpenTradeSymbols(userId: string): Promise<Set<string>> {
  const { data } = await supabaseAdmin
    .from('option_paper_trades')
    .select('symbol')
    .eq('user_id', userId)
    .eq('status', 'open');
  return new Set((data ?? []).map((r: { symbol: string }) => r.symbol.toUpperCase()));
}

/** Get broker account options_buying_power from last synced row. */
async function getOptionsBuyingPower(userId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from('broker_accounts')
    .select('options_buying_power')
    .eq('user_id', userId)
    .order('last_synced_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return Number(data?.options_buying_power ?? 0);
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
  const { opportunities: allOpportunities, dataMode } = await fetchOpportunities(origin);

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
  const userResults: Array<{ userId: string; placed: number; skippedReason?: string }> = [];

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

      // ── Pre-check 3: slot capacity ───────────────────────────────────────
      const openCount = await countOpenTrades(userId);
      const maxOpen: number = prefs.max_open_positions ?? 5;
      const slotsAvailable = Math.max(0, maxOpen - openCount);

      if (slotsAvailable === 0) {
        totalSkippedUsers++;
        userResults.push({ userId, placed: 0, skippedReason: 'no open slots' });
        continue;
      }

      // ── Pre-check 4: buying power ─────────────────────────────────────────
      const buyingPower = await getOptionsBuyingPower(userId);
      const maxLoss: number = prefs.max_loss_per_trade ?? 300;
      if (buyingPower > 0 && buyingPower < maxLoss) {
        totalSkippedUsers++;
        userResults.push({ userId, placed: 0, skippedReason: 'insufficient options buying power' });
        continue;
      }

      // Load symbols already being held — prevent double-entering the same ticker
      const openSymbols = await getOpenTradeSymbols(userId);

      // ── Filter opportunities for this user ───────────────────────────────
      const minScore: number = prefs.min_score_threshold ?? 35;
      const autoMax: number = Math.min(prefs.auto_entry_max_positions ?? 3, slotsAvailable);
      const now = new Date();

      const eligible = allOpportunities
        .filter((o) => {
          if (o.score.finalScore < minScore) return false;
          if (o.netDebit * 100 > maxLoss) return false;
          if (o.status !== 'active') return false;
          // Skip stale opportunities
          if (new Date(o.expiresAt) <= now) return false;
          // Skip symbols the user already holds
          if (openSymbols.has(o.symbol.toUpperCase())) return false;
          // Only veto when AI says Avoid AND is confident enough (>=65).
          // Below threshold treat as Watch so deterministic score decides.
          if (o.aiAction === 'Avoid' && (o.aiConfidence ?? 100) >= 65) return false;
          return true;
        })
        .sort((a, b) => b.score.finalScore - a.score.finalScore)
        .slice(0, autoMax);

      if (eligible.length === 0) {
        userResults.push({ userId, placed: 0, skippedReason: 'no eligible opportunities met score/cost threshold' });
        continue;
      }

      // ── Place trades ─────────────────────────────────────────────────────
      let placed = 0;
      // Track symbols entered this cycle to prevent same-ticker duplicates
      const placedSymbolsThisCycle = new Set<string>();
      for (const opp of eligible) {
        if (placedSymbolsThisCycle.has(opp.symbol.toUpperCase())) continue;
        try {
          const result = await placeOptionsBrokerEntry({
            userId,
            symbol: opp.symbol,
            direction: opp.direction,
            strategy: opp.strategy,
            longOccSymbol: buildOccSymbol(opp.symbol, opp.longLeg.expiry, opp.longLeg.optionType, opp.longLeg.strike),
            shortOccSymbol: opp.shortLeg
              ? buildOccSymbol(opp.symbol, opp.shortLeg.expiry, opp.shortLeg.optionType, opp.shortLeg.strike)
              : null,
            longStrike: opp.longLeg.strike,
            longExpiry: opp.longLeg.expiry,
            shortStrike: opp.shortLeg?.strike ?? null,
            shortExpiry: opp.shortLeg?.expiry ?? null,
            optionType: opp.longLeg.optionType,
            netDebit: opp.netDebit,
            maxGain: opp.maxGain,
            maxLoss: opp.maxLoss,
            entryScore: opp.score.finalScore,
            entrySpotPrice: null,
            qtyContracts: 1,
            aiAction: opp.aiAction as 'Enter' | 'Watch' | 'Avoid' | undefined,
            aiReason: opp.aiReason,
            aiConfidence: opp.aiConfidence,
            aiRiskFlags: opp.aiRiskFlags,
            aiSource: 'auto_entry',
          });

          if (result.ok) {
            placed++;
            placedSymbolsThisCycle.add(opp.symbol.toUpperCase());
          } else {
            console.warn(`[options-auto-entry] user=${userId} opp=${opp.id} rejected: ${result.reason}`);
          }
        } catch (entryErr: any) {
          console.error(`[options-auto-entry] user=${userId} opp=${opp.id} entry error:`, entryErr?.message);
        }
      }

      totalPlaced += placed;
      userResults.push({ userId, placed });
    } catch (userErr: any) {
      console.error(`[options-auto-entry] unhandled error for user=${userId}:`, userErr?.message);
      totalSkippedUsers++;
      userResults.push({ userId, placed: 0, skippedReason: `error: ${userErr?.message}` });
    }
  }

  console.info(
    `[options-auto-entry] done users=${users.length} placed=${totalPlaced} skippedUsers=${totalSkippedUsers}`,
  );

  return NextResponse.json({
    success: true,
    usersProcessed: users.length,
    tradesPlaced: totalPlaced,
    skippedUsers: totalSkippedUsers,
    details: userResults,
  });
}
