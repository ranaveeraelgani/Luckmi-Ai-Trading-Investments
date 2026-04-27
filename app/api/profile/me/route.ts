import { createClient } from '@/app/lib/supabaseServer';
import { supabaseAdmin } from '@/app/lib/supabaseAdmin';
import { getEntitlements, subscriptionsEnforced } from '@/app/lib/subscriptions/getEntitlements';

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const [{ data: profile }, subscription, { count: autoStocksCount }, { count: openPositionsCount }, { count: tradesCount }, { data: trades }, { data: lastRun }, { data: broker }] =
      await Promise.all([
        supabaseAdmin
          .from('profiles')
          .select('full_name, email, created_at, is_admin')
          .eq('user_id', user.id)
          .maybeSingle(),

        getEntitlements(user.id),

        supabaseAdmin
          .from('auto_stocks')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .in('status', ['idle', 'monitoring', 'in-position']),

        supabaseAdmin
          .from('positions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id),

        supabaseAdmin
          .from('trades')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id),

        supabaseAdmin
          .from('trades')
          .select('pnl')
          .eq('user_id', user.id),

        supabaseAdmin
          .from('engine_runs')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),

        supabaseAdmin
          .from('broker_keys')
          .select('broker, is_paper, connection_status, last_tested_at, last_error, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    const realizedPnL =
      (trades || []).reduce((sum: number, t: any) => sum + Number(t.pnl || 0), 0);

    return Response.json({
      profile: {
        fullName: profile?.full_name || '',
        email: profile?.email || user.email || '',
        createdAt: profile?.created_at || null,
        isAdmin: !!profile?.is_admin,
      },
      subscription: {
        ...subscription,
        enforced: subscriptionsEnforced(),
      },
      summary: {
        autoStocks: autoStocksCount || 0,
        openPositions: openPositionsCount || 0,
        totalTrades: tradesCount || 0,
        realizedPnL,
      },
      lastRun: lastRun
        ? {
            status: lastRun.status,
            createdAt: lastRun.created_at,
            tradesExecuted: lastRun.trades_executed,
            stocksProcessed: lastRun.stocks_processed,
          }
        : null,
      broker: broker
        ? {
            connected: true,
            broker: broker.broker,
            isPaper: broker.is_paper,
            connectionStatus: broker.connection_status,
            lastTestedAt: broker.last_tested_at,
            lastError: broker.last_error,
            createdAt: broker.created_at,
          }
        : {
            connected: false,
          },
    });
  } catch (err) {
    console.error('Profile fetch error:', err);
    return new Response('Failed to load profile', { status: 500 });
  }
}