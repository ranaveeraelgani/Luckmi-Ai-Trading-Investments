import { placeAutoBrokerOrder } from "@/app/lib/broker/placeAutoBrokerOrder";
import { checkBrokerAccountCanTrade } from "./checkBrokerAccountCanTrade";
import { createNotificationService } from '@/app/lib/notifications/service';
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

type BrokerSide = "buy" | "sell";

type EngineTrade = {
  id?: string;
  ai_decision_id?: string;
  auto_stock_id?: string;
  autoStockId?: string;
  user_id?: string;
  symbol: string;
  type: string;
  shares: number;
  price?: number;
  amount?: number;
  reason?: string;
  confidence?: number;
  cts_score?: number;
  sell_score?: number;
};

const OPEN_ORDER_STATUSES = [
  "new",
  "accepted",
  "pending_new",
  "partially_filled",
  "held",
  "pending_cancel",
  "pending_replace",
];

async function hasOpenBrokerOrderForStock(params: {
  userId: string;
  autoStockId: string;
  side: BrokerSide;
}) {
  const { data, error } = await supabaseAdmin
    .from("broker_orders")
    .select("id")
    .eq("user_id", params.userId)
    .eq("auto_stock_id", params.autoStockId)
    .eq("side", params.side)
    .in("status", OPEN_ORDER_STATUSES)
    .limit(1);

  if (error) {
    console.warn("Failed to check pending broker orders:", error.message);
    return false;
  }

  return Boolean(data && data.length > 0);
}

async function getTrackedSharesForStock(params: {
  userId: string;
  autoStockId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("positions")
    .select("shares")
    .eq("user_id", params.userId)
    .eq("auto_stock_id", params.autoStockId)
    .maybeSingle();

  if (error) {
    console.warn("Failed to read tracked shares for sell guard:", error.message);
    return 0;
  }

  const shares = Number(data?.shares);
  return Number.isFinite(shares) ? Math.max(0, shares) : 0;
}

function normalizeTradeType(type?: string) {
  return String(type || "").trim().toLowerCase();
}

function getBrokerSideFromTradeType(type?: string): BrokerSide | null {
  const normalized = normalizeTradeType(type);

  const buyTypes = new Set(["buy", "buymore", "buy_more", "add_capital_buy"]);
  const sellTypes = new Set(["sell", "partial_sell", "partialsell"]);

  if (buyTypes.has(normalized)) return "buy";
  if (sellTypes.has(normalized)) return "sell";

  return null;
}

function getAppTradeLabel(type?: string) {
  const normalized = normalizeTradeType(type);

  if (normalized === "buy") return "Buy";
  if (normalized === "buymore" || normalized === "buy_more") return "Buy More";
  if (normalized === "sell") return "Sell";
  if (normalized === "partial_sell" || normalized === "partialsell") {
    return "Partial Sell";
  }

  return "Unknown";
}

function validateTradeForBroker(trade: EngineTrade) {
  const autoStockId = trade.auto_stock_id || trade.autoStockId;
  const symbol = String(trade.symbol || "").trim().toUpperCase();
  const shares = Number(trade.shares);
  const side = getBrokerSideFromTradeType(trade.type);

  if (!autoStockId) {
    return {
      valid: false as const,
      reason: "Missing auto_stock_id",
    };
  }

  if (!symbol) {
    return {
      valid: false as const,
      reason: "Missing symbol",
    };
  }

  if (!Number.isFinite(shares) || shares <= 0) {
    return {
      valid: false as const,
      reason: "Invalid shares",
    };
  }

  if (!side) {
    return {
      valid: false as const,
      reason: `Unsupported trade type: ${trade.type}`,
    };
  }

  return {
    valid: true as const,
    autoStockId,
    symbol,
    shares,
    side,
  };
}

export async function executeBrokerTradesForUser({
  userId,
  trades,
}: {
  userId: string;
  trades: EngineTrade[];
}) {
  const notificationService = createNotificationService();
  const placedOrders: any[] = [];
  const skippedTrades: any[] = [];
  const failedTrades: any[] = [];

  for (const trade of trades) {
    const validated = validateTradeForBroker(trade);

    if (!validated.valid) {
      skippedTrades.push({
        trade,
        reason: validated.reason,
      });

      console.warn("Skipping invalid broker trade:", {
        reason: validated.reason,
        trade,
      });

      continue;
    }

    try {
          const guard = await checkBrokerAccountCanTrade(userId);
        
          if (!guard.allowed) {
            try {
              await notificationService.queueEvent({
                userId,
                type: 'trade_skipped_safety',
                title: 'Trade skipped by safety guard',
                body: guard.reason || 'Broker account guard blocked this trade.',
                url: '/profile',
                idempotencyKey: `safety-skip:${userId}:${Date.now()}:${validated.symbol}:${validated.side}`,
                metadata: {
                  reason: guard.reason || null,
                  symbol: validated.symbol,
                  side: validated.side,
                },
              });
            } catch (notifyError) {
              console.warn('Failed to queue safety-skip notification:', notifyError);
            }

            return {
              success: false,
              skipped: true,
              reason: guard.reason,
            };
          }

      let orderQty = validated.shares;

      if (validated.side === "sell") {
        const hasPendingSell = await hasOpenBrokerOrderForStock({
          userId,
          autoStockId: validated.autoStockId,
          side: "sell",
        });

        if (hasPendingSell) {
          skippedTrades.push({
            trade,
            reason: "Pending sell order already exists for this stock",
          });

          console.warn("Skipping duplicate sell while broker sell is pending", {
            userId,
            autoStockId: validated.autoStockId,
            symbol: validated.symbol,
          });

          continue;
        }

        const trackedShares = await getTrackedSharesForStock({
          userId,
          autoStockId: validated.autoStockId,
        });

        if (trackedShares <= 0) {
          skippedTrades.push({
            trade,
            reason: "No tracked open shares available to sell",
          });

          console.warn("Skipping sell because tracked shares are zero", {
            userId,
            autoStockId: validated.autoStockId,
            symbol: validated.symbol,
          });

          continue;
        }

        orderQty = Math.min(validated.shares, trackedShares);
      }

      const order = await placeAutoBrokerOrder({
        userId,
        autoStockId: validated.autoStockId,
        symbol: validated.symbol,
        side: validated.side,
        qty: orderQty,
        appTradeType: trade.type,
        appTradeLabel: getAppTradeLabel(trade.type),
        tradeIntent: {
          engineTradeId: trade.id || null,
          aiDecisionId: trade.ai_decision_id || null,
          appTradeType: trade.type,
          appTradeLabel: getAppTradeLabel(trade.type),
          symbol: validated.symbol,
          shares: orderQty,
          expectedPrice: trade.price ?? null,
          expectedAmount: trade.amount ?? null,
          reason: trade.reason ?? null,
          confidence: trade.confidence ?? null,
          ctsScore: trade.cts_score ?? null,
          sellScore: trade.sell_score ?? null,
        },
      });

      placedOrders.push({
        trade,
        order,
        side: validated.side,
        appTradeType: trade.type,
      });
    } catch (error: any) {
      failedTrades.push({
        trade,
        error: error?.message || "Failed to place broker order",
      });

      console.error("Broker trade execution failed:", {
        trade,
        error,
      });
    }
  }

  return {
    placedOrders,
    skippedTrades,
    failedTrades,
    placedCount: placedOrders.length,
    skippedCount: skippedTrades.length,
    failedCount: failedTrades.length,
  };
}