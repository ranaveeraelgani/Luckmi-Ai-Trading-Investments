import { supabaseAdmin } from '@/app/lib/supabaseAdmin';

export type OptionPreferences = {
  user_id: string;
  max_loss_per_trade: number;        // max net_debit × 100 per trade (dollars)
  max_open_positions: number;        // max concurrent open paper trades
  preferred_dte_min: number;         // minimum days to expiry
  preferred_dte_max: number;         // maximum days to expiry
  min_score_threshold: number;       // personal OCS floor
  // Trailing profit stop
  hard_loss_stop_pct: number;        // close when loss >= X% of max_loss (0-100)
  profit_trail_activation_pct: number; // start trailing after gain >= X% of max_gain (0-100)
  profit_trail_distance_pct: number;   // trail: close if drops X% of max_gain below peak (0-100)
  // Auto-exit toggle
  auto_exit_enabled: boolean;
  // Long options toggle
  include_long_options: boolean;
  // Auto-entry (cron-driven trade placement)
  auto_entry_enabled: boolean;
  /** How many positions the auto-entry cron may open per cycle (1-15) */
  auto_entry_max_positions: number;
  updated_at?: string;
};

export const DEFAULT_OPTION_PREFERENCES: Omit<OptionPreferences, 'user_id'> = {
  max_loss_per_trade: 300,
  max_open_positions: 5,
  preferred_dte_min: 7,
  preferred_dte_max: 60,
  min_score_threshold: 55,
  hard_loss_stop_pct: 50,
  profit_trail_activation_pct: 40,
  profit_trail_distance_pct: 25,
  auto_exit_enabled: true,
  include_long_options: false,
  auto_entry_enabled: false,
  auto_entry_max_positions: 3,
};

export async function getOptionPreferences(userId: string): Promise<OptionPreferences> {
  const { data, error } = await supabaseAdmin
    .from('option_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    return { user_id: userId, ...DEFAULT_OPTION_PREFERENCES };
  }

  return data as OptionPreferences;
}

export async function upsertOptionPreferences(
  userId: string,
  patch: Partial<Omit<OptionPreferences, 'user_id' | 'updated_at'>>
): Promise<OptionPreferences> {
  // Clamp values to sane ranges before persisting
  const safe: typeof patch = {};
  if (patch.max_loss_per_trade != null)
    safe.max_loss_per_trade = Math.max(50, Math.min(50_000, patch.max_loss_per_trade));
  if (patch.max_open_positions != null)
    safe.max_open_positions = Math.max(1, Math.min(50, patch.max_open_positions));
  if (patch.preferred_dte_min != null)
    safe.preferred_dte_min = Math.max(1, Math.min(365, patch.preferred_dte_min));
  if (patch.preferred_dte_max != null)
    safe.preferred_dte_max = Math.max(1, Math.min(365, patch.preferred_dte_max));
  if (patch.min_score_threshold != null)
    safe.min_score_threshold = Math.max(0, Math.min(100, patch.min_score_threshold));
  if (patch.hard_loss_stop_pct != null)
    safe.hard_loss_stop_pct = Math.max(10, Math.min(100, patch.hard_loss_stop_pct));
  if (patch.profit_trail_activation_pct != null)
    safe.profit_trail_activation_pct = Math.max(10, Math.min(100, patch.profit_trail_activation_pct));
  if (patch.profit_trail_distance_pct != null)
    safe.profit_trail_distance_pct = Math.max(5, Math.min(100, patch.profit_trail_distance_pct));
  // Keep auto-entry and auto-exit coupled behind one effective control.
  if (patch.auto_entry_enabled != null) {
    const enabled = patch.auto_entry_enabled;
    safe.auto_entry_enabled = enabled;
    safe.auto_exit_enabled = enabled;
  } else if (patch.auto_exit_enabled != null) {
    // Backward compatibility for older callers still sending auto_exit_enabled.
    const enabled = patch.auto_exit_enabled;
    safe.auto_exit_enabled = enabled;
    safe.auto_entry_enabled = enabled;
  }
  if (patch.include_long_options != null)
    safe.include_long_options = patch.include_long_options;
  if (patch.auto_entry_max_positions != null)
    safe.auto_entry_max_positions = Math.max(1, Math.min(15, Math.floor(patch.auto_entry_max_positions)));

  const payload = {
    user_id: userId,
    ...safe,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('option_preferences')
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return data as OptionPreferences;
}
