import { supabaseAdmin } from "@/app/lib/supabaseAdmin";
import { getUserBrokerCredentials } from "@/app/lib/broker/getUserBrokerCredentials";
import { placeAlpacaOrder } from "@/app/lib/broker/alpaca";
import { syncAlpacaForUser } from "@/app/lib/broker/syncAlpacaForUser";
import { reconcileFilledOrders } from "@/app/lib/broker/reconcileFilledOrders";

function makeClientOrderId(userId: string, autoStockId: string, symbol: string, side: string) {
  return `luckmi-${userId.slice(0, 8)}-${autoStockId.slice(0, 8)}-${symbol}-${side}-${Date.now()}`;
}

export async function placeAutoBrokerOrder({
  userId,
  autoStockId,
  symbol,
  side,
  qty,
  appTradeType,
  appTradeLabel,
  tradeIntent,
}: {
  userId: string;
  autoStockId: string;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  appTradeType?: string;
  appTradeLabel?: string;
  tradeIntent?: Record<string, any>;
}) {
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error("Invalid order quantity");
  }

  const credentials = await getUserBrokerCredentials(userId);
  const clientOrderId = makeClientOrderId(userId, autoStockId, symbol, side);

  const order = await placeAlpacaOrder({
    credentials,
    symbol,
    side,
    qty,
    type: "market",
    timeInForce: "day",
    clientOrderId,
  });

  await supabaseAdmin.from("broker_orders").insert({
    user_id: userId,
    auto_stock_id: autoStockId,
    broker: "alpaca",
    broker_order_id: order.id,
    client_order_id: order.client_order_id,
    symbol: order.symbol,
    side: order.side,
    qty: order.qty,
    order_type: order.order_type || order.type,
    time_in_force: order.time_in_force,
    status: order.status,
    submitted_at: order.submitted_at,
    filled_at: order.filled_at,
    filled_qty: order.filled_qty,
    filled_avg_price: order.filled_avg_price,
    raw_order: {
      ...order,
      trade_intent: tradeIntent ?? null,
    },
  });

  await syncAlpacaForUser(userId);
  await reconcileFilledOrders(userId);

  return order;
}