import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabaseServer";

function toNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
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
    const autoStockId = String(body.id || "").trim();

    if (!autoStockId) {
      return NextResponse.json(
        { error: "Auto stock id is required" },
        { status: 400 }
      );
    }

    const { data: stock, error: stockError } = await supabase
      .from("auto_stocks")
      .select(`
        id,
        user_id,
        symbol,
        rinse_repeat,
        repeat_counter,
        max_repeats,
        status
      `)
      .eq("id", autoStockId)
      .eq("user_id", user.id)
      .single();

    if (stockError || !stock) {
      return NextResponse.json(
        { error: "Auto stock not found" },
        { status: 404 }
      );
    }

    const { data: position, error: positionError } = await supabase
      .from("positions")
      .select(`
        id,
        auto_stock_id,
        entry_price,
        shares,
        peak_price,
        peak_pnl_percent,
        entry_time,
        updated_at
      `)
      .eq("user_id", user.id)
      .eq("auto_stock_id", autoStockId)
      .single();

    if (positionError || !position) {
      return NextResponse.json(
        { error: "No open position found for this stock" },
        { status: 409 }
      );
    }

    const quoteRes = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL}/api/quotes?symbols=${stock.symbol}`,
      { cache: "no-store" }
    );

    if (!quoteRes.ok) {
      return NextResponse.json(
        { error: "Failed to fetch latest quote for sell" },
        { status: 500 }
      );
    }

    const quoteData = await quoteRes.json();
    const quote = Array.isArray(quoteData) ? quoteData[0] : quoteData;
    const sellPrice = toNumber(quote?.price);

    if (!sellPrice || sellPrice <= 0) {
      return NextResponse.json(
        { error: "Invalid quote price for sell" },
        { status: 500 }
      );
    }

    const shares = toNumber(position.shares);
    const entryPrice = toNumber(position.entry_price);
    const amount = shares * sellPrice;
    const pnl = shares * (sellPrice - entryPrice);

    const { error: tradeError } = await supabase.from("trades").insert({
      user_id: user.id,
      auto_stock_id: stock.id,
      symbol: stock.symbol,
      type: "sell",
      shares,
      price: sellPrice,
      amount,
      pnl,
      reason: "Manual sell",
      confidence: null,
      cts_score: null,
      sell_score: null,
    });

    if (tradeError) {
      console.error("Error inserting manual sell trade:", tradeError);
      return NextResponse.json(
        { error: "Failed to record sell trade" },
        { status: 500 }
      );
    }

    const { error: deletePositionError } = await supabase
      .from("positions")
      .delete()
      .eq("id", position.id)
      .eq("user_id", user.id);

    if (deletePositionError) {
      console.error("Error deleting position on manual sell:", deletePositionError);
      return NextResponse.json(
        { error: "Failed to close position" },
        { status: 500 }
      );
    }

    const nextRepeatCounter = toNumber(stock.repeat_counter) + 1;
    const maxRepeats = toNumber(stock.max_repeats);

    const nextStatus =
      stock.rinse_repeat && nextRepeatCounter < maxRepeats
        ? "monitoring"
        : stock.rinse_repeat && nextRepeatCounter >= maxRepeats
        ? "completed"
        : "monitoring";

    const { error: stockUpdateError } = await supabase
      .from("auto_stocks")
      .update({
        status: nextStatus,
        repeat_counter: nextRepeatCounter,
        last_sell_time: new Date().toISOString(),
        last_evaluated_price: sellPrice,
      })
      .eq("id", stock.id)
      .eq("user_id", user.id);

    if (stockUpdateError) {
      console.error("Error updating auto stock after manual sell:", stockUpdateError);
      return NextResponse.json(
        { error: "Failed to update auto stock after sell" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      symbol: stock.symbol,
      soldShares: shares,
      sellPrice,
      pnl,
      status: nextStatus,
      message: `${stock.symbol} sold successfully`,
    });
  } catch (error) {
    console.error("Auto stocks SELL route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}