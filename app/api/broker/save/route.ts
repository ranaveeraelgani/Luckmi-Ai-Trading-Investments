import { createClient } from '@/app/lib/supabaseServer';
import { supabaseAdmin } from '@/app/lib/supabaseAdmin';
import { encrypt } from '@/app/lib/crypto/encrypt';
import { getEntitlements, isEnforcedForUser } from '@/app/lib/subscriptions/getEntitlements';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const profileEmail = user.email || null;
    const profilePhone = String(user.user_metadata?.phone || '').trim() || null;
    const profileName =
      (user.user_metadata?.full_name as string | undefined) ||
      (user.user_metadata?.name as string | undefined) ||
      profileEmail;

    const { error: profileUpsertError } = await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          user_id: user.id,
          email: profileEmail,
          full_name: profileName,
          phone: profilePhone,
        },
        { onConflict: 'user_id' }
      );

    if (profileUpsertError) {
      throw profileUpsertError;
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

    const body = await req.json();

    const broker = String(body.broker || 'alpaca');
    const apiKey = String(body.apiKey || '').trim();
    const apiSecret = String(body.apiSecret || '').trim();
    const isPaper = !!body.isPaper;

    if (!apiKey || !apiSecret) {
      return Response.json(
        { success: false, message: 'API key and secret are required.' },
        { status: 400 }
      );
    }

    const encryptedApiKey = encrypt(apiKey);
    const encryptedApiSecret = encrypt(apiSecret);

    const { data: existing } = await supabaseAdmin
      .from('broker_keys')
      .select('id')
      .eq('user_id', user.id)
      .eq('broker', broker)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabaseAdmin
        .from('broker_keys')
        .update({
          api_key: encryptedApiKey,
          api_secret: encryptedApiSecret,
          is_paper: isPaper,
          connection_status: 'unknown',
          last_tested_at: null,
          last_error: null,
        })
        .eq('id', existing.id);

      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin
        .from('broker_keys')
        .insert({
          user_id: user.id,
          broker,
          api_key: encryptedApiKey,
          api_secret: encryptedApiSecret,
          is_paper: isPaper,
          connection_status: 'unknown',
          last_tested_at: null,
          last_error: null,
          created_at: new Date(),
        });

      if (error) throw error;
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error('Broker save error:', err);
    return new Response('Failed to save broker keys', { status: 500 });
  }
}