import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/app/lib/supabaseServer';
import { logSmartMoneyAction } from '@/app/lib/smartMoney/logSmartMoneyAction';
import { isSmartMoneyEnabled, smartMoneyError } from '@/app/lib/smartMoney/http';

async function validateLivePrice(symbol: string): Promise<boolean> {
  const massiveApiKey = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY;
  if (!massiveApiKey) return true;

  try {
    const quoteRes = await fetch(
      `https://api.massive.com/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${encodeURIComponent(symbol)}&apiKey=${massiveApiKey}`,
      { cache: 'no-store' },
    );

    if (!quoteRes.ok) return false;

    const quoteData = await quoteRes.json();
    const row = Array.isArray(quoteData?.tickers) ? quoteData.tickers[0] : null;
    const lastPrice = Number(
      row?.lastTrade?.p ?? row?.min?.c ?? row?.day?.c ?? row?.prevDay?.c,
    );

    return Number.isFinite(lastPrice) && lastPrice > 0;
  } catch {
    return false;
  }
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

    if (!symbol) {
      return smartMoneyError('symbol is required', 400, 'BAD_REQUEST');
    }

    const isPriceValid = await validateLivePrice(symbol);
    if (!isPriceValid) {
      return smartMoneyError(
        `${symbol} has no live price and cannot be added`,
        400,
        'BAD_REQUEST',
        { symbol },
      );
    }

    const { data: existing, error: existingError } = await supabase
      .from('watchlists')
      .select('id, symbols')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingError) {
      console.error('[smart-money/add-to-watchlist] existing check error:', existingError);
      return smartMoneyError('Failed to load watchlist', 500, 'INTERNAL_ERROR');
    }

    const currentSymbols = Array.isArray(existing?.symbols) ? existing.symbols : [];

    if (currentSymbols.includes(symbol)) {
      return smartMoneyError(
        `${symbol} is already in your watchlist`,
        409,
        'CONFLICT',
        { symbol },
      );
    }

    const nextSymbols = [...currentSymbols, symbol];

    if (existing?.id) {
      const { error: updateError } = await supabase
        .from('watchlists')
        .update({ symbols: nextSymbols })
        .eq('id', existing.id)
        .eq('user_id', user.id);

      if (updateError) {
        console.error('[smart-money/add-to-watchlist] update error:', updateError);
        return smartMoneyError('Failed to update watchlist', 500, 'INTERNAL_ERROR');
      }
    } else {
      const { error: insertError } = await supabase.from('watchlists').insert({
        user_id: user.id,
        symbols: [symbol],
      });

      if (insertError) {
        console.error('[smart-money/add-to-watchlist] insert error:', insertError);
        return smartMoneyError('Failed to create watchlist', 500, 'INTERNAL_ERROR');
      }
    }

    await logSmartMoneyAction({
      userId: user.id,
      action: 'add_to_watchlist',
      symbol,
      smartMoneyScore: body?.smartMoneyScore,
      ctsScore: body?.ctsScore,
      finalConviction: body?.finalConviction,
      tier: body?.tier,
      meta: {
        source_channel: 'smart_money_dashboard',
      },
    });

    return NextResponse.json({
      success: true,
      symbol,
      sourceChannel: 'smart_money_dashboard',
    });
  } catch (error) {
    console.error('[smart-money/add-to-watchlist] error:', error);
    return smartMoneyError('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
