// ============================================================
// Luckmi Options — AI recommendation layer
//
// Uses the same /api/chat route (gpt-4o-mini) as stock analysis.
// AI explains and validates; it does NOT drive the score.
// All score inputs are pre-computed deterministically before this runs.
// ============================================================

import type { OptionsOpportunity } from './types';
import { getBaseUrl } from '@/app/lib/utils/get-base-url';

type CachedOptionsAiResult = {
  result: OptionsAiResult;
  cachedAtMs: number;
};

const OPTIONS_AI_CACHE_TTL_MS = 25 * 60 * 1000;
const optionsAiCache = new Map<string, CachedOptionsAiResult>();

function normalizeText(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function buildOptionsAiCacheKey(
  opp: Pick<
    OptionsOpportunity,
    | 'symbol'
    | 'direction'
    | 'strategy'
    | 'score'
    | 'longLeg'
    | 'shortLeg'
    | 'netDebit'
    | 'maxGain'
    | 'maxLoss'
    | 'riskRewardRatio'
    | 'dteBucket'
    | 'ivRank'
    | 'gexBias'
    | 'flowSummary'
    | 'structureSummary'
    | 'invalidationCondition'
  >
) {
  return JSON.stringify({
    symbol: normalizeText(opp.symbol),
    direction: normalizeText(opp.direction),
    strategy: normalizeText(opp.strategy),
    finalScore: Number(opp.score?.finalScore ?? 0),
    flowScore: Number(opp.score?.flowScore ?? 0),
    structureScore: Number(opp.score?.structureScore ?? 0),
    volatilityFitScore: Number(opp.score?.volatilityFitScore ?? 0),
    executionQualityScore: Number(opp.score?.executionQualityScore ?? 0),
    longLeg: {
      strike: Number(opp.longLeg?.strike ?? 0),
      expiry: normalizeText(opp.longLeg?.expiry),
      optionType: normalizeText(opp.longLeg?.optionType),
    },
    shortLeg: opp.shortLeg
      ? {
          strike: Number(opp.shortLeg.strike ?? 0),
          expiry: normalizeText(opp.shortLeg.expiry),
          optionType: normalizeText(opp.shortLeg.optionType),
        }
      : null,
    netDebit: Number(opp.netDebit ?? 0),
    maxGain: Number(opp.maxGain ?? 0),
    maxLoss: Number(opp.maxLoss ?? 0),
    riskRewardRatio: Number(opp.riskRewardRatio ?? 0),
    dteBucket: Number(opp.dteBucket ?? 0),
    ivRank: Number(opp.ivRank ?? 0),
    gexBias: normalizeText(opp.gexBias),
    flowSummary: normalizeText(opp.flowSummary),
    structureSummary: normalizeText(opp.structureSummary),
    invalidationCondition: normalizeText(opp.invalidationCondition),
  });
}

export type OptionsAiResult = {
  action: 'Enter' | 'Watch' | 'Avoid';
  strategy: string;
  reason: string;
  confidence: number;
  riskFlags: string[];
};

export async function getOptionsAiRecommendation(
  opp: Pick<
    OptionsOpportunity,
    | 'symbol'
    | 'direction'
    | 'strategy'
    | 'score'
    | 'longLeg'
    | 'shortLeg'
    | 'netDebit'
    | 'maxGain'
    | 'maxLoss'
    | 'riskRewardRatio'
    | 'dteBucket'
    | 'ivRank'
    | 'gexBias'
    | 'flowSummary'
    | 'structureSummary'
    | 'invalidationCondition'
  >
): Promise<OptionsAiResult | null> {
  try {
    const cacheKey = buildOptionsAiCacheKey(opp);
    const nowMs = Date.now();
    const cached = optionsAiCache.get(cacheKey);

    if (cached && nowMs - cached.cachedAtMs <= OPTIONS_AI_CACHE_TTL_MS) {
      return cached.result;
    }

    const baseUrl = getBaseUrl();
    const chatApiUrl = `${baseUrl}/api/chat`;

    const strategyLabel = opp.strategy === 'call_debit_spread'
      ? 'Call Debit Spread (bullish)'
      : opp.strategy === 'put_debit_spread'
      ? 'Put Debit Spread (bearish)'
      : opp.strategy === 'long_call'
      ? 'Long Call (bullish)'
      : 'Long Put (bearish)';

    const longType = opp.longLeg.optionType.toUpperCase();
    const prompt = `
You are an expert options analyst for Luckmi AI. Your job is to VALIDATE a pre-scored options setup.
The numerical score is already calculated — do NOT second-guess the math.
Add context, flag genuine risks, and recommend whether to act.

IMPORTANT — ADVISORY ROLE:
Your recommendation is advisory. The deterministic OCS score and execution policy control whether a trade executes.
- "Avoid" at confidence >= 65 will BLOCK execution. Use it only for genuine hard stops.
- "Watch" at any confidence is non-blocking — use it for mixed or building setups.
- "Enter" at confidence >= 70 is a positive advisory signal; the system applies its own score/policy filters.
- Default to "Watch" over "Avoid" unless there is a clear hard invalidation condition.

Hard stops that justify "Avoid" (high confidence):
- Earnings event within 2 days
- IV Rank > 80 for debit spreads (premium destruction risk)
- Technical breakdown below long strike
- Contract liquidity extremely poor (OI < 50 or bid-ask > 20%)

=== SETUP ===
Symbol: ${opp.symbol}
Direction: ${opp.direction}
Strategy: ${strategyLabel}
Long leg: Buy $${opp.longLeg.strike} ${longType} expiring ${opp.longLeg.expiry}
${opp.shortLeg ? `Short leg: Sell $${opp.shortLeg.strike} ${longType} expiring ${opp.shortLeg.expiry}` : 'Short leg: None (single-leg)'}
DTE Bucket: ${opp.dteBucket} days
Net Debit: $${opp.netDebit.toFixed(2)} per spread
Max Gain: $${opp.maxGain.toFixed(2)} | Max Loss: $${opp.maxLoss.toFixed(2)} | R/R: ${opp.riskRewardRatio.toFixed(2)}:1

=== LUCKMI SCORES ===
OCS: ${opp.score.finalScore}/100 (Flow ${opp.score.flowScore} · Structure ${opp.score.structureScore} · VolFit ${opp.score.volatilityFitScore} · Exec ${opp.score.executionQualityScore})

=== MARKET CONTEXT ===
IV Rank: ${opp.ivRank}% (debit spreads prefer < 45; 45-65 = elevated; > 65 = expensive)
GEX Bias: ${opp.gexBias} | Flow: ${opp.flowSummary} | Structure: ${opp.structureSummary}
Invalidation: ${opp.invalidationCondition}

=== DECISION GUIDE ===
1. OCS >= 70 AND (flow >= 70 OR structure >= 70) AND IV < 65 → Enter (strong confluence)
2. OCS >= 65 AND flow >= 65 AND no hard stop → Enter (solid early signal)
3. OCS 50-64 OR mixed signals → Watch (setup building, not confluent yet)
4. OCS < 50 OR hard stop condition present → Avoid

=== CONFIDENCE RUBRIC ===
- 80-100: All key criteria met, strong confluence, clear entry window
- 65-79: Good setup, one mixed condition, tradable
- 50-64: Uncertain or elevated risk; use Watch
- <50: Multiple risk factors; use Avoid only if a hard stop exists

=== OUTPUT (respond with ONLY valid JSON, no extra text) ===
{
  "action": "Enter" | "Watch" | "Avoid",
  "strategy": "<1 sentence on recommended approach or sizing note>",
  "reason": "<max 4 sentences. Must mention ${opp.symbol}, the long strike ${opp.longLeg.strike}, and expiry ${opp.longLeg.expiry}. Include 1 flow/structure point, 1 IV point, 1 main risk, and 1 trigger condition>",
  "confidence": <integer 0-100>,
  "riskFlags": ["<short phrase>"] or []
}
`;

    const res = await fetch(chatApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
    });

    if (!res.ok) throw new Error(`Chat API error: ${res.status}`);

    let text = '';
    try {
      const data = await res.json();
      text = data.content || data.message || data.text || '';
    } catch {
      text = await res.text();
    }

    // Parse strict JSON output; fall back to regex for legacy free-text
    let parsed: OptionsAiResult | null = null;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const obj = JSON.parse(jsonMatch[0]);
        const actionStr = String(obj.action ?? '').trim().toLowerCase();
        const validActions: Record<string, 'Enter' | 'Watch' | 'Avoid'> = {
          'enter': 'Enter',
          'watch': 'Watch',
          'avoid': 'Avoid',
        };
        const action = validActions[actionStr] || null;
        
        if (!action) {
          console.warn(
            `[getOptionsAiRecommendation] ${opp.symbol}: invalid action="${obj.action}" in JSON; falling back to Watch`
          );
        }
        
        parsed = {
          action: action || 'Watch',
          strategy: String(obj.strategy ?? '').trim() || strategyLabel,
          reason: String(obj.reason ?? '').trim() || 'No reasoning provided.',
          confidence: Math.min(100, Math.max(0, Math.round(Number(obj.confidence) || 50))),
          riskFlags: Array.isArray(obj.riskFlags)
            ? obj.riskFlags.map(String).map((s: string) => s.trim()).filter(Boolean)
            : [],
        };
      } else {
        console.warn(
          `[getOptionsAiRecommendation] ${opp.symbol}: no JSON object found in response. First 200 chars: ${text.slice(0, 200)}`
        );
      }
    } catch (jsonErr) {
      console.warn(
        `[getOptionsAiRecommendation] ${opp.symbol}: JSON parse failed. Error: ${String(jsonErr)}. First 200 chars: ${text.slice(0, 200)}`
      );
      parsed = null;
    }

    // Regex fallback if JSON parse failed
    if (!parsed) {
      const clean = text.trim().replace(/\s+/g, ' ');
      const actionMatch = clean.match(/ACTION:\s*(Enter|Watch|Avoid)/i);
      const stratMatch = clean.match(/STRATEGY:\s*(.+?)(?=REASON:|$)/is);
      const reasonMatch = clean.match(/REASON:\s*(.+?)(?=CONFIDENCE:|$)/is);
      const confMatch = clean.match(/CONFIDENCE:\s*(\d+)/i);
      const flagsMatch = clean.match(/RISK FLAGS:\s*(.+?)$/i);
      if (actionMatch) {
        const actionStr = actionMatch[1].toLowerCase();
        const validActions: Record<string, 'Enter' | 'Watch' | 'Avoid'> = {
          'enter': 'Enter',
          'watch': 'Watch',
          'avoid': 'Avoid',
        };
        parsed = {
          action: validActions[actionStr] || 'Watch',
          strategy: stratMatch ? stratMatch[1].trim() : strategyLabel,
          reason: reasonMatch ? reasonMatch[1].trim() : 'No reasoning provided.',
          confidence: confMatch ? Math.min(100, Math.max(0, parseInt(confMatch[1]))) : 50,
          riskFlags: flagsMatch && flagsMatch[1].trim().toLowerCase() !== 'none'
            ? flagsMatch[1].split(',').map(f => f.trim()).filter(Boolean)
            : [],
        };
      } else {
        console.warn(
          `[getOptionsAiRecommendation] ${opp.symbol}: regex fallback also failed. Text: ${text.slice(0, 200)}`
        );
      }
    }

    if (parsed) {
      // Keep reasons contract-specific so cards do not look duplicated.
      if (!parsed.reason.toUpperCase().includes(opp.symbol.toUpperCase())) {
        parsed.reason = `${opp.symbol}: ${parsed.reason}`;
      }

      optionsAiCache.set(cacheKey, { result: parsed, cachedAtMs: nowMs });
    }

    return parsed;
  } catch (err) {
    console.error('[getOptionsAiRecommendation] error:', err);
    return null;
  }
}
