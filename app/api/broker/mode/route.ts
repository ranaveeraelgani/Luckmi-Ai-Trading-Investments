import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabaseServer";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

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

    const { data, error } = await supabase
      .from("broker_keys")
      .select("broker, is_paper, live_trading_enabled, connection_status, last_tested_at, last_error")
      .eq("user_id", user.id)
      .eq("broker", "alpaca")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      connected: data?.connection_status === "connected",
      mode: data?.is_paper === false ? "live" : "paper",
      isPaper: data?.is_paper ?? true,
      liveTradingEnabled: data?.live_trading_enabled ?? false,
      connectionStatus: data?.connection_status ?? "unknown",
      lastTestedAt: data?.last_tested_at ?? null,
      lastError: data?.last_error ?? null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to load broker mode" },
      { status: 500 }
    );
  }
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
    const mode = body.mode as "paper" | "live";

    if (mode !== "paper" && mode !== "live") {
      return NextResponse.json(
        { error: "Invalid mode. Use paper or live." },
        { status: 400 }
      );
    }

    const { data: brokerKey, error: loadError } = await supabaseAdmin
      .from("broker_keys")
      .select("id, connection_status")
      .eq("user_id", user.id)
      .eq("broker", "alpaca")
      .maybeSingle();

    if (loadError) {
      return NextResponse.json({ error: loadError.message }, { status: 500 });
    }

    if (!brokerKey) {
      return NextResponse.json(
        { error: "Connect Alpaca before changing trading mode." },
        { status: 400 }
      );
    }

    if (brokerKey.connection_status !== "connected") {
      return NextResponse.json(
        { error: "Alpaca connection must be tested successfully before changing mode." },
        { status: 400 }
      );
    }

    if (mode === "live") {
      if (process.env.LIVE_TRADING_ENABLED !== "true") {
        return NextResponse.json(
          {
            error:
              "Live trading is currently disabled by platform settings. Continue using paper trading.",
          },
          { status: 403 }
        );
      }

      const { error: updateError } = await supabaseAdmin
        .from("broker_keys")
        .update({
          is_paper: false,
          live_trading_enabled: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", brokerKey.id)
        .eq("user_id", user.id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        mode: "live",
        isPaper: false,
        liveTradingEnabled: true,
      });
    }

    const { error: updateError } = await supabaseAdmin
      .from("broker_keys")
      .update({
        is_paper: true,
        live_trading_enabled: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", brokerKey.id)
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      mode: "paper",
      isPaper: true,
      liveTradingEnabled: false,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to update broker mode" },
      { status: 500 }
    );
  }
}