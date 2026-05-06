type AlpacaCredentials = {
  apiKey: string;
  apiSecret: string;
  isPaper: boolean;
};

const PAPER_BASE_URL = "https://paper-api.alpaca.markets";
const LIVE_BASE_URL = "https://api.alpaca.markets";

export type AlpacaOrderSide = "buy" | "sell";
export type AlpacaOrderType = "market" | "limit";
export type AlpacaTimeInForce = "day" | "gtc" | "ioc" | "fok";

export type ParsedOptionContractSymbol = {
  optionSymbol: string;
  underlyingSymbol: string;
  expirationDate: string;
  optionType: "call" | "put";
  strikePrice: number;
  multiplier: number;
};

function getBaseUrl(isPaper: boolean) {
  return isPaper ? PAPER_BASE_URL : LIVE_BASE_URL;
}

export function parseOptionContractSymbol(symbol: string): ParsedOptionContractSymbol | null {
  const normalized = String(symbol || "").trim().toUpperCase();
  const match = normalized.match(/^([A-Z.]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);

  if (!match) return null;

  const [, root, yy, mm, dd, cp, strikeRaw] = match;
  const strikePrice = Number(strikeRaw) / 1000;
  if (!Number.isFinite(strikePrice)) return null;

  return {
    optionSymbol: normalized,
    underlyingSymbol: root,
    expirationDate: `20${yy}-${mm}-${dd}`,
    optionType: cp === "C" ? "call" : "put",
    strikePrice,
    multiplier: 100,
  };
}

async function alpacaRequest<T>({
  credentials,
  path,
  method = "GET",
  body,
}: {
  credentials: AlpacaCredentials;
  path: string;
  method?: "GET" | "POST" | "DELETE";
  body?: any;
}): Promise<T> {
  const res = await fetch(`${getBaseUrl(credentials.isPaper)}${path}`, {
    method,
    headers: {
      "APCA-API-KEY-ID": credentials.apiKey,
      "APCA-API-SECRET-KEY": credentials.apiSecret,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(data?.message || data?.error || `Alpaca request failed: ${res.status}`);
  }

  return data as T;
}

export async function getAlpacaAccount(credentials: AlpacaCredentials) {
  return alpacaRequest<any>({
    credentials,
    path: "/v2/account",
  });
}

export async function getAlpacaPositions(credentials: AlpacaCredentials) {
  return alpacaRequest<any[]>({
    credentials,
    path: "/v2/positions",
  });
}

export async function getAlpacaOrders(
  credentials: AlpacaCredentials,
  status: "open" | "closed" | "all" = "all"
) {
  return alpacaRequest<any[]>({
    credentials,
    path: `/v2/orders?status=${status}&limit=100&direction=desc`,
  });
}

export async function placeAlpacaOrder({
  credentials,
  symbol,
  side,
  qty,
  type = "market",
  timeInForce = "day",
  clientOrderId,
  limitPrice,
}: {
  credentials: AlpacaCredentials;
  symbol: string;
  side: AlpacaOrderSide;
  qty: number;
  type?: AlpacaOrderType;
  timeInForce?: AlpacaTimeInForce;
  clientOrderId?: string;
  limitPrice?: number;
}) {
  const payload: Record<string, any> = {
    symbol,
    side,
    qty: String(qty),
    type,
    time_in_force: timeInForce,
  };

  if (clientOrderId) payload.client_order_id = clientOrderId;
  if (type === "limit" && limitPrice) payload.limit_price = String(limitPrice);

  return alpacaRequest<any>({
    credentials,
    path: "/v2/orders",
    method: "POST",
    body: payload,
  });
}

// ── Options-specific order helpers ────────────────────────────────────────────

export type AlpacaOptionOrderParams = {
  credentials: AlpacaCredentials;
  /** Full OCC option symbol e.g. AAPL260620C00200000 */
  optionSymbol: string;
  side: AlpacaOrderSide;
  /** Number of contracts (qty for Alpaca options = number of contracts) */
  qtyContracts: number;
  /** Market or limit. Default market for simplicity. */
  type?: AlpacaOrderType;
  /** Required when type = 'limit' */
  limitPrice?: number;
  /** Default 'day' */
  timeInForce?: 'day' | 'gtc';
  clientOrderId?: string;
};

/**
 * Place a single-leg options order on Alpaca.
 * Alpaca options orders use qty = number of contracts.
 */
export async function placeAlpacaOptionOrder(params: AlpacaOptionOrderParams) {
  const {
    credentials,
    optionSymbol,
    side,
    qtyContracts,
    type = 'market',
    limitPrice,
    timeInForce = 'day',
    clientOrderId,
  } = params;

  if (!Number.isFinite(qtyContracts) || qtyContracts < 1) {
    throw new Error('qtyContracts must be a positive integer');
  }

  const payload: Record<string, any> = {
    symbol: optionSymbol,
    side,
    type,
    qty: String(Math.floor(qtyContracts)),
    time_in_force: timeInForce,
  };

  if (clientOrderId) payload.client_order_id = clientOrderId;
  if (type === 'limit' && limitPrice != null) payload.limit_price = String(limitPrice);

  return alpacaRequest<any>({
    credentials,
    path: '/v2/orders',
    method: 'POST',
    body: payload,
  });
}

/**
 * Cancel an open Alpaca order by broker order ID.
 */
export async function cancelAlpacaOrder(credentials: AlpacaCredentials, brokerOrderId: string) {
  return alpacaRequest<void>({
    credentials,
    path: `/v2/orders/${brokerOrderId}`,
    method: 'DELETE',
  });
}

/**
 * Get a single Alpaca order by broker order ID.
 */
export async function getAlpacaOrder(credentials: AlpacaCredentials, brokerOrderId: string) {
  return alpacaRequest<any>({
    credentials,
    path: `/v2/orders/${brokerOrderId}`,
  });
}