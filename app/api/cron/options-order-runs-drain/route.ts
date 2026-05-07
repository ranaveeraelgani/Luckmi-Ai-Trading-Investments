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

const START_LOG_TIMEOUT_MS = 2500;
const MARKET_CHECK_TIMEOUT_MS = 7000;
const EXITS_TIMEOUT_MS = 22000;
const FILLS_TIMEOUT_MS = 22000;
const FINISH_LOG_TIMEOUT_MS = 2500;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

function fireAndForgetFinish(
  runId: string | null,
  payload: Omit<Parameters<typeof finishCronRun>[0], 'runId'>,
) {
  if (!runId) return;
  void withTimeout(finishCronRun({ ...payload, runId }), FINISH_LOG_TIMEOUT_MS, 'finishCronRun')
    .catch((err) => {
      console.warn(`[options-order-runs-drain] finish log skipped: ${err?.message ?? err}`);
    });
}

export async function POST(req: Request) {
  const started = Date.now();
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.ENGINE_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const marketOpen = await withTimeout(
    isMarketOpenNowLive(),
    MARKET_CHECK_TIMEOUT_MS,
    'isMarketOpenNowLive',
  ).catch((err) => {
    console.warn(`[options-order-runs-drain] market-check fallback: ${err?.message ?? err}`);
    return false;
  });

  if (!marketOpen) {
    return NextResponse.json({ skipped: true, reason: 'Market closed' });
  }

  try {
    const runId = await withTimeout(
      startCronRun({ jobName: 'options-order-runs-drain' }),
      START_LOG_TIMEOUT_MS,
      'startCronRun',
    ).catch((err) => {
      console.warn(`[options-order-runs-drain] start log skipped: ${err?.message ?? err}`);
      return null;
    });

    const [exitsResult, fillsResult] = await Promise.allSettled([
      withTimeout(submitPendingOptionExits(10), EXITS_TIMEOUT_MS, 'submitPendingOptionExits'),
      withTimeout(reconcileOptionBrokerFills(20), FILLS_TIMEOUT_MS, 'reconcileOptionBrokerFills'),
    ]);

    const exits = exitsResult.status === 'fulfilled'
      ? exitsResult.value
      : { processed: 0, submitted: 0, skipped: 0, failed: 0 };
    const fills = fillsResult.status === 'fulfilled'
      ? fillsResult.value
      : { processed: 0, filled: 0, stillOpen: 0, skipped: 0 };
    const partialErrors: string[] = [];

    if (exitsResult.status === 'rejected') {
      partialErrors.push(exitsResult.reason?.message ?? String(exitsResult.reason));
    }
    if (fillsResult.status === 'rejected') {
      partialErrors.push(fillsResult.reason?.message ?? String(fillsResult.reason));
    }

    const durationMs = Date.now() - started;

    fireAndForgetFinish(runId, {
      status: partialErrors.length > 0 ? 'failed' : 'success',
      errorMessage: partialErrors.length > 0 ? partialErrors.join(' | ').slice(0, 1000) : null,
      startedAt: started,
      result: { exits, fills, durationMs, partialErrors },
    });

    console.info(
      `[options-order-runs-drain] done in ${durationMs}ms ` +
      `exits: submitted=${exits.submitted} skipped=${exits.skipped} failed=${exits.failed} ` +
      `fills: filled=${fills.filled} stillOpen=${fills.stillOpen}`,
    );

    if (partialErrors.length > 0) {
      return NextResponse.json({ success: false, exits, fills, durationMs, partialErrors }, { status: 500 });
    }

    return NextResponse.json({ success: true, exits, fills, durationMs });
  } catch (err: any) {
    const message = err?.message ?? 'Drain failed';
    console.error('[options-order-runs-drain] fatal error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
