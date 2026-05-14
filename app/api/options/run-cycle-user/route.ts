import { createClient } from '@/app/lib/supabaseServer';
import { isMarketOpenNowLive } from '@/app/lib/market/isMarketOpenNow';
import { supabaseAdmin } from '@/app/lib/supabaseAdmin';
import { getOptionPreferences } from '@/app/lib/db/optionPreferences';
import { getBrokerExecutionMode } from '@/app/lib/broker/getBrokerExecutionMode';
import { checkBrokerAccountCanTrade } from '@/app/lib/broker/checkBrokerAccountCanTrade';
import { executeOptionEntriesForUser } from '@/app/lib/options/executeOptionEntriesForUser';
import { fetchOpenTradeIdsForUser, runOptionsTradeJob } from '@/app/lib/options/optionsCycleRunner';
import { submitPendingOptionExits } from '@/app/lib/options/submitOptionBrokerExits';
import { reconcileOptionBrokerFills } from '@/app/lib/options/reconcileOptionBrokerFills';
import type { OptionsOpportunity } from '@/app/lib/options/types';

const MANUAL_ENTRY_MIN_SCORE_FLOOR = 55;

function getOrigin(req: Request): string {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost:3000';
  const proto = req.headers.get('x-forwarded-proto') ?? 'http';
  return `${proto}://${host}`;
}


// Enhanced: fetch opportunities with retry if cache is cold (skipped)
async function fetchOpportunitiesWithRetry(origin: string, maxRetries = 2, delayMs = 7000): Promise<OptionsOpportunity[]> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(`${origin}/api/options/opportunities?require_cached=1`, {
      headers: { 'x-internal-cron': 'true' },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    if (Array.isArray(data?.opportunities) && data.opportunities.length > 0) {
      return data.opportunities as OptionsOpportunity[];
    }
    // If cache is cold, wait and retry
    if (data?.skipped && data?.reason === 'no-cache-yet' && attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }
    // If empty for other reason, break
    break;
  }
  return [];
}

async function fetchAllTradeIdsForUser(userId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('option_paper_trades')
    .select('id')
    .eq('user_id', userId);

  if (error) {
    throw new Error(`fetchAllTradeIdsForUser: ${error.message}`);
  }

  return (data ?? []).map((row: any) => row.id as string);
}

async function fetchRecentExitRunDiagnostics(userId: string, tradeIds: string[]) {
  if (tradeIds.length === 0) {
    return { failedExitRuns: [], pendingExitRuns: [] };
  }

  const { data, error } = await supabaseAdmin
    .from('option_order_runs')
    .select('id, trade_id, status, error_message, created_at, updated_at, broker_order_id, reason')
    .eq('user_id', userId)
    .eq('action', 'close')
    .in('trade_id', tradeIds)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !data) {
    return { failedExitRuns: [], pendingExitRuns: [] };
  }

  const failedExitRuns = data
    .filter((r: any) => r.status === 'failed')
    .map((r: any) => ({
      runId: r.id,
      tradeId: r.trade_id,
      status: r.status,
      reason: r.reason ?? null,
      error: r.error_message ?? 'unknown error',
      createdAt: r.created_at ?? null,
      updatedAt: r.updated_at ?? null,
    }));

  const pendingExitRuns = data
    .filter((r: any) => r.status === 'pending_submission' || r.status === 'submitted')
    .map((r: any) => ({
      runId: r.id,
      tradeId: r.trade_id,
      status: r.status,
      reason: r.reason ?? null,
      brokerOrderId: r.broker_order_id ?? null,
      createdAt: r.created_at ?? null,
      updatedAt: r.updated_at ?? null,
    }));

  return { failedExitRuns, pendingExitRuns };
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  let allTradeIds: string[];
  try {
    allTradeIds = await fetchAllTradeIdsForUser(user.id);
  } catch (err: any) {
    return Response.json({ success: false, error: err?.message ?? 'Failed to fetch trade ids' }, { status: 500 });
  }

  let marketOpen: boolean;
  try {
    marketOpen = await isMarketOpenNowLive();
  } catch {
    marketOpen = false;
  }

  if (!marketOpen) {
    let fills: Awaited<ReturnType<typeof reconcileOptionBrokerFills>>;
    try {
      fills = await reconcileOptionBrokerFills(20, allTradeIds);
    } catch {
      fills = { filled: 0, processed: 0 } as any;
    }

    return Response.json(
      {
        success: false,
        message: 'Market is closed.',
        fills,
      },
      { status: 403 },
    );
  }

  let entriesAttempted = 0;
  let entriesPlaced = 0;
  let entriesRejectedNonExecutable = 0;
  let entrySkipReason: string | null = null;

  try {
    const brokerMode = await getBrokerExecutionMode(user.id);
    if (!brokerMode.enabled) {
      entrySkipReason = `broker: ${brokerMode.reason ?? 'disabled'}`;
    } else {
      const canTrade = await checkBrokerAccountCanTrade(user.id);
      if (!canTrade.allowed) {
        entrySkipReason = `account: ${canTrade.reason}`;
      } else {
        const prefs = await getOptionPreferences(user.id);
        // Use robust retry logic for cold cache
        const opportunities = await fetchOpportunitiesWithRetry(getOrigin(req), 2, 7000);
        if (opportunities.length === 0) {
          entrySkipReason = 'no opportunities available (after cache retry)';
        } else {
          const result = await executeOptionEntriesForUser({
            userId: user.id,
            opportunities,
            policy: {
              maxLossPerTrade: prefs.max_loss_per_trade ?? 300,
              maxOpenPositions: prefs.max_open_positions ?? 5,
              minScoreThreshold: prefs.min_score_threshold ?? 35,
              maxEntriesPerRun: prefs.auto_entry_max_positions ?? 3,
            },
            minScoreFloor: MANUAL_ENTRY_MIN_SCORE_FLOOR,
            aiSource: 'manual',
          });

          entriesAttempted = result.attempted;
          entriesPlaced = result.placed;
          entriesRejectedNonExecutable = result.nonExecutableRejected;
          entrySkipReason = result.skippedReason ?? null;
        }
      }
    }
  } catch (entryErr: any) {
    entrySkipReason = entryErr?.message ?? 'manual entry stage failed';
  }

  let openTradeIds: string[] = [];
  try {
    openTradeIds = await fetchOpenTradeIdsForUser(user.id);
  } catch (err: any) {
    return Response.json({ success: false, error: err?.message ?? 'Failed to fetch open trades' }, { status: 500 });
  }

  let closed = 0;
  let closeRequested = 0;
  let peakUpdated = 0;
  let priceUnavailable = 0;
  let skipped = 0;
  const tradeOutcomes: Array<{
    tradeId: string;
    action: 'closed' | 'close_requested' | 'peak_updated' | 'price_unavailable' | 'skipped';
    reason?: string;
    exitReason?: string;
    mode?: 'paper' | 'live';
  }> = [];

  for (const tradeId of openTradeIds) {
    try {
      const outcome = await runOptionsTradeJob(tradeId);
      tradeOutcomes.push({
        tradeId,
        action: outcome.action,
        reason: outcome.action === 'skipped' ? outcome.reason : undefined,
        exitReason:
          outcome.action === 'closed' || outcome.action === 'close_requested'
            ? outcome.exitReason
            : undefined,
        mode: outcome.action === 'close_requested' ? outcome.mode : undefined,
      });

      switch (outcome.action) {
        case 'closed':
          closed++;
          break;
        case 'close_requested':
          closeRequested++;
          break;
        case 'peak_updated':
          peakUpdated++;
          break;
        case 'price_unavailable':
          priceUnavailable++;
          break;
        case 'skipped':
          skipped++;
          break;
      }
    } catch (err: any) {
      skipped++;
      tradeOutcomes.push({
        tradeId,
        action: 'skipped',
        reason: err?.message ?? 'runOptionsTradeJob failed',
      });
    }
  }

  let exits: Awaited<ReturnType<typeof submitPendingOptionExits>>;
  let fills: Awaited<ReturnType<typeof reconcileOptionBrokerFills>>;

  try {
    exits = await submitPendingOptionExits(10, allTradeIds);
  } catch {
    exits = { submitted: 0, skipped: 0, failed: 0 } as any;
  }

  try {
    fills = await reconcileOptionBrokerFills(20, allTradeIds);
  } catch {
    fills = { filled: 0, processed: 0 } as any;
  }

  const exitDiagnostics = await fetchRecentExitRunDiagnostics(user.id, allTradeIds);

  return Response.json({
    success: true,
    processed: openTradeIds.length,
    closed,
    closeRequested,
    peakUpdated,
    priceUnavailable,
    skipped,
    entriesAttempted,
    entriesPlaced,
    entriesRejectedNonExecutable,
    entrySkipReason,
    exits,
    fills,
    tradeOutcomes,
    exitDiagnostics,
  });
}