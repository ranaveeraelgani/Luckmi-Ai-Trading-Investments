import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabaseServer";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: autoStocks, error: autoStocksError } = await supabase
      .from("auto_stocks")
      .select(`
        id,
        user_id,
        symbol,
        allocation,
        compound_profits,
        rinse_repeat,
        max_repeats,
        repeat_counter,
        status,
        last_sell_time,
        last_evaluated_price,
        last_ai_decision,
        created_at
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (autoStocksError) {
      console.error("Error loading auto stocks:", autoStocksError);
      return NextResponse.json(
        { error: "Failed to load auto stocks" },
        { status: 500 }
      );
    }

    if (!autoStocks || autoStocks.length === 0) {
      return NextResponse.json([]);
    }

    const autoStockIds = autoStocks.map((stock) => stock.id);

    const { data: positions, error: positionsError } = await supabase
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
      .in("auto_stock_id", autoStockIds);

    if (positionsError) {
      console.error("Error loading positions for auto stocks:", positionsError);
      return NextResponse.json(
        { error: "Failed to load positions" },
        { status: 500 }
      );
    }

    const positionMap = new Map(
      (positions || []).map((position) => [position.auto_stock_id, position])
    );

    const result = autoStocks.map((stock) => {
      const openPosition = positionMap.get(stock.id) || null;

      return {
        ...stock,
        has_open_position: !!openPosition,
        open_position: openPosition,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Auto stocks GET route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}