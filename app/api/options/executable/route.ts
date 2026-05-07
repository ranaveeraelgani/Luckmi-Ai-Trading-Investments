import { NextResponse } from 'next/server';
import { createClient } from '@/app/lib/supabaseServer';
import { getUserBrokerCredentials } from '@/app/lib/broker/getUserBrokerCredentials';
import { getAlpacaOptionContractBySymbol } from '@/app/lib/broker/alpaca';

type Candidate = {
  id: string;
  longOccSymbol: string;
  shortOccSymbol?: string | null;
};

const TOP_VALIDATE_COUNT = 30;
const CONTRACT_CACHE_TTL_MS = 60_000;

declare global {
  // eslint-disable-next-line no-var
  var _alpacaContractValidationCache: Map<string, { checkedAt: number; ok: boolean }> | undefined;
}

function getValidationCache() {
  if (!globalThis._alpacaContractValidationCache) {
    globalThis._alpacaContractValidationCache = new Map<string, { checkedAt: number; ok: boolean }>();
  }
  return globalThis._alpacaContractValidationCache;
}

async function validateContract(
  credentials: { apiKey: string; apiSecret: string; isPaper: boolean },
  occSymbol: string,
): Promise<boolean> {
  const cache = getValidationCache();
  const key = `${credentials.isPaper ? 'paper' : 'live'}|${occSymbol}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.checkedAt < CONTRACT_CACHE_TTL_MS) {
    return hit.ok;
  }

  try {
    const contract = await getAlpacaOptionContractBySymbol(credentials, occSymbol);
    const status = String(contract?.status ?? '').toLowerCase();
    const ok = status ? status === 'active' : true;
    cache.set(key, { checkedAt: Date.now(), ok });
    return ok;
  } catch {
    cache.set(key, { checkedAt: Date.now(), ok: false });
    return false;
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: { candidates?: Candidate[] };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const raw = Array.isArray(body.candidates) ? body.candidates : [];
    const candidates = raw
      .filter((c) => c && typeof c.id === 'string' && typeof c.longOccSymbol === 'string')
      .slice(0, TOP_VALIDATE_COUNT);

    if (candidates.length === 0) {
      return NextResponse.json({
        validated: 0,
        executableIds: [],
        skipped: true,
        reason: 'no-candidates',
      });
    }

    let credentials: { apiKey: string; apiSecret: string; isPaper: boolean };
    try {
      credentials = await getUserBrokerCredentials(user.id);
    } catch (err: any) {
      return NextResponse.json({
        validated: candidates.length,
        executableIds: [],
        skipped: true,
        reason: 'broker-not-connected',
        message: err?.message ?? 'Broker not connected',
      });
    }

    const executableIds: string[] = [];

    for (const c of candidates) {
      const longOk = await validateContract(credentials, c.longOccSymbol.toUpperCase());
      if (!longOk) continue;

      if (c.shortOccSymbol) {
        const shortOk = await validateContract(credentials, c.shortOccSymbol.toUpperCase());
        if (!shortOk) continue;
      }

      executableIds.push(c.id);
    }

    return NextResponse.json({
      validated: candidates.length,
      executableIds,
      skipped: false,
      reason: null,
    });
  } catch (err: any) {
    console.error('[options/executable] exception:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
