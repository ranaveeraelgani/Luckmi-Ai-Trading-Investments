/**
 * POST /api/options/broker-entry
 *
 * Submit an options entry order to Alpaca (paper or live) for the current user.
 * Called from the Options UI when broker execution is enabled.
 *
 * Body: OptionsEntryRequest fields
 * Returns: { ok, tradeId, brokerOrderId, executionMode } or { error }
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/app/lib/supabaseServer';
import { placeOptionsBrokerEntry } from '@/app/lib/options/placeOptionsBrokerEntry';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // Required fields
    const symbol = String(body.symbol || '').trim().toUpperCase();
    const longOccSymbol = String(body.longOccSymbol || '').trim().toUpperCase();
    const netDebit = Number(body.netDebit);
    const direction = body.direction as string;
    const strategy = body.strategy as string;
    const longStrike = Number(body.longStrike);
    const longExpiry = String(body.longExpiry || '');
    const optionType = body.optionType as string;

    if (!symbol) return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
    if (!longOccSymbol) return NextResponse.json({ error: 'longOccSymbol is required' }, { status: 400 });
    if (!Number.isFinite(netDebit) || netDebit <= 0) return NextResponse.json({ error: 'netDebit must be a positive number' }, { status: 400 });
    if (!['bullish', 'bearish'].includes(direction)) return NextResponse.json({ error: 'invalid direction' }, { status: 400 });
    if (!['call_debit_spread', 'put_debit_spread', 'long_call', 'long_put'].includes(strategy)) return NextResponse.json({ error: 'invalid strategy' }, { status: 400 });
    if (!Number.isFinite(longStrike) || longStrike <= 0) return NextResponse.json({ error: 'longStrike is required' }, { status: 400 });
    if (!longExpiry || !/^\d{4}-\d{2}-\d{2}$/.test(longExpiry)) return NextResponse.json({ error: 'longExpiry must be YYYY-MM-DD' }, { status: 400 });
    if (!['call', 'put'].includes(optionType)) return NextResponse.json({ error: 'optionType must be call or put' }, { status: 400 });

    const result = await placeOptionsBrokerEntry({
      userId: user.id,
      symbol,
      direction: direction as 'bullish' | 'bearish',
      strategy: strategy as 'call_debit_spread' | 'put_debit_spread' | 'long_call' | 'long_put',
      longOccSymbol,
      shortOccSymbol: body.shortOccSymbol ? String(body.shortOccSymbol).trim().toUpperCase() : null,
      longStrike,
      longExpiry,
      shortStrike: body.shortStrike != null ? Number(body.shortStrike) : null,
      shortExpiry: body.shortExpiry ? String(body.shortExpiry) : null,
      optionType: optionType as 'call' | 'put',
      netDebit,
      maxGain: body.maxGain != null ? Number(body.maxGain) : null,
      maxLoss: body.maxLoss != null ? Number(body.maxLoss) : null,
      entryScore: body.entryScore != null ? Number(body.entryScore) : null,
      entrySpotPrice: body.entrySpotPrice != null ? Number(body.entrySpotPrice) : null,
      qtyContracts: body.qtyContracts != null ? Math.max(1, Math.floor(Number(body.qtyContracts))) : 1,
      // AI recommendation fields — optional; stored in ai_decisions when provided
      aiAction: ['Enter', 'Watch', 'Avoid'].includes(String(body.aiAction ?? ''))
        ? (body.aiAction as 'Enter' | 'Watch' | 'Avoid')
        : undefined,
      aiReason: body.aiReason ? String(body.aiReason) : undefined,
      aiConfidence: body.aiConfidence != null ? Math.min(100, Math.max(0, Number(body.aiConfidence))) : undefined,
      aiRiskFlags: Array.isArray(body.aiRiskFlags) ? (body.aiRiskFlags as string[]) : undefined,
      aiSource: 'manual',
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 422 });
    }

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    console.error('[options/broker-entry] exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
