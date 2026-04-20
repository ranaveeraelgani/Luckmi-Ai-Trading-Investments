import { runTradingEngine } from '@/app/lib/engine/runTradingEngine';
import { createClient } from '@supabase/supabase-js';
import { upsertPosition, deletePosition } from '@/app/lib/db/positions';
import { insertAiDecision } from '@/app/lib/db/aiDecisions';
import { insertEngineRun } from '@/app/lib/db/engineRuns';
import { getEntitlements, subscriptionsEnforced } from '@/app/lib/subscriptions/getEntitlements';
import { supabaseAdmin } from '@/app/lib/supabaseAdmin';
// 🔐 Server-side Supabase client (use SERVICE ROLE for backend)
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
    try {
        const { data: users, error: usersError } = await supabase
            .from('profiles')
            .select('user_id');

        if (usersError) throw usersError;

        if (!users || users.length === 0) {
            return Response.json({ success: true, message: 'No users found' });
        }

        const baseUrl =
            process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

        let totalProcessed = 0;
        let totalUpdated = 0;

        for (const user of users) {
            try {
                if (!user?.user_id) continue;
                const entitlements = await getEntitlements(user.user_id);
                const { data: sub } = await supabaseAdmin
                    .from('subscriptions')
                    .select('engine_paused')
                    .eq('user_id', user.user_id)
                    .eq('status', 'active')
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (sub?.engine_paused) {
                    await insertEngineRun({
                        userId: user.user_id,
                        runType: 'cron',
                        status: 'blocked',
                        blockedReason: 'Engine paused by admin',
                    });
                    continue;
                }
                if (subscriptionsEnforced() && (!entitlements.allowCronAutomation || entitlements.engine_paused)) {
                    await insertEngineRun({
                        userId: user.user_id,
                        runType: 'cron',
                        status: 'blocked',
                        blockedReason: 'Cron automation not allowed for current plan',
                    });
                    continue;
                }
                // =========================
                // 1. LOAD USER STOCKS
                // =========================
                const { data: stocks, error } = await supabase
                    .from('auto_stocks')
                    .select('*')
                    .eq('user_id', user.user_id)
                    .in('status', ['idle', 'monitoring', 'in-position']);
                if (error) {
                    console.error(`Error loading stocks for ${user.user_id}`, error);
                    continue; // 🔥 skip user, don't kill loop
                }

                if (!stocks || stocks.length === 0) {
                    await insertEngineRun({
                        userId: user.user_id,
                        runType: 'cron',
                        status: 'blocked',
                        blockedReason: 'No stocks to process',
                    });
                    continue; // 🔥 skip user
                }

                // =========================
                // 2. FETCH QUOTES
                // =========================
                const symbols = stocks.map((s) => s.symbol).join(',');

                const res = await fetch(`${baseUrl}/api/quotes?symbols=${symbols}`);

                if (!res.ok) {
                    console.error(`Quotes failed for ${user.user_id}`);
                    continue;
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

                // =========================
                // 3. RUN ENGINE
                // =========================
                const { updatedStocks, trades, hasChanges } =
                    await runTradingEngine(stocks, quotes);

                totalProcessed += updatedStocks.length;

                // =========================
                // 4. SAVE
                // =========================
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

                        // 🔥 POSITION SYNC
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
                                user_id: user.user_id, // ✅ FIXED
                            }))
                        );
                    }

                    totalUpdated++;
                }
                await insertEngineRun({
                    userId: user.user_id,
                    runType: 'cron',
                    status: 'success',
                    stocksProcessed: updatedStocks.length,
                    tradesExecuted: trades.length,
                });
            } catch (err) {
                await insertEngineRun({
                    userId: user.user_id,
                    runType: 'cron',
                    status: 'failed',
                    errorMessage: err instanceof Error ? err.message : 'Unknown error',
                });
                continue;
            }
        }

        return Response.json({
            success: true,
            processedUsers: users.length,
            totalStocksProcessed: totalProcessed,
            usersUpdated: totalUpdated,
        });        
    } catch (err) {
        console.error('Engine error:', err);
        return new Response('Error running engine', { status: 500 });
    }
}