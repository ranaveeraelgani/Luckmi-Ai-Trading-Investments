import { placeAutoBrokerOrder } from "@/app/lib/broker/placeAutoBrokerOrder";

type BrokerSide = "buy" | "sell";

type EngineTrade = {
  id?: string;
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
      const order = await placeAutoBrokerOrder({
        userId,
        autoStockId: validated.autoStockId,
        symbol: validated.symbol,
        side: validated.side,
        qty: validated.shares,
        appTradeType: trade.type,
        appTradeLabel: getAppTradeLabel(trade.type),
        tradeIntent: {
          engineTradeId: trade.id || null,
          appTradeType: trade.type,
          appTradeLabel: getAppTradeLabel(trade.type),
          symbol: validated.symbol,
          shares: validated.shares,
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