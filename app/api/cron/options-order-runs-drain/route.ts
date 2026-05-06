/**
 * @swagger
 * /api/cron/options-order-runs-drain:
 *   post:
 *     summary: Options broker order drain — submit exits + reconcile fills
 *     description: |
 *       1. Submits pending option exit orders to Alpaca (from option_order_runs).
 *       2. Reconciles Alpaca fill status back into option_trade_orders and closes
 *          option_paper_trades when exit fills are confirmed.
 *     tags: [Cron]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Drain complete
 *       401:
 *         description: Unauthorized
 *
 * Trigger: every 1-2 minutes during market hours after options-jobs-drain.
 * Use the same ENGINE_SECRET bearer token.
 */

import { NextResponse } from 'next/server';
import { isMarketOpenNowLive } from '@/app/lib/market/isMarketOpenNow';
import { submitPendingOptionExits } from '@/app/lib/options/submitOptionBrokerExits';
import { reconcileOptionBrokerFills } from '@/app/lib/options/reconcileOptionBrokerFills';
import { startCronRun, finishCronRun } from '@/app/lib/cron/logCronRun';

export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.ENGINE_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await isMarketOpenNowLive())) {
    return NextResponse.json({ skipped: true, reason: 'Market closed' });
  }

  const started = Date.now();

  try {
      const runId = await startCronRun({ jobName: 'options-order-runs-drain' });

    const [exits, fills] = await Promise.all([
      submitPendingOptionExits(10),
      reconcileOptionBrokerFills(20),
    ]);

    const durationMs = Date.now() - started;

    if (runId) {
      await finishCronRun({
        runId,
        status: 'success',
        startedAt: started,
        result: { exits, fills, durationMs },
      });
    }

    console.info(
      `[options-order-runs-drain] done in ${durationMs}ms ` +
      `exits: submitted=${exits.submitted} skipped=${exits.skipped} failed=${exits.failed} ` +
      `fills: filled=${fills.filled} stillOpen=${fills.stillOpen}`,
    );

    return NextResponse.json({ success: true, exits, fills, durationMs });
  } catch (err: any) {
    const message = err?.message ?? 'Drain failed';
    console.error('[options-order-runs-drain] fatal error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
