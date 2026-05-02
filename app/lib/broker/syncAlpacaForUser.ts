import { supabaseAdmin } from "@/app/lib/supabaseAdmin";
import { getUserBrokerCredentials } from "@/app/lib/broker/getUserBrokerCredentials";
import { createNotificationService } from '@/app/lib/notifications/service';
import {
  getAlpacaAccount,
  getAlpacaOrders,
  getAlpacaPositions,
} from "@/app/lib/broker/alpaca";

function n(value: any) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export async function syncAlpacaForUser(userId: string) {
  const notificationService = createNotificationService();

  try {
    const credentials = await getUserBrokerCredentials(userId);

    const [account, positions, orders] = await Promise.all([
      getAlpacaAccount(credentials),
      getAlpacaPositions(credentials),
      getAlpacaOrders(credentials, "all"),
    ]);

  const now = new Date().toISOString();

  await supabaseAdmin.from("broker_accounts").upsert(
    {
      user_id: userId,
      broker: "alpaca",
      account_id: account.id,
      is_paper: credentials.isPaper,
      status: account.status,
      currency: account.currency,
      cash: n(account.cash),
      buying_power: n(account.buying_power),
      equity: n(account.equity),
      portfolio_value: n(account.portfolio_value),
      long_market_value: n(account.long_market_value),
      short_market_value: n(account.short_market_value),
      initial_margin: n(account.initial_margin),
      maintenance_margin: n(account.maintenance_margin),
      daytrade_count: Number(account.daytrade_count || 0),
      pattern_day_trader: Boolean(account.pattern_day_trader),
      trading_blocked: Boolean(account.trading_blocked),
      transfers_blocked: Boolean(account.transfers_blocked),
      account_blocked: Boolean(account.account_blocked),
      raw_account: account,
      last_synced_at: now,
      updated_at: now,
    },
    { onConflict: "user_id,broker,is_paper" }
  );

  const returnedSymbols = new Set<string>();

  for (const p of positions || []) {
    returnedSymbols.add(String(p.symbol).toUpperCase());

    await supabaseAdmin.from("broker_positions").upsert(
      {
        user_id: userId,
        broker: "alpaca",
        is_paper: credentials.isPaper,
        symbol: String(p.symbol).toUpperCase(),
        qty: n(p.qty),
        qty_available: n(p.qty_available),
        side: p.side,
        avg_entry_price: n(p.avg_entry_price),
        cost_basis: n(p.cost_basis),
        market_value: n(p.market_value),
        current_price: n(p.current_price),
        lastday_price: n(p.lastday_price),
        change_today: n(p.change_today),
        unrealized_pl: n(p.unrealized_pl),
        unrealized_plpc: n(p.unrealized_plpc),
        unrealized_intraday_pl: n(p.unrealized_intraday_pl),
        unrealized_intraday_plpc: n(p.unrealized_intraday_plpc),
        raw_position: p,
        last_synced_at: now,
        updated_at: now,
      },
      { onConflict: "user_id,broker,is_paper,symbol" }
    );
  }

  const { data: existingBrokerPositions } = await supabaseAdmin
    .from("broker_positions")
    .select("symbol")
    .eq("user_id", userId)
    .eq("broker", "alpaca")
    .eq("is_paper", credentials.isPaper);

  const staleSymbols =
    existingBrokerPositions
      ?.map((p) => p.symbol)
      .filter((symbol) => !returnedSymbols.has(String(symbol).toUpperCase())) || [];

  if (staleSymbols.length > 0) {
    await supabaseAdmin
      .from("broker_positions")
      .delete()
      .eq("user_id", userId)
      .eq("broker", "alpaca")
      .eq("is_paper", credentials.isPaper)
      .in("symbol", staleSymbols);
  }

  for (const order of orders || []) {
    const upsertPayload: Record<string, any> = {
      user_id: userId,
      broker: "alpaca",
      broker_order_id: order.id,
      client_order_id: order.client_order_id,
      symbol: order.symbol,
      side: order.side,
      qty: n(order.qty),
      order_type: order.order_type || order.type,
      time_in_force: order.time_in_force,
      status: order.status,
      submitted_at: order.submitted_at,
      filled_qty: n(order.filled_qty),
      filled_avg_price: n(order.filled_avg_price),
      raw_order: order,
      updated_at: now,
    };
    // Only include filled_at if Alpaca returned a value — never overwrite a real
    // fill timestamp with null (race condition between order placement and fill).
    if (order.filled_at != null) {
      upsertPayload.filled_at = order.filled_at;
    }
    await supabaseAdmin.from("broker_orders").upsert(upsertPayload, { onConflict: "client_order_id" });
  }

    return {
      account,
      positions,
      orders,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown broker sync error';

    try {
      await notificationService.queueEvent({
        userId,
        type: 'broker_sync_failed',
        title: 'Broker sync failed',
        body: `Alpaca sync failed: ${message}`,
        url: '/profile',
        idempotencyKey: `broker-sync-failed:${userId}:${new Date().toISOString().slice(0, 16)}`,
        metadata: {
          message,
        },
      });
    } catch (notifyError) {
      console.warn('Failed to queue broker-sync-failed notification:', notifyError);
    }

    throw error;
  }
}