import { runTradingEngine } from '@/app/lib/engine/runTradingEngine';
import { createClient } from '@/app/lib/supabaseServer';
import { upsertPosition, deletePosition } from '@/app/lib/db/positions';
import { insertAiDecision } from '@/app/lib/db/aiDecisions';
import { getEntitlements, subscriptionsEnforced } from '@/app/lib/subscriptions/getEntitlements';
import { insertEngineRun } from '@/app/lib/db/engineRuns';
import { supabaseAdmin } from '@/app/lib/supabaseAdmin';
export async function GET() {

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();
    console.log('Running cycle for user:', user?.id);
    if (!user) {
        return new Response("Unauthorized", { status: 401 });
    }
    try {
        const entitlements = await getEntitlements(user.id);
        const { data: sub } = await supabaseAdmin
            .from('subscriptions')
            .select('engine_paused')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (sub?.engine_paused) {
            await insertEngineRun({
                userId: user.id,
                runType: 'manual',
                status: 'blocked',
                blockedReason: 'Engine paused by admin',
            });

            return Response.json(
                { success: false, message: 'Engine is paused by admin.' },
                { status: 403 }
            );
        }
        if (subscriptionsEnforced() && !entitlements.allowManualCycle) {
            await insertEngineRun({
                userId: user.id,
                runType: 'manual',
                status: 'blocked',
                blockedReason: 'Manual cycle not allowed for current plan',
            });

            return Response.json(
                {
                    success: false,
                    message: 'Manual trade cycle is not available on your current plan.',
                    planCode: entitlements.planCode,
                },
                { status: 403 }
            );
        }
        
        const manualRunBlocked = false; // replace later with real logic
        if (manualRunBlocked) {
            await insertEngineRun({
                userId: user.id,
                runType: 'manual',
                status: 'blocked',
                blockedReason: 'Manual run cooldown active',
                stocksProcessed: 0,
                tradesExecuted: 0,
            });

            return Response.json({
                success: false,
                message: 'Manual run cooldown active',
            }, { status: 429 });
        }
        const { data: stocks } = await supabase
            .from('auto_stocks')
            .select('*')
            .eq('user_id', user.id)
            .in('status', ['idle', 'monitoring', 'in-position']);
        if (!stocks || stocks.length === 0) {
            await insertEngineRun({
                userId: user.id,
                runType: 'manual',
                status: 'blocked',
                blockedReason: 'No stocks to process',
            });

            return Response.json({ success: true, message: 'No stocks to process' });
        }

        // =========================
        // 2. FETCH QUOTES
        // =========================
        const symbols = stocks.map((s) => s.symbol).join(',');
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        const res = await fetch(`${baseUrl}/api/quotes?symbols=${symbols}`);

        if (!res.ok) {
            console.error(`Quotes failed for ${user.id}`);
            return Response.json({ success: false, message: 'Failed to fetch quotes' });
        }

        const quotesArr = await res.json();

        const quotes: Record<string, any> = {};
        quotesArr.forEach((q: any) => {
            if (q?.symbol) {
                quotes[q.symbol] = {
                    price: Number(q.price) || 0,
                    change: Number(q.change) || 0,
                    percentChange: Number(q.percentChange) || 0,
                };
            }
        });
        // 3. RUN ENGINE
        const { updatedStocks, trades, hasChanges } = await runTradingEngine(stocks, quotes);
        // 4. SAVE
        if (hasChanges) {
            for (const stock of updatedStocks) {
                await supabase
                    .from('auto_stocks')
                    .update({
                        allocation: stock.allocation,
                        status: stock.status,
                        current_position: stock.currentPosition,
                        last_ai_decision: stock.lastAiDecision,
                        last_sell_time: stock.lastSellTime,
                        last_evaluated_price: stock.lastEvaluatedPrice,
                    })
                    .eq('id', stock.id);

                // 5. POSITION SYNC
                await supabase
                    .from('auto_stocks')
                    .update({
                        allocation: stock.allocation,
                        status: stock.status,
                        current_position: stock.currentPosition,
                        last_ai_decision: stock.lastAiDecision,
                        last_sell_time: stock.lastSellTime,
                        last_evaluated_price: stock.lastEvaluatedPrice,
                    })
                    .eq('id', stock.id);

                // 5. POSITION SYNC
                if (stock.currentPosition) {
                    await upsertPosition(supabase, stock);
                } else {
                    await deletePosition(supabase, stock.id);
                }

                // 6. AI DECISION LOG
                if (stock.lastAiDecision && stock.lastAiDecision.action !== 'Hold') {
                    await insertAiDecision(supabase, stock, stock.lastAiDecision);
                }
            }

            // 7. SAVE TRADES
            if (trades.length > 0) {
                await supabase.from('trades').insert(
                    trades.map((t) => ({
                        ...t,
                        user_id: user.id,
                    }))
                );
            }
            await insertEngineRun({
                userId: user.id,
                runType: 'manual',
                stocksProcessed: updatedStocks.length,
                tradesExecuted: trades.length,
                status: 'success',
            });
        }
        return Response.json({
            success: true, updated: hasChanges, processed: updatedStocks.length,
        });
    } catch (error) {
        console.error('Engine run failed:', error);
        await insertEngineRun({
            userId: user?.id || 'unknown',
            runType: 'manual',
            stocksProcessed: 0,
            tradesExecuted: 0,
            status: 'error',
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
        return Response.json({ success: false, message: 'Engine run failed' }, { status: 500 });
    }
}