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

function getBaseUrl(isPaper: boolean) {
  return isPaper ? PAPER_BASE_URL : LIVE_BASE_URL;
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