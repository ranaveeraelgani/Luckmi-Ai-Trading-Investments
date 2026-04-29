import { supabaseAdmin } from "@/app/lib/supabaseAdmin";
import { createNotificationService } from '@/app/lib/notifications/service';

function n(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function isFilled(order: any) {
  return (
    order.status === "filled" &&
    n(order.filled_qty) > 0 &&
    n(order.filled_avg_price) > 0
  );
}

export async function reconcileFilledOrders(userId: string) {
  const notificationService = createNotificationService();

  const { data: orders, error } = await supabaseAdmin
    .from("broker_orders")
    .select(`
      id,
      user_id,
      auto_stock_id,
      broker_order_id,
      client_order_id,
      symbol,
      side,
      qty,
      status,
      filled_qty,
      filled_avg_price,
      filled_at,
      raw_order
    `)
    .eq("user_id", userId)
    .eq("status", "filled")
    .is("reconciled_at", null);

  if (error) {
    throw new Error(`Failed to load broker orders: ${error.message}`);
  }

  const filledOrders = (orders || []).filter(isFilled);

  for (const order of filledOrders) {
    const brokerOrderId = order.broker_order_id;

    if (!brokerOrderId) continue;

    const { data: existingTrade } = await supabaseAdmin
      .from("trades")
      .select("id")
      .eq("user_id", userId)
      .eq("broker_order_id", brokerOrderId)
      .maybeSingle();

    if (existingTrade) continue;

    const shares = n(order.filled_qty);
    const price = n(order.filled_avg_price);
    const amount = shares * price;

    let pnl: number | null = null;

    if (order.side === "sell" && order.auto_stock_id) {
      const { data: existingPosition } = await supabaseAdmin
        .from("positions")
        .select("entry_price, shares")
        .eq("user_id", userId)
        .eq("auto_stock_id", order.auto_stock_id)
        .maybeSingle();

      if (existingPosition) {
        pnl = shares * (price - n(existingPosition.entry_price));
      }
    }

    const { error: tradeError } = await supabaseAdmin.from("trades").insert({
      user_id: userId,
      auto_stock_id: order.auto_stock_id,
      broker_order_id: brokerOrderId,
      symbol: order.symbol,
      type: order.side === "buy" ? "buy" : "sell",
      shares,
      price,
      amount,
      pnl,
      reason: "Broker-filled Alpaca order",
      confidence: null,
      cts_score: null,
      sell_score: null,
      created_at: order.filled_at || new Date().toISOString(),
    });

    if (tradeError) {
      console.error("Failed to insert reconciled trade:", tradeError);
      continue;
    }

    try {
      await notificationService.queueEvent({
        userId,
        type: 'trade_filled',
        title: `Trade filled: ${String(order.symbol || '').toUpperCase()}`,
        body: `${order.side === 'buy' ? 'Bought' : 'Sold'} ${shares} ${String(order.symbol || '').toUpperCase()} at $${price.toFixed(2)}.`,
        url: '/profile',
        idempotencyKey: `trade-filled:${brokerOrderId}`,
        metadata: {
          brokerOrderId,
          side: order.side,
          shares,
          price,
        },
      });
    } catch (notifyError) {
      console.warn('Failed to queue trade-filled notification:', notifyError);
    }

      if (order.auto_stock_id && order.side === "buy") {
          const { data: existingPosition } = await supabaseAdmin
              .from("positions")
              .select("entry_price, shares, peak_price, peak_pnl_percent")
              .eq("user_id", userId)
              .eq("auto_stock_id", order.auto_stock_id)
              .maybeSingle();

          const filledShares = n(order.filled_qty);
          const filledPrice = n(order.filled_avg_price);

          if (existingPosition) {
              const oldShares = n(existingPosition.shares);
              const oldEntry = n(existingPosition.entry_price);

              const newShares = oldShares + filledShares;
              const weightedEntry =
                  newShares > 0
                      ? (oldShares * oldEntry + filledShares * filledPrice) / newShares
                      : filledPrice;

              await supabaseAdmin
                  .from("positions")
                  .update({
                      entry_price: weightedEntry,
                      shares: newShares,
                      peak_price: Math.max(n(existingPosition.peak_price), filledPrice),
                      peak_pnl_percent: existingPosition.peak_pnl_percent ?? 0,
                      broker_order_id: brokerOrderId,
                      updated_at: new Date().toISOString(),
                  })
                  .eq("user_id", userId)
                  .eq("auto_stock_id", order.auto_stock_id);
          } else {
              await supabaseAdmin.from("positions").insert({
                  user_id: userId,
                  auto_stock_id: order.auto_stock_id,
                  broker_order_id: brokerOrderId,
                  entry_price: filledPrice,
                  shares: filledShares,
                  peak_price: filledPrice,
                  peak_pnl_percent: 0,
                  entry_time: order.filled_at || new Date().toISOString(),
                  updated_at: new Date().toISOString(),
              });
          }

          await supabaseAdmin
              .from("auto_stocks")
              .update({
                  status: "in-position",
                  last_evaluated_price: filledPrice,
              })
              .eq("id", order.auto_stock_id)
              .eq("user_id", userId);
      }

    if (order.auto_stock_id && order.side === "sell") {
        const { data: existingPosition } = await supabaseAdmin
            .from("positions")
            .select("shares, entry_price")
            .eq("user_id", userId)
            .eq("auto_stock_id", order.auto_stock_id)
            .maybeSingle();

        if (existingPosition) {
            const remainingShares =
                Number(existingPosition.shares) - Number(order.filled_qty);

            if (remainingShares <= 0) {
                // full exit
                await supabaseAdmin
                    .from("positions")
                    .delete()
                    .eq("user_id", userId)
                    .eq("auto_stock_id", order.auto_stock_id);

                await supabaseAdmin
                    .from("auto_stocks")
                    .update({
                        status: "monitoring",
                        last_sell_time: order.filled_at || new Date().toISOString(),
                    })
                    .eq("id", order.auto_stock_id);
            } else {
                // partial sell
                await supabaseAdmin
                    .from("positions")
                    .update({
                        type: remainingShares <= 0 ? "sell" : "partial_sell",
                        shares: remainingShares,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("user_id", userId)
                    .eq("auto_stock_id", order.auto_stock_id);
            }
        }

      await supabaseAdmin
        .from("auto_stocks")
        .update({
          status: "monitoring",
          last_sell_time: order.filled_at || new Date().toISOString(),
          last_evaluated_price: price,
        })
        .eq("id", order.auto_stock_id)
        .eq("user_id", userId);
    }

    await supabaseAdmin
      .from("ai_decisions")
      .update({
        broker_order_id: brokerOrderId,
      })
      .eq("user_id", userId)
      .eq("auto_stock_id", order.auto_stock_id)
      .is("broker_order_id", null);

      // Mark order as reconciled
      await supabaseAdmin
          .from("broker_orders")
          .update({
              reconciled_at: new Date().toISOString(),
          })
          .eq("id", order.id);
  }
  
  return {
    reconciled: filledOrders.length,
  };
}