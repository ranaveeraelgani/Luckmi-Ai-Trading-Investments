import { createClient } from '@/app/lib/supabaseServer';
import { supabaseAdmin } from '@/app/lib/supabaseAdmin';
import { decrypt } from '@/app/lib/crypto/encrypt';
import { getEntitlements, isEnforcedForUser } from '@/app/lib/subscriptions/getEntitlements';

export async function POST() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const entitlements = await getEntitlements(user.id);

    if (isEnforcedForUser(entitlements) && !entitlements.allowBrokerConnect) {
      return Response.json(
        {
          success: false,
          message: 'Broker connection is not available on your current plan.',
        },
        { status: 403 }
      );
    }

    const { data: brokerRow, error } = await supabaseAdmin
      .from('broker_keys')
      .select('*')
      .eq('user_id', user.id)
      .eq('broker', 'alpaca')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!brokerRow) {
      return Response.json(
        { success: false, message: 'No broker keys found.' },
        { status: 404 }
      );
    }

    const apiKey = decrypt(brokerRow.api_key);
    const apiSecret = decrypt(brokerRow.api_secret);

    const alpacaBaseUrl = brokerRow.is_paper
      ? 'https://paper-api.alpaca.markets'
      : 'https://api.alpaca.markets';
    console.log('Testing broker connection with Alpaca API at', alpacaBaseUrl);
    const testRes = await fetch(`${alpacaBaseUrl}/v2/account`, {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': apiSecret,
      },
    });

    const testedAt = new Date();

    if (!testRes.ok) {
      const errText = await testRes.text();

      await supabaseAdmin
        .from('broker_keys')
        .update({
          connection_status: 'failed',
          last_tested_at: testedAt,
          last_error: errText.slice(0, 1000),
        })
        .eq('id', brokerRow.id);

      return Response.json(
        {
          success: false,
          message: 'Broker connection failed.',
          error: errText,
        },
        { status: 400 }
      );
    }

    const accountData = await testRes.json();

    await supabaseAdmin
      .from('broker_keys')
      .update({
        connection_status: 'connected',
        last_tested_at: testedAt,
        last_error: null,
      })
      .eq('id', brokerRow.id);

    return Response.json({
      success: true,
      message: 'Broker connection healthy.',
      accountStatus: accountData?.status || null,
      tradingBlocked: accountData?.trading_blocked || false,
      isPaper: brokerRow.is_paper,
    });
  } catch (err) {
    console.error('Broker test error:', err);
    return new Response('Failed to test broker connection', { status: 500 });
  }
}