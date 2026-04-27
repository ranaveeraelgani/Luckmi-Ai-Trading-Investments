import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabaseServer";
import { syncAlpacaForUser } from "@/app/lib/broker/syncAlpacaForUser";
import { reconcileFilledOrders } from "@/app/lib/broker/reconcileFilledOrders";
export async function POST() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sync = await syncAlpacaForUser(user.id);
    const reconcile = await reconcileFilledOrders(user.id);

    return NextResponse.json({
      success: true,
      sync,
      reconcile,
    });
  } catch (error: any) {
    console.error("Alpaca sync route error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to sync Alpaca" },
      { status: 500 }
    );
  }
}