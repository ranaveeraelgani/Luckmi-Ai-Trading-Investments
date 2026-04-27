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
      .select(`
        id,
        user_id,
        symbol,
        allocation,
        compound_profits,
        rinse_repeat,
        max_repeats,
        repeat_counter,
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

    const { data: openPosition, error: positionError } = await supabase
      .from("positions")
      .select("id")
      .eq("user_id", user.id)
      .eq("auto_stock_id", autoStockId)
      .maybeSingle();

    if (positionError) {
      console.error("Error checking open position before update:", positionError);
      return NextResponse.json(
        { error: "Failed to validate open position" },
        { status: 500 }
      );
    }

    const updatePayload: Record<string, any> = {};

    if (body.allocation !== undefined) {
      const allocation = Number(body.allocation);
      if (!Number.isFinite(allocation) || allocation < 0) {
        return NextResponse.json(
          { error: "Allocation must be 0 or greater" },
          { status: 400 }
        );
      }
      updatePayload.allocation = allocation;
    }

    if (body.compound_profits !== undefined) {
      updatePayload.compound_profits = Boolean(body.compound_profits);
    }

    if (body.rinse_repeat !== undefined) {
      updatePayload.rinse_repeat = Boolean(body.rinse_repeat);
    }

    if (body.max_repeats !== undefined) {
      const maxRepeats = Number(body.max_repeats);
      if (!Number.isFinite(maxRepeats) || maxRepeats < 0) {
        return NextResponse.json(
          { error: "Max repeats must be 0 or greater" },
          { status: 400 }
        );
      }
      updatePayload.max_repeats = maxRepeats;
    }

    if (body.status !== undefined) {
      const allowedStatuses = [
        "idle",
        "monitoring",
        "in-position",
        "completed",
        "disabled",
      ];

      if (!allowedStatuses.includes(body.status)) {
        return NextResponse.json(
          { error: "Invalid status" },
          { status: 400 }
        );
      }

      updatePayload.status = body.status;
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const hasOpenPosition = !!openPosition;

    if (hasOpenPosition) {
      const forbiddenWhileOpen = ["status"];
      const attemptedForbidden = forbiddenWhileOpen.some(
        (field) => field in updatePayload
      );

      if (attemptedForbidden) {
        return NextResponse.json(
          { error: "Cannot change this field while a position is open. Sell first." },
          { status: 409 }
        );
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from("auto_stocks")
      .update(updatePayload)
      .eq("id", autoStockId)
      .eq("user_id", user.id)
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
      .single();

    if (updateError) {
      console.error("Error updating auto stock:", updateError);
      return NextResponse.json(
        { error: "Failed to update auto stock" },
        { status: 500 }
      );
    }

    const { data: refreshedPosition } = await supabase
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
      .maybeSingle();

    return NextResponse.json({
      ...updated,
      has_open_position: !!refreshedPosition,
      open_position: refreshedPosition || null,
    });
  } catch (error) {
    console.error("Auto stocks UPDATE route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}