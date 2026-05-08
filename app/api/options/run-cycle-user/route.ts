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

async function fetchOpportunities(origin: string): Promise<OptionsOpportunity[]> {
  const res = await fetch(`${origin}/api/options/opportunities`, {
    headers: { 'x-internal-cron': 'true' },
    cache: 'no-store',
  });

  if (!res.ok) return [];

  const data = await res.json().catch(() => ({}));
  return Array.isArray(data?.opportunities) ? (data.opportunities as OptionsOpportunity[]) : [];
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

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const allTradeIds = await fetchAllTradeIdsForUser(user.id);

  if (!(await isMarketOpenNowLive())) {
    const fills = await reconcileOptionBrokerFills(20, allTradeIds);

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
        const opportunities = await fetchOpportunities(getOrigin(req));
        if (opportunities.length === 0) {
          entrySkipReason = 'no opportunities available';
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

  const openTradeIds = await fetchOpenTradeIdsForUser(user.id);

  let closed = 0;
  let closeRequested = 0;
  let peakUpdated = 0;
  let priceUnavailable = 0;
  let skipped = 0;

  for (const tradeId of openTradeIds) {
    const outcome = await runOptionsTradeJob(tradeId);

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
  }

  const exits = await submitPendingOptionExits(10, allTradeIds);
  const fills = await reconcileOptionBrokerFills(20, allTradeIds);

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
  });
}