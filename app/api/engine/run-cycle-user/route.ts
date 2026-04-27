import { createClient } from '@/app/lib/supabaseServer';
import { runTradeCycleForUser } from '@/app/lib/engine/runTradeCycleForUser';
import { isMarketOpenNow } from "@/app/lib/market/isMarketOpenNow";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }
   if (!isMarketOpenNow()) {
    return new Response('Market is closed', { status: 403 });
  }
  console.log('Running trade cycle for user:', user.id);
  const result = await runTradeCycleForUser({
    userId: user.id,
    runType: 'manual',
    supabase,
  });

  if (result.status === 'blocked') {
    const statusCode =
      result.message === 'Manual run cooldown active'
        ? 429
        : result.message === 'Engine is paused by admin.' ||
          result.message === 'Manual trade cycle is not available on your current plan.'
        ? 403
        : 200;

    return Response.json(
      {
        success: result.success,
        message: result.message,
        updated: result.updated,
        processed: result.processed,
        tradesExecuted: result.tradesExecuted,
      },
      { status: statusCode }
    );
  }

  if (result.status === 'failed') {
    return Response.json(
      {
        success: false,
        message: result.message || 'Engine run failed',
      },
      { status: 500 }
    );
  }

  return Response.json({
    success: true,
    updated: result.updated,
    processed: result.processed,
    tradesExecuted: result.tradesExecuted,
  });
}