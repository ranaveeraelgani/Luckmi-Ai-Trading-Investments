import { supabaseAdmin } from '@/app/lib/supabaseAdmin';
import { runTradeCycleForUser } from '@/app/lib/engine/runTradeCycleForUser';
import { syncAlpacaForUser } from "@/app/lib/broker/syncAlpacaForUser";

const USER_CONCURRENCY = 3;

type TradeCycleUserResult = {
    userId: string;
    status: string;
    error?: string;
    success?: boolean;
    message?: string;
    updated?: boolean;
    processed?: number;
    tradesExecuted?: number;
    brokerMode?: boolean;
};

type TradeCycleBatchResult = {
    success: boolean;
    processedUsers: number;
    totalStocksProcessed: number;
    usersUpdated: number;
    results: TradeCycleUserResult[];
};

export async function getActiveTradeCycleUserIds() {
    const { data: activeStocks, error } = await supabaseAdmin
        .from('auto_stocks')
        .select('user_id')
        .in('status', ['idle', 'monitoring', 'in-position']);

    if (error) {
        throw error;
    }

    return [...new Set((activeStocks || []).map((row) => row?.user_id).filter(Boolean))];
}

async function getBrokerConnectedUserIds(userIds: string[]) {
    if (userIds.length === 0) {
        return new Set<string>();
    }

    const { data: brokerKeys, error } = await supabaseAdmin
        .from('broker_keys')
        .select('user_id, connection_status')
        .in('user_id', userIds)
        .eq('broker', 'alpaca');

    if (error) {
        throw error;
    }

    return new Set(
        (brokerKeys || [])
            .filter((row) => row?.user_id && row.connection_status === 'connected')
            .map((row) => row.user_id)
    );
}

export async function runTradeCycleForUserIds(userIds: string[]): Promise<TradeCycleBatchResult> {
    const batchStartedAt = Date.now();

    if (userIds.length === 0) {
        return {
            success: true,
            processedUsers: 0,
            totalStocksProcessed: 0,
            usersUpdated: 0,
            results: [] as TradeCycleUserResult[],
        };
    }

    let totalStocksProcessed = 0;
    let usersUpdated = 0;
    const results: TradeCycleUserResult[] = [];

    const brokerConnectedUserIds = await getBrokerConnectedUserIds(userIds);

    console.info(
        `[engine:all-users] start users=${userIds.length} brokerConnected=${brokerConnectedUserIds.size} elapsedMs=${Date.now() - batchStartedAt}`
    );

    async function processUser(userId: string) {
        try {
            const userStartedAt = Date.now();
            console.info(`[engine:user] start userId=${userId}`);

            if (brokerConnectedUserIds.has(userId)) {
                await syncAlpacaForUser(userId);
                console.info(
                    `[engine:user] sync complete userId=${userId} elapsedMs=${Date.now() - userStartedAt}`
                );
            } else {
                console.info(`[engine:user] sync skipped userId=${userId} reason=no-connected-broker`);
            }

            const result = await runTradeCycleForUser({
                userId,
                runType: 'cron',
                supabase: supabaseAdmin,
            });

            console.info(
                `[engine:user] run complete userId=${userId} elapsedMs=${Date.now() - userStartedAt} status=${result.status} processed=${result.processed} tradesExecuted=${result.tradesExecuted}`
            );

            totalStocksProcessed += result.processed;
            if (result.updated) usersUpdated += 1;

            results.push({
                userId,
                ...result,
            });
        }
         catch (error) {
            console.error(
                `[engine:user] failed userId=${userId} elapsedMs=${Date.now() - batchStartedAt} message=${error instanceof Error ? error.message : String(error)}`
            );

            results.push({
                userId,
                status: 'failed',
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    let nextUserIndex = 0;

    async function worker() {
        while (nextUserIndex < userIds.length) {
            const userId = userIds[nextUserIndex];
            nextUserIndex += 1;
            await processUser(userId);
        }
    }

    await Promise.all(
        Array.from({ length: Math.min(USER_CONCURRENCY, userIds.length) }, () => worker())
    );

    console.info(
        `[engine:all-users] complete elapsedMs=${Date.now() - batchStartedAt} processedUsers=${userIds.length} usersUpdated=${usersUpdated} totalStocksProcessed=${totalStocksProcessed}`
    );

    return {
        success: true,
        processedUsers: userIds.length,
        totalStocksProcessed,
        usersUpdated,
        results,
    };
}

export async function runTradeCycleForAllUsers() {
    const userIds = await getActiveTradeCycleUserIds();
    return runTradeCycleForUserIds(userIds);
}