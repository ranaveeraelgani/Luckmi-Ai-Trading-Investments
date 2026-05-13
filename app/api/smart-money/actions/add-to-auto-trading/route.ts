import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/app/lib/supabaseServer';
import { supabaseAdmin } from '@/app/lib/supabaseAdmin';
import { calculateSmartMoneyScore } from '@/app/lib/smartMoney/calculateSmartMoneyScore';
import { classifyTier } from '@/app/lib/smartMoney/classifyTier';
import { fetchSmartMoneyInputs } from '@/app/lib/smartMoney/fetchSmartMoneyInputs';
import { logSmartMoneyAction } from '@/app/lib/smartMoney/logSmartMoneyAction';
import { isSmartMoneyEnabled, smartMoneyError } from '@/app/lib/smartMoney/http';

function parseNonNegativeNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

export async function POST(req: NextRequest) {
  try {
    if (!isSmartMoneyEnabled()) {
      return smartMoneyError(
        'Smart Money feature is currently disabled',
        404,
        'FEATURE_DISABLED',
      );
    }

    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return smartMoneyError('Unauthorized', 401, 'UNAUTHORIZED');
    }

    const body = await req.json();
    const symbol = String(body?.symbol || '').trim().toUpperCase();
    const allocation = parseNonNegativeNumber(body?.allocation, 0);
    const compoundProfits = Boolean(body?.compound_profits ?? false);
    const rinseRepeat = Boolean(body?.rinse_repeat ?? true);
    const maxRepeats = parseNonNegativeNumber(body?.max_repeats, 5);

    if (!symbol) {
      return smartMoneyError('symbol is required', 400, 'BAD_REQUEST');
    }

    const inputs = await fetchSmartMoneyInputs(symbol);
    const score = calculateSmartMoneyScore({
      symbol,
      flow: inputs.flow,
      netPremium: inputs.netPremium,
      gex: inputs.gex,
      iv: inputs.iv,
      ctsScore: inputs.ctsScore,
      alignment: inputs.alignment,
    });

    const tier = classifyTier(
      score.ctsScore,
      score.smartMoneyScore,
      score.alignment,
      score.finalConviction,
    );

    if (!tier.isAutoTradingEligible) {
      await logSmartMoneyAction({
        userId: user.id,
        action: 'tier_blocked',
        symbol,
        smartMoneyScore: score.smartMoneyScore,
        ctsScore: score.ctsScore,
        finalConviction: score.finalConviction,
        tier: tier.tier,
        meta: {
          source_channel: 'smart_money_dashboard',
          reason: tier.reason,
        },
      });

      return smartMoneyError(
        'Only Tier 1 stocks can be added directly to auto trading.',
        409,
        'CONFLICT',
        {
          symbol,
          tier: tier.tier,
          tierReason: tier.reason,
          suggestedAction: 'add_to_watchlist',
          smartMoneyScore: score.smartMoneyScore,
          ctsScore: score.ctsScore,
          finalConviction: score.finalConviction,
        },
      );
    }

    const { data: brokerRow, error: brokerError } = await supabaseAdmin
      .from('broker_keys')
      .select('connection_status, last_tested_at')
      .eq('user_id', user.id)
      .eq('broker', 'alpaca')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (brokerError) {
      console.error('[smart-money/add-to-auto] broker status error:', brokerError);
      return smartMoneyError(
        'Failed to validate broker connection',
        500,
        'INTERNAL_ERROR',
      );
    }

    const brokerReady =
      brokerRow?.connection_status === 'connected' && Boolean(brokerRow?.last_tested_at);

    if (!brokerReady) {
      return smartMoneyError(
        'Connect Alpaca and run Test Connection before adding auto stocks',
        403,
        'FORBIDDEN',
      );
    }

    const { data: existing, error: existingError } = await supabase
      .from('auto_stocks')
      .select('id, symbol')
      .eq('user_id', user.id)
      .eq('symbol', symbol)
      .maybeSingle();

    if (existingError) {
      console.error('[smart-money/add-to-auto] existing check error:', existingError);
      return smartMoneyError('Failed to validate stock', 500, 'INTERNAL_ERROR');
    }

    if (existing) {
      return smartMoneyError(
        `${symbol} is already in auto trading`,
        409,
        'CONFLICT',
        { symbol },
      );
    }

    const { data, error } = await supabase
      .from('auto_stocks')
      .insert({
        user_id: user.id,
        symbol,
        allocation,
        compound_profits: compoundProfits,
        rinse_repeat: rinseRepeat,
        max_repeats: maxRepeats,
        repeat_counter: 0,
        status: 'idle',
      })
      .select(
        `
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
        `,
      )
      .single();

    if (error) {
      console.error('[smart-money/add-to-auto] insert error:', error);
      return smartMoneyError('Failed to add auto stock', 500, 'INTERNAL_ERROR');
    }

    await logSmartMoneyAction({
      userId: user.id,
      action: 'add_to_auto_trading',
      symbol,
      smartMoneyScore: score.smartMoneyScore,
      ctsScore: score.ctsScore,
      finalConviction: score.finalConviction,
      tier: tier.tier,
      meta: {
        source_channel: 'smart_money_dashboard',
      },
    });

    return NextResponse.json({
      ...data,
      has_open_position: false,
      open_position: null,
      sourceChannel: 'smart_money_dashboard',
      smartMoneyScore: score.smartMoneyScore,
      ctsScoreAtEntry: score.ctsScore,
      finalConvictionAtEntry: score.finalConviction,
      tier: tier.tier,
    });
  } catch (error) {
    console.error('[smart-money/add-to-auto] error:', error);
    return smartMoneyError('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
