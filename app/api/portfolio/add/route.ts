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
    const shares = Number(body.shares);
    const avgPrice = Number(body.avgPrice);

    if (!symbol) {
      return NextResponse.json(
        { error: "Symbol is required" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(shares) || shares <= 0) {
      return NextResponse.json(
        { error: "Shares must be greater than 0" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(avgPrice) || avgPrice <= 0) {
      return NextResponse.json(
        { error: "Average price must be greater than 0" },
        { status: 400 }
      );
    }

    const { data: existing, error: existingError } = await supabase
      .from("portfolios")
      .select("id, positions")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingError) {
      console.error("Error loading portfolio for add:", existingError);
      return NextResponse.json(
        { error: "Failed to load portfolio" },
        { status: 500 }
      );
    }

    const currentPositions: PortfolioPosition[] = Array.isArray(existing?.positions)
      ? existing.positions
      : [];

    const existingIndex = currentPositions.findIndex(
      (p) => p.symbol?.toUpperCase() === symbol
    );

    let nextPositions: PortfolioPosition[];

    if (existingIndex >= 0) {
      const current = currentPositions[existingIndex];
      const currentShares = Number(current.shares || 0);
      const currentAvg = Number(current.avgPrice || 0);

      const totalShares = currentShares + shares;
      const totalCost = currentShares * currentAvg + shares * avgPrice;
      const weightedAvg = totalShares > 0 ? totalCost / totalShares : avgPrice;

      nextPositions = [...currentPositions];
      nextPositions[existingIndex] = {
        symbol,
        shares: totalShares,
        avgPrice: weightedAvg,
      };
    } else {
      nextPositions = [...currentPositions, { symbol, shares, avgPrice }];
    }

    if (existing?.id) {
      const { error: updateError } = await supabase
        .from("portfolios")
        .update({ positions: nextPositions })
        .eq("id", existing.id)
        .eq("user_id", user.id);

      if (updateError) {
        console.error("Error updating portfolio:", updateError);
        return NextResponse.json(
          { error: "Failed to update portfolio" },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, symbol });
    }

    const { error: insertError } = await supabase.from("portfolios").insert({
      user_id: user.id,
      positions: [{ symbol, shares, avgPrice }],
    });

    if (insertError) {
      console.error("Error creating portfolio:", insertError);
      return NextResponse.json(
        { error: "Failed to create portfolio" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, symbol });
  } catch (error) {
    console.error("Portfolio add route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}