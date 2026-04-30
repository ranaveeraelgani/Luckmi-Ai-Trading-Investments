import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth/admin";
import {
  loadAdminOverviewData,
  resolveOverviewRange,
} from "@/app/lib/reports/adminDataLoaders";
import {
  buildAdminOverviewResponse,
  buildEmptyAdminOverviewResponse,
} from "@/app/lib/reports/adminOverviewReport";

export async function GET(req: Request) {
  try {
    await requireAdmin();

    const url = new URL(req.url);
    const rangeInput = url.searchParams.get("range") || "30d";
    const { range } = resolveOverviewRange(rangeInput);

    const {
      users,
      userIds,
      subscriptions,
      positions,
      trades,
      decisions,
      runs,
      brokerOrders,
    } = await loadAdminOverviewData(rangeInput);

    if (userIds.length === 0) {
      return NextResponse.json(buildEmptyAdminOverviewResponse(range));
    }

    return NextResponse.json(
      buildAdminOverviewResponse({
        range,
        users,
        subscriptions,
        positions,
        trades,
        decisions,
        runs,
        brokerOrders,
      })
    );
  } catch (error: any) {
    const message = error?.message || "Unauthorized";

    if (message === "Unauthorized") {
      return NextResponse.json({ error: message }, { status: 401 });
    }

    if (message === "Forbidden") {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
