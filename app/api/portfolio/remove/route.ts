import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabaseServer";

type PortfolioPosition = {
  symbol: string;
  shares: number;
  avgPrice: number;
};

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

    if (!symbol) {
      return NextResponse.json(
        { error: "Symbol is required" },
        { status: 400 }
      );
    }

    const { data: existing, error: existingError } = await supabase
      .from("portfolios")
      .select("id, positions")
      .eq("user_id", user.id)
      .single();

    if (existingError || !existing) {
      return NextResponse.json(
        { error: "Portfolio not found" },
        { status: 404 }
      );
    }

    const currentPositions: PortfolioPosition[] = Array.isArray(existing.positions)
      ? existing.positions
      : [];

    const nextPositions = currentPositions.filter(
      (p) => p.symbol?.toUpperCase() !== symbol
    );

    const { error: updateError } = await supabase
      .from("portfolios")
      .update({ positions: nextPositions })
      .eq("id", existing.id)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("Error removing portfolio position:", updateError);
      return NextResponse.json(
        { error: "Failed to update portfolio" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, symbol });
  } catch (error) {
    console.error("Portfolio remove route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}