import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabaseServer";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

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
    const allocation = Number(body.allocation ?? 0);
    const compoundProfits = Boolean(body.compound_profits ?? false);
    const rinseRepeat = Boolean(body.rinse_repeat ?? true);
    const maxRepeats = Number(body.max_repeats ?? 5);

    if (!symbol) {
      return NextResponse.json(
        { error: "Symbol is required" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(allocation) || allocation < 0) {
      return NextResponse.json(
        { error: "Allocation must be 0 or greater" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(maxRepeats) || maxRepeats < 0) {
      return NextResponse.json(
        { error: "Max repeats must be 0 or greater" },
        { status: 400 }
      );
    }

    const { data: brokerRow, error: brokerError } = await supabaseAdmin
      .from("broker_keys")
      .select("connection_status, last_tested_at")
      .eq("user_id", user.id)
      .eq("broker", "alpaca")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (brokerError) {
      console.error("Error checking broker status:", brokerError);
      return NextResponse.json(
        { error: "Failed to validate broker connection" },
        { status: 500 }
      );
    }

    const brokerReady =
      brokerRow?.connection_status === "connected" &&
      Boolean(brokerRow?.last_tested_at);

    if (!brokerReady) {
      return NextResponse.json(
        { error: "Connect Alpaca and run Test Connection before adding auto stocks" },
        { status: 403 }
      );
    }

    const { data: existing, error: existingError } = await supabase
      .from("auto_stocks")
      .select("id, symbol")
      .eq("user_id", user.id)
      .eq("symbol", symbol)
      .maybeSingle();

    if (existingError) {
      console.error("Error checking existing auto stock:", existingError);
      return NextResponse.json(
        { error: "Failed to validate stock" },
        { status: 500 }
      );
    }

    if (existing) {
      return NextResponse.json(
        { error: `${symbol} is already in auto trading` },
        { status: 409 }
      );
    }

    const { data, error } = await supabase
      .from("auto_stocks")
      .insert({
        user_id: user.id,
        symbol,
        allocation,
        compound_profits: compoundProfits,
        rinse_repeat: rinseRepeat,
        max_repeats: maxRepeats,
        repeat_counter: 0,
        status: "idle",
      })
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

    if (error) {
      console.error("Error adding auto stock:", error);
      return NextResponse.json(
        { error: "Failed to add auto stock" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ...data,
      has_open_position: false,
      open_position: null,
    });
  } catch (error) {
    console.error("Auto stocks ADD route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}