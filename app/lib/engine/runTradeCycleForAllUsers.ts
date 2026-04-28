import { supabaseAdmin } from '@/app/lib/supabaseAdmin';
import { runTradeCycleForUser } from '@/app/lib/engine/runTradeCycleForUser';
import { syncAlpacaForUser } from "@/app/lib/broker/syncAlpacaForUser";
import { reconcileFilledOrders } from '../broker/reconcileFilledOrders';

export async function runTradeCycleForAllUsers() {
    const batchStartedAt = Date.now();
    const { data: users, error } = await supabaseAdmin
        .from('profiles')
        .select('user_id');

    if (error) {
        throw error;
    }

    if (!users || users.length === 0) {
        return {
            success: true,
            processedUsers: 0,
            totalStocksProcessed: 0,
            usersUpdated: 0,
            results: [],
        };
    }

    let totalStocksProcessed = 0;
    let usersUpdated = 0;
    const results = [];

    console.info(
        `[engine:all-users] start users=${users.length} elapsedMs=${Date.now() - batchStartedAt}`
    );

    for (const user of users) {
        if (!user?.user_id) continue;
        try {
            const userStartedAt = Date.now();
            console.info(`[engine:user] start userId=${user.user_id}`);

             // 1. Sync before engine so positions/orders are fresh
            await syncAlpacaForUser(user.user_id);
            console.info(
                `[engine:user] sync complete userId=${user.user_id} elapsedMs=${Date.now() - userStartedAt}`
            );

            await reconcileFilledOrders(user.user_id);
            console.info(
                `[engine:user] reconcile complete userId=${user.user_id} elapsedMs=${Date.now() - userStartedAt}`
            );

            // 2. Run engine
            const result = await runTradeCycleForUser({
                userId: user.user_id,
                runType: 'cron',
                supabase: supabaseAdmin,
            });

            console.info(
                `[engine:user] run complete userId=${user.user_id} elapsedMs=${Date.now() - userStartedAt} status=${result.status} processed=${result.processed} tradesExecuted=${result.tradesExecuted}`
            );

            totalStocksProcessed += result.processed;
            if (result.updated) usersUpdated += 1;

            results.push({
                userId: user.user_id,
                ...result,
            });
        }
         catch (error) {
            console.error(
                `[engine:user] failed userId=${user.user_id} elapsedMs=${Date.now() - batchStartedAt} message=${error instanceof Error ? error.message : String(error)}`
            );

            results.push({
                userId: user.user_id,
                status: 'failed',
                error: error instanceof Error ? error.message : String(error),
            });
        }         
    }

    console.info(
        `[engine:all-users] complete elapsedMs=${Date.now() - batchStartedAt} processedUsers=${users.length} usersUpdated=${usersUpdated} totalStocksProcessed=${totalStocksProcessed}`
    );

    return {
        success: true,
        processedUsers: users.length,
        totalStocksProcessed,
        usersUpdated,
        results,
    };
}