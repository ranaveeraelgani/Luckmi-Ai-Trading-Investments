import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabaseServer";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";
import { getUserBrokerCredentials } from "@/app/lib/broker/getUserBrokerCredentials";
import { placeAlpacaOrder } from "@/app/lib/broker/alpaca";

function makeClientOrderId(userId: string, symbol: string, side: string) {
  return `luckmi-${userId.slice(0, 8)}-${symbol}-${side}-${Date.now()}`;
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const symbol = String(body.symbol || "").trim().toUpperCase();
    const side = body.side === "sell" ? "sell" : "buy";
    const qty = Number(body.qty);
    const autoStockId = body.autoStockId || null;

    if (!symbol) {
      return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
    }

    if (!Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json({ error: "Quantity must be greater than 0" }, { status: 400 });
    }

    const credentials = await getUserBrokerCredentials(user.id);
    const clientOrderId = makeClientOrderId(user.id, symbol, side);

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
      user_id: user.id,
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
      raw_order: order,
    });

    return NextResponse.json({
      success: true,
      order,
    });
  } catch (error: any) {
    console.error("Alpaca place order error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to place Alpaca order" },
      { status: 500 }
    );
  }
}