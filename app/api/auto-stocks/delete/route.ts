import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabaseServer";

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
      .select("id, symbol, user_id, status")
      .eq("id", autoStockId)
      .eq("user_id", user.id)
      .single();

    if (stockError || !stock) {
      return NextResponse.json(
        { error: "Auto stock not found" },
        { status: 404 }
      );
    }

    const { data: openPosition, error: positionError } = await supabase
      .from("positions")
      .select("id")
      .eq("user_id", user.id)
      .eq("auto_stock_id", autoStockId)
      .maybeSingle();

    if (positionError) {
      console.error("Error checking open position before delete:", positionError);
      return NextResponse.json(
        { error: "Failed to validate open position" },
        { status: 500 }
      );
    }

    if (openPosition) {
      return NextResponse.json(
        { error: "Cannot delete a stock with an open position. Sell it first." },
        { status: 409 }
      );
    }

    const { error: deleteError } = await supabase
      .from("auto_stocks")
      .delete()
      .eq("id", autoStockId)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("Error deleting auto stock:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete auto stock" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      deletedId: autoStockId,
      symbol: stock.symbol,
    });
  } catch (error) {
    console.error("Auto stocks DELETE route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}