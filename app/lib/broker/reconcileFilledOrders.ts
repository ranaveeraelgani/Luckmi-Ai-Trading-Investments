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

async function repairOpenPositionsFromBroker(userId: string) {
  const { data: brokerPositions, error: brokerPositionsError } = await supabaseAdmin
    .from("broker_positions")
    .select(`
      id,
      symbol,
      qty,
      avg_entry_price,
      cost_basis,
      current_price,
      unrealized_pl
    `)
    .eq("user_id", userId)
    .eq("broker", "alpaca");

  if (brokerPositionsError) {
    throw new Error(`Failed to load broker positions: ${brokerPositionsError.message}`);
  }

  const openBrokerPositions = (brokerPositions || []).filter(
    (position) => n(position.qty) > 0 && n(position.avg_entry_price) > 0 && String(position.symbol || "").trim()
  );

  if (openBrokerPositions.length === 0) return;

  const symbols = [...new Set(openBrokerPositions.map((position) => String(position.symbol).toUpperCase()))];

  const { data: autoStocks, error: autoStocksError } = await supabaseAdmin
    .from("auto_stocks")
    .select("id, symbol")
    .eq("user_id", userId)
    .in("symbol", symbols);

  if (autoStocksError) {
    throw new Error(`Failed to load auto stocks for repair: ${autoStocksError.message}`);
  }

  const autoStockBySymbol = new Map(
    (autoStocks || []).map((stock) => [String(stock.symbol).toUpperCase(), stock])
  );

  for (const brokerPosition of openBrokerPositions) {
    const symbol = String(brokerPosition.symbol || "").toUpperCase();
    const autoStock = autoStockBySymbol.get(symbol);

    if (!autoStock?.id) continue;

    const { data: existingPosition } = await supabaseAdmin
      .from("positions")
      .select("entry_time, peak_price, peak_pnl_percent")
      .eq("user_id", userId)
      .eq("auto_stock_id", autoStock.id)
      .maybeSingle();

    const shares = n(brokerPosition.qty);
    const entryPrice = n(brokerPosition.avg_entry_price);
    const currentPrice = n(brokerPosition.current_price, entryPrice);
    const entryValue = n(brokerPosition.cost_basis, shares * entryPrice);
    const pnl = n(brokerPosition.unrealized_pl, shares * (currentPrice - entryPrice));

    const { error: positionUpsertError } = await supabaseAdmin
      .from("positions")
      .upsert(
        {
          user_id: userId,
          auto_stock_id: autoStock.id,
          symbol,
          status: "in-position",
          entry_price: entryPrice,
          shares,
          peak_price: Math.max(n(existingPosition?.peak_price), currentPrice, entryPrice),
          peak_pnl_percent: existingPosition?.peak_pnl_percent ?? 0,
          entry_time: existingPosition?.entry_time || new Date().toISOString(),
          updated_at: new Date().toISOString(),
          pnl,
          entry_value: entryValue,
          closed_at: null,
          broker_position_id: brokerPosition.id,
        },
        {
          onConflict: "auto_stock_id",
        }
      );

    if (positionUpsertError) {
      console.error("Failed to repair position from broker position:", positionUpsertError);
      continue;
    }

    await supabaseAdmin
      .from("auto_stocks")
      .update({
        status: "in-position",
        last_evaluated_price: currentPrice,
      })
      .eq("id", autoStock.id)
      .eq("user_id", userId);
  }
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

    const shares = n(order.filled_qty);
    const price = n(order.filled_avg_price);

    if (!existingTrade) {
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

      // Look up the most recent AI decision for this stock to get the real reason
      let aiReason: string | null = null;
      let aiConfidence: number | null = null;
      let aiCtsScore: number | null = null;
      let aiSellScore: number | null = null;

      if (order.auto_stock_id) {
        const actionFilter = order.side === "buy"
          ? ["Buy", "Buy More"]
          : ["Sell", "Partial Sell"];

        const { data: latestDecision } = await supabaseAdmin
          .from("ai_decisions")
          .select("reason, confidence, cts_score, sell_score")
          .eq("user_id", userId)
          .eq("auto_stock_id", order.auto_stock_id)
          .in("action", actionFilter)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestDecision) {
          aiReason = latestDecision.reason || null;
          aiConfidence = latestDecision.confidence != null ? n(latestDecision.confidence) : null;
          aiCtsScore = latestDecision.cts_score != null ? n(latestDecision.cts_score) : null;
          aiSellScore = latestDecision.sell_score != null ? n(latestDecision.sell_score) : null;
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
        reason: aiReason || "Broker-filled Alpaca order",
        confidence: aiConfidence,
        cts_score: aiCtsScore,
        sell_score: aiSellScore,
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
    }

    let positionWriteFailed = false;

    if (order.auto_stock_id && order.side === "buy") {
      const { data: existingPosition } = await supabaseAdmin
        .from("positions")
        .select("entry_price, shares, peak_price, peak_pnl_percent, entry_time")
        .eq("user_id", userId)
        .eq("auto_stock_id", order.auto_stock_id)
        .maybeSingle();

      const { data: brokerPosition } = await supabaseAdmin
        .from("broker_positions")
        .select("id, qty, avg_entry_price, cost_basis, current_price, unrealized_pl")
        .eq("user_id", userId)
        .eq("broker", "alpaca")
        .eq("symbol", String(order.symbol || "").toUpperCase())
        .maybeSingle();

      const filledShares = n(order.filled_qty);
      const filledPrice = n(order.filled_avg_price);
      const oldShares = n(existingPosition?.shares);
      const oldEntry = n(existingPosition?.entry_price);
      const brokerShares = n(brokerPosition?.qty);
      const brokerEntry = n(brokerPosition?.avg_entry_price);
      const newShares = brokerShares > 0 ? brokerShares : oldShares + filledShares;
      const weightedEntry =
        brokerEntry > 0
          ? brokerEntry
          : newShares > 0
          ? (oldShares * oldEntry + filledShares * filledPrice) / newShares
          : filledPrice;
      const entryValue = n(brokerPosition?.cost_basis, newShares * weightedEntry);
      const currentPrice = n(brokerPosition?.current_price, filledPrice);
      const pnl = n(brokerPosition?.unrealized_pl, newShares * (currentPrice - weightedEntry));

      const { error: positionUpsertError } = await supabaseAdmin
        .from("positions")
        .upsert(
          {
            user_id: userId,
            auto_stock_id: order.auto_stock_id,
            symbol: String(order.symbol || "").toUpperCase(),
            status: "in-position",
            broker_order_id: brokerOrderId,
            broker_position_id: brokerPosition?.id ?? null,
            entry_price: weightedEntry,
            shares: newShares,
            peak_price: Math.max(n(existingPosition?.peak_price), currentPrice, filledPrice),
            peak_pnl_percent: existingPosition?.peak_pnl_percent ?? 0,
            entry_time: existingPosition?.entry_time || order.filled_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
            closed_at: null,
            pnl,
            entry_value: entryValue,
          },
          {
            onConflict: "auto_stock_id",
          }
        );

      if (positionUpsertError) {
        console.error("Failed to upsert reconciled buy position:", positionUpsertError);
        positionWriteFailed = true;
      }

      const { error: autoStockUpdateError } = await supabaseAdmin
        .from("auto_stocks")
        .update({
          status: "in-position",
          last_evaluated_price: currentPrice,
        })
        .eq("id", order.auto_stock_id)
        .eq("user_id", userId);

      if (autoStockUpdateError) {
        console.error("Failed to update auto stock after buy reconciliation:", autoStockUpdateError);
        positionWriteFailed = true;
      }
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
                const { error: deletePositionError } = await supabaseAdmin
                    .from("positions")
                    .delete()
                    .eq("user_id", userId)
                    .eq("auto_stock_id", order.auto_stock_id);

                if (deletePositionError) {
                  console.error("Failed to delete reconciled sell position:", deletePositionError);
                  positionWriteFailed = true;
                }

                const { error: fullExitAutoStockError } = await supabaseAdmin
                    .from("auto_stocks")
                    .update({
                        status: "monitoring",
                        last_sell_time: order.filled_at || new Date().toISOString(),
                    })
                    .eq("id", order.auto_stock_id);

                if (fullExitAutoStockError) {
                  console.error("Failed to update auto stock after full exit:", fullExitAutoStockError);
                  positionWriteFailed = true;
                }
            } else {
                // partial sell
                const { error: partialSellPositionError } = await supabaseAdmin
                    .from("positions")
                    .update({
                        shares: remainingShares,
                        updated_at: new Date().toISOString(),
                        status: "in-position",
                    })
                    .eq("user_id", userId)
                    .eq("auto_stock_id", order.auto_stock_id);

                if (partialSellPositionError) {
                  console.error("Failed to update reconciled partial sell position:", partialSellPositionError);
                  positionWriteFailed = true;
                }
            }
        }

      const { error: sellAutoStockError } = await supabaseAdmin
        .from("auto_stocks")
        .update({
          status: "monitoring",
          last_sell_time: order.filled_at || new Date().toISOString(),
          last_evaluated_price: price,
        })
        .eq("id", order.auto_stock_id)
        .eq("user_id", userId);

      if (sellAutoStockError) {
        console.error("Failed to update auto stock after sell reconciliation:", sellAutoStockError);
        positionWriteFailed = true;
      }
    }

    await supabaseAdmin
      .from("ai_decisions")
      .update({
        broker_order_id: brokerOrderId,
      })
      .eq("user_id", userId)
      .eq("auto_stock_id", order.auto_stock_id)
      .is("broker_order_id", null);

    if (positionWriteFailed) {
      continue;
    }

    // Mark order as reconciled
    await supabaseAdmin
      .from("broker_orders")
      .update({
        reconciled_at: new Date().toISOString(),
      })
      .eq("id", order.id);
  }

  await repairOpenPositionsFromBroker(userId);
  
  return {
    reconciled: filledOrders.length,
  };
}