import { supabaseAdmin } from '@/app/lib/supabaseAdmin';
import { getEntitlements, subscriptionsEnforced } from '@/app/lib/subscriptions/getEntitlements';
import { insertEngineRun } from '@/app/lib/db/engineRuns';
import { createClient } from '@/app/lib/supabaseServer';
export async function POST(req: Request) {
    try {
        const body = await req.json();

        const supabase = await createClient();
        const { data: { user }, } = await supabase.auth.getUser();
        if (!user) {
            return new Response("Unauthorized", { status: 401 });
        }

        const entitlements = await getEntitlements(user.id);

        const { data: brokerRow, error: brokerError } = await supabaseAdmin
            .from('broker_keys')
            .select('connection_status, last_tested_at')
            .eq('user_id', user.id)
            .eq('broker', 'alpaca')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (brokerError) {
            console.error("BROKER CHECK ERROR:", brokerError);
            return Response.json(
                { success: false, message: "Failed to validate broker connection." },
                { status: 500 }
            );
        }

        const brokerReady =
            brokerRow?.connection_status === 'connected' &&
            Boolean(brokerRow?.last_tested_at);

        if (!brokerReady) {
            return Response.json(
                {
                    success: false,
                    message: 'Connect Alpaca and run Test Connection before adding auto stocks.',
                },
                { status: 403 }
            );
        }

        const { count, error: countError } = await supabaseAdmin
            .from('auto_stocks')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .in('status', ['idle', 'monitoring', 'in-position']);

        if (countError) throw countError;

        if (subscriptionsEnforced() && (count || 0) >= entitlements.maxAutoStocks) {
            return Response.json(
                {
                    success: false,
                    message: `Plan limit reached. Your current plan allows ${entitlements.maxAutoStocks} auto stocks.`,
                    planCode: entitlements.planCode,
                    maxAutoStocks: entitlements.maxAutoStocks,
                },
                { status: 403 }
            );
        }
        const { error } = await supabaseAdmin
            .from('auto_stocks')
            .insert([
                {
                    ...body,
                    user_id: user.id,           // 🔥 REQUIRED
                    status: 'idle',           // default
                    created_at: new Date()
                }
            ]);

        if (error) {
            console.error("INSERT ERROR:", error);
            return new Response(JSON.stringify(error), { status: 500 });
        }

        return Response.json({ success: true });

    } catch (err) {
        console.error(err);
        return new Response("Server error", { status: 500 });
    }
}