import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabaseServer";
import {
  getOptionPreferences,
  upsertOptionPreferences,
  DEFAULT_OPTION_PREFERENCES,
} from "@/app/lib/db/optionPreferences";

// ─── GET — load preferences for current user ──────────────────────────────────

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      // Unauthenticated — return defaults so the UI always has something to show
      return NextResponse.json({ prefs: { user_id: null, ...DEFAULT_OPTION_PREFERENCES } });
    }

    const prefs = await getOptionPreferences(user.id);
    return NextResponse.json({ prefs });
  } catch (err: any) {
    console.error("[option-preferences] GET error:", err);
    return NextResponse.json({ error: "Failed to load preferences" }, { status: 500 });
  }
}

// ─── PUT — save preferences for current user ──────────────────────────────────

export async function PUT(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const patch: Parameters<typeof upsertOptionPreferences>[1] = {};

    if (body.max_loss_per_trade != null) {
      const v = Number(body.max_loss_per_trade);
      if (!Number.isFinite(v) || v <= 0)
        return NextResponse.json({ error: "max_loss_per_trade must be a positive number" }, { status: 400 });
      patch.max_loss_per_trade = v;
    }

    if (body.max_open_positions != null) {
      const v = Number(body.max_open_positions);
      if (!Number.isFinite(v) || v < 1 || !Number.isInteger(v))
        return NextResponse.json({ error: "max_open_positions must be a positive integer" }, { status: 400 });
      patch.max_open_positions = v;
    }

    if (body.preferred_dte_min != null) {
      const v = Number(body.preferred_dte_min);
      if (!Number.isFinite(v) || v < 1)
        return NextResponse.json({ error: "preferred_dte_min must be >= 1" }, { status: 400 });
      patch.preferred_dte_min = v;
    }

    if (body.preferred_dte_max != null) {
      const v = Number(body.preferred_dte_max);
      if (!Number.isFinite(v) || v < 1)
        return NextResponse.json({ error: "preferred_dte_max must be >= 1" }, { status: 400 });
      patch.preferred_dte_max = v;
    }

    if (body.min_score_threshold != null) {
      const v = Number(body.min_score_threshold);
      if (!Number.isFinite(v) || v < 0 || v > 100)
        return NextResponse.json({ error: "min_score_threshold must be 0-100" }, { status: 400 });
      patch.min_score_threshold = v;
    }

    if (body.hard_loss_stop_pct != null) {
      const v = Number(body.hard_loss_stop_pct);
      if (!Number.isFinite(v) || v < 10 || v > 100)
        return NextResponse.json({ error: "hard_loss_stop_pct must be 10-100" }, { status: 400 });
      patch.hard_loss_stop_pct = v;
    }

    if (body.profit_trail_activation_pct != null) {
      const v = Number(body.profit_trail_activation_pct);
      if (!Number.isFinite(v) || v < 10 || v > 100)
        return NextResponse.json({ error: "profit_trail_activation_pct must be 10-100" }, { status: 400 });
      patch.profit_trail_activation_pct = v;
    }

    if (body.profit_trail_distance_pct != null) {
      const v = Number(body.profit_trail_distance_pct);
      if (!Number.isFinite(v) || v < 5 || v > 100)
        return NextResponse.json({ error: "profit_trail_distance_pct must be 5-100" }, { status: 400 });
      patch.profit_trail_distance_pct = v;
    }

    if (body.include_long_options != null) {
      patch.include_long_options = Boolean(body.include_long_options);
    }

    if (body.auto_entry_enabled != null) {
      const enabled = Boolean(body.auto_entry_enabled);
      patch.auto_entry_enabled = enabled;
      patch.auto_exit_enabled = enabled;
    } else if (body.auto_exit_enabled != null) {
      // Backward compatibility for older clients: keep both fields coupled.
      const enabled = Boolean(body.auto_exit_enabled);
      patch.auto_entry_enabled = enabled;
      patch.auto_exit_enabled = enabled;
    }

    if (body.auto_entry_max_positions != null) {
      const v = Number(body.auto_entry_max_positions);
      if (!Number.isFinite(v) || v < 1 || v > 15 || !Number.isInteger(v))
        return NextResponse.json({ error: "auto_entry_max_positions must be an integer 1-15" }, { status: 400 });
      patch.auto_entry_max_positions = v;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
    }

    // Validate DTE range if both are being set
    const dteMin = patch.preferred_dte_min;
    const dteMax = patch.preferred_dte_max;
    if (dteMin != null && dteMax != null && dteMin > dteMax) {
      return NextResponse.json({ error: "preferred_dte_min must be <= preferred_dte_max" }, { status: 400 });
    }

    const prefs = await upsertOptionPreferences(user.id, patch);
    return NextResponse.json({ prefs });
  } catch (err: any) {
    console.error("[option-preferences] PUT error:", err);
    return NextResponse.json({ error: "Failed to save preferences" }, { status: 500 });
  }
}
