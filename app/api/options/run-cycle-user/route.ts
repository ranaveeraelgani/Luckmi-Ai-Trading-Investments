import { createClient } from '@/app/lib/supabaseServer';
import { isMarketOpenNowLive } from '@/app/lib/market/isMarketOpenNow';
import { fetchOpenTradeIdsForUser, runOptionsTradeJob } from '@/app/lib/options/optionsCycleRunner';
import { submitPendingOptionExits } from '@/app/lib/options/submitOptionBrokerExits';
import { reconcileOptionBrokerFills } from '@/app/lib/options/reconcileOptionBrokerFills';

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

export async function GET() {
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
    exits,
    fills,
  });
}