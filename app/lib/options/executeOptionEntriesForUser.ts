import { supabaseAdmin } from '@/app/lib/supabaseAdmin';
import { getUserBrokerCredentials } from '@/app/lib/broker/getUserBrokerCredentials';
import { getAlpacaOptionContractBySymbol } from '@/app/lib/broker/alpaca';
import { placeOptionsBrokerEntry } from '@/app/lib/options/placeOptionsBrokerEntry';
import type { OptionsOpportunity } from '@/app/lib/options/types';

type BrokerCredentials = {
  apiKey: string;
  apiSecret: string;
  isPaper: boolean;
};

type OptionEntryPolicy = {
  maxLossPerTrade: number;
  maxOpenPositions: number;
  minScoreThreshold: number;
  maxEntriesPerRun: number;
};

type ExecuteOptionEntriesParams = {
  userId: string;
  opportunities: OptionsOpportunity[];
  policy: OptionEntryPolicy;
  minScoreFloor: number;
  aiSource: 'auto_entry' | 'manual';
};

export type ExecuteOptionEntriesResult = {
  attempted: number;
  placed: number;
  executableCandidates: number;
  nonExecutableRejected: number;
  skippedReason?: string;
};

async function recordEntryDeclinedInsufficientFunds(params: {
  userId: string;
  opportunity: OptionsOpportunity;
  executionMode: 'paper' | 'live';
  availableBuyingPower: number;
  requiredCost: number;
}) {
  const nowIso = new Date().toISOString();
  const symbol = params.opportunity.symbol.toUpperCase();
  const reason = `Auto-entry skipped: insufficient options buying power. Required $${params.requiredCost.toFixed(2)}, available $${params.availableBuyingPower.toFixed(2)}.`;

  const { data: existing } = await supabaseAdmin
    .from('option_paper_trades')
    .select('id')
    .eq('user_id', params.userId)
    .eq('symbol', symbol)
    .eq('status', 'closed')
    .eq('broker_status', 'entry_skipped_insufficient_funds')
    .gte('exit_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
    .limit(1)
    .maybeSingle();

  if (existing?.id) return;

  const { data: tradeRow, error: tradeError } = await supabaseAdmin
    .from('option_paper_trades')
    .insert({
      user_id: params.userId,
      symbol,
      direction: params.opportunity.direction,
      strategy: params.opportunity.strategy,
      long_strike: params.opportunity.longLeg.strike,
      long_expiry: params.opportunity.longLeg.expiry,
      short_strike: params.opportunity.shortLeg?.strike ?? null,
      short_expiry: params.opportunity.shortLeg?.expiry ?? null,
      option_type: params.opportunity.longLeg.optionType,
      net_debit: params.opportunity.netDebit,
      max_gain: params.opportunity.maxGain ?? null,
      max_loss: params.opportunity.maxLoss ?? null,
      entry_score: params.opportunity.score.finalScore,
      entry_spot_price: null,
      qty_contracts: 1,
      execution_mode_snapshot: params.executionMode,
      broker_status: 'entry_skipped_insufficient_funds',
      status: 'closed',
      entry_at: nowIso,
      exit_at: nowIso,
      notes: reason,
    })
    .select('id')
    .single();

  if (tradeError || !tradeRow?.id) {
    console.warn(`[options-auto-entry] failed to record insufficient-funds decline for ${symbol}: ${tradeError?.message ?? 'unknown error'}`);
    return;
  }

  if (params.opportunity.aiAction) {
    try {
      await supabaseAdmin.from('ai_decisions').insert({
        user_id: params.userId,
        symbol,
        action: params.opportunity.aiAction,
        reason: params.opportunity.aiReason ?? null,
        confidence: params.opportunity.aiConfidence ?? null,
        option_trade_id: tradeRow.id,
        option_strategy: params.opportunity.strategy,
        option_direction: params.opportunity.direction,
        ocs_score: params.opportunity.score.finalScore,
        risk_flags: params.opportunity.aiRiskFlags?.length ? params.opportunity.aiRiskFlags : null,
        created_at: nowIso,
      });
    } catch (err: any) {
      console.warn(`[options-auto-entry] failed to attach ai_decision to declined entry ${symbol}: ${err?.message ?? err}`);
    }
  }
}

function buildOccSymbol(underlying: string, expiry: string, optionType: 'call' | 'put', strike: number): string {
  const d = expiry.replace(/-/g, '');
  const ymd = d.length === 8 ? d.slice(2) : d;
  const cp = optionType === 'call' ? 'C' : 'P';
  const strikePadded = Math.round(strike * 1000).toString().padStart(8, '0');
  return `${underlying.toUpperCase()}${ymd}${cp}${strikePadded}`;
}

async function isOccContractExecutable(
  credentials: BrokerCredentials,
  occSymbol: string,
  cache: Map<string, boolean>,
): Promise<boolean> {
  const key = `${credentials.isPaper ? 'paper' : 'live'}|${occSymbol}`;
  const hit = cache.get(key);
  if (typeof hit === 'boolean') return hit;

  try {
    const contract = await getAlpacaOptionContractBySymbol(credentials, occSymbol);
    const status = String(contract?.status ?? '').toLowerCase();
    const ok = status ? status === 'active' : true;
    cache.set(key, ok);
    return ok;
  } catch {
    cache.set(key, false);
    return false;
  }
}

async function countOpenTrades(userId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from('option_paper_trades')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'open');
  return count ?? 0;
}

async function getOpenTradeSymbols(userId: string): Promise<Set<string>> {
  const { data } = await supabaseAdmin
    .from('option_paper_trades')
    .select('symbol')
    .eq('user_id', userId)
    .eq('status', 'open');
  return new Set((data ?? []).map((r: { symbol: string }) => r.symbol.toUpperCase()));
}

async function getOptionsBuyingPower(userId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from('broker_accounts')
    .select('options_buying_power')
    .eq('user_id', userId)
    .order('last_synced_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return Number(data?.options_buying_power ?? 0);
}

export async function executeOptionEntriesForUser(
  params: ExecuteOptionEntriesParams,
): Promise<ExecuteOptionEntriesResult> {
  const { userId, opportunities, policy, minScoreFloor, aiSource } = params;

  const openCount = await countOpenTrades(userId);
  const slotsAvailable = Math.max(0, policy.maxOpenPositions - openCount);
  if (slotsAvailable === 0) {
    return {
      attempted: 0,
      placed: 0,
      executableCandidates: 0,
      nonExecutableRejected: 0,
      skippedReason: 'no open slots',
    };
  }

  const buyingPower = await getOptionsBuyingPower(userId);
  if (buyingPower > 0 && buyingPower < policy.maxLossPerTrade) {
    return {
      attempted: 0,
      placed: 0,
      executableCandidates: 0,
      nonExecutableRejected: 0,
      skippedReason: 'insufficient options buying power',
    };
  }

  const openSymbols = await getOpenTradeSymbols(userId);
  const minScore = Math.max(policy.minScoreThreshold, minScoreFloor);
  const maxEntriesThisRun = Math.min(policy.maxEntriesPerRun, slotsAvailable);
  const now = new Date();

  const eligible = opportunities
    .filter((o) => {
      if (o.score.finalScore < minScore) return false;
      if (o.netDebit * 100 > policy.maxLossPerTrade) return false;
      if (o.status !== 'active') return false;
      if (new Date(o.expiresAt) <= now) return false;
      if (openSymbols.has(o.symbol.toUpperCase())) return false;
      if (o.aiAction === 'Avoid' && (o.aiConfidence ?? 100) >= 65) return false;
      return true;
    })
    .sort((a, b) => b.score.finalScore - a.score.finalScore)
    .slice(0, maxEntriesThisRun);

  if (eligible.length === 0) {
    return {
      attempted: 0,
      placed: 0,
      executableCandidates: 0,
      nonExecutableRejected: 0,
      skippedReason: 'no eligible opportunities met score/cost threshold',
    };
  }

  let credentials: BrokerCredentials;
  try {
    credentials = await getUserBrokerCredentials(userId);
  } catch {
    return {
      attempted: eligible.length,
      placed: 0,
      executableCandidates: 0,
      nonExecutableRejected: 0,
      skippedReason: 'broker credentials unavailable for executable contract check',
    };
  }

  const executableCache = new Map<string, boolean>();
  const executableEligible: Array<{
    opp: OptionsOpportunity;
    longOccSymbol: string;
    shortOccSymbol: string | null;
  }> = [];
  let nonExecutableRejected = 0;

  for (const opp of eligible) {
    const longOccSymbol = buildOccSymbol(opp.symbol, opp.longLeg.expiry, opp.longLeg.optionType, opp.longLeg.strike);
    const shortOccSymbol = opp.shortLeg
      ? buildOccSymbol(opp.symbol, opp.shortLeg.expiry, opp.shortLeg.optionType, opp.shortLeg.strike)
      : null;

    const longOk = await isOccContractExecutable(credentials, longOccSymbol, executableCache);
    if (!longOk) {
      nonExecutableRejected++;
      continue;
    }

    if (shortOccSymbol) {
      const shortOk = await isOccContractExecutable(credentials, shortOccSymbol, executableCache);
      if (!shortOk) {
        nonExecutableRejected++;
        continue;
      }
    }

    executableEligible.push({ opp, longOccSymbol, shortOccSymbol });
  }

  if (executableEligible.length === 0) {
    return {
      attempted: eligible.length,
      placed: 0,
      executableCandidates: 0,
      nonExecutableRejected,
      skippedReason: 'no executable Alpaca contracts among eligible opportunities',
    };
  }

  let placed = 0;
  const placedSymbolsThisCycle = new Set<string>();
  let remainingBuyingPower = buyingPower;
  const hasTrackedBuyingPower = Number.isFinite(buyingPower) && buyingPower > 0;

  for (const item of executableEligible) {
    const opp = item.opp;
    if (placedSymbolsThisCycle.has(opp.symbol.toUpperCase())) continue;

    const requiredCost = opp.netDebit * 100;
    if (hasTrackedBuyingPower && requiredCost > remainingBuyingPower) {
      await recordEntryDeclinedInsufficientFunds({
        userId,
        opportunity: opp,
        executionMode: credentials.isPaper ? 'paper' : 'live',
        availableBuyingPower: remainingBuyingPower,
        requiredCost,
      });
      continue;
    }

    try {
      const result = await placeOptionsBrokerEntry({
        userId,
        symbol: opp.symbol,
        direction: opp.direction,
        strategy: opp.strategy,
        longOccSymbol: item.longOccSymbol,
        shortOccSymbol: item.shortOccSymbol,
        longStrike: opp.longLeg.strike,
        longExpiry: opp.longLeg.expiry,
        shortStrike: opp.shortLeg?.strike ?? null,
        shortExpiry: opp.shortLeg?.expiry ?? null,
        optionType: opp.longLeg.optionType,
        netDebit: opp.netDebit,
        maxGain: opp.maxGain,
        maxLoss: opp.maxLoss,
        entryScore: opp.score.finalScore,
        entrySpotPrice: null,
        qtyContracts: 1,
        aiAction: opp.aiAction as 'Enter' | 'Watch' | 'Avoid' | undefined,
        aiReason: opp.aiReason,
        aiConfidence: opp.aiConfidence,
        aiRiskFlags: opp.aiRiskFlags,
        aiSource,
      });

      if (result.ok) {
        placed++;
        placedSymbolsThisCycle.add(opp.symbol.toUpperCase());
        if (hasTrackedBuyingPower) {
          remainingBuyingPower = Math.max(0, remainingBuyingPower - requiredCost);
        }
      }
    } catch {
      // non-fatal: continue trying remaining opportunities
    }
  }

  return {
    attempted: eligible.length,
    placed,
    executableCandidates: executableEligible.length,
    nonExecutableRejected,
  };
}
