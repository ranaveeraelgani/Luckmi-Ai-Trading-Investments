import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabaseServer";

type PersonalPosition = {
  symbol: string;
  shares: number;
  avgPrice: number;
};

function normalizePosition(position: any, index: number) {
  const symbol = String(position?.symbol || "").trim().toUpperCase();
  const shares = Number(position?.shares || 0);
  const avgPrice = Number(position?.avgPrice ?? position?.avg_price ?? 0);

  if (!symbol || !Number.isFinite(shares) || shares <= 0) {
    return null;
  }

  return {
    id: `${symbol}-${index}`,
    source: "personal",
    symbol,
    shares,
    avgPrice,
    entryPrice: avgPrice,
    currentPrice: null,
    marketValue: null,
    pnl: null,
    pnlPercent: null,
  };
}

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
      .from("portfolios")
      .select("id, positions")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to load portfolio" },
        { status: 500 }
      );
    }

    const rawPositions = Array.isArray(data?.positions) ? data.positions : [];

    const positions = rawPositions
      .map((position: PersonalPosition, index: number) =>
        normalizePosition(position, index)
      )
      .filter(Boolean);

    return NextResponse.json({
      id: data?.id || null,
      positions,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to load portfolio" },
      { status: 500 }
    );
  }
}