import { supabaseAdmin } from '@/app/lib/supabaseAdmin';

export type SmartMoneyActionType =
  | 'view_dashboard'
  | 'add_to_watchlist'
  | 'add_to_auto_trading'
  | 'tier_blocked';

type LogSmartMoneyActionInput = {
  userId: string;
  action: SmartMoneyActionType;
  symbol: string;
  smartMoneyScore?: number | null;
  ctsScore?: number | null;
  finalConviction?: number | null;
  tier?: string | null;
  meta?: Record<string, unknown> | null;
};

function normalizeNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function logSmartMoneyAction(
  input: LogSmartMoneyActionInput,
): Promise<boolean> {
  try {
    const payload = {
      user_id: input.userId,
      action: input.action,
      symbol: String(input.symbol || '').trim().toUpperCase(),
      smart_money_score: normalizeNumber(input.smartMoneyScore),
      cts_score: normalizeNumber(input.ctsScore),
      final_conviction: normalizeNumber(input.finalConviction),
      tier: input.tier ?? null,
      meta: input.meta ?? {},
      created_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from('smart_money_actions')
      .insert(payload);

    if (error) {
      console.warn('[smart-money/log] insert failed:', error.message);
      return false;
    }

    return true;
  } catch (error) {
    console.warn('[smart-money/log] unexpected failure:', error);
    return false;
  }
}
