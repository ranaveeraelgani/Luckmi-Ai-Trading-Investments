// ============================================================
// Luckmi Options — AI recommendation layer
//
// Uses the same /api/chat route (gpt-4o-mini) as stock analysis.
// AI explains and validates; it does NOT drive the score.
// All score inputs are pre-computed deterministically before this runs.
// ============================================================

import type { OptionsOpportunity } from './types';
import { getBaseUrl } from '@/app/lib/utils/get-base-url';

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

IMPORTANT: This recommendation may be used in an automated trading system.
Use "Avoid" ONLY for clear hard invalidation or severe risk (earnings imminent, elevated IV unfavorable, technical breakdown).
Use "Watch" for uncertainty or mixed signals — NOT to block a trade.

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
IV Rank: ${opp.ivRank}% (debit spreads prefer < 45)
GEX Bias: ${opp.gexBias} | Flow: ${opp.flowSummary} | Structure: ${opp.structureSummary}
Invalidation: ${opp.invalidationCondition}

=== SCORING SCALE ===
80+: High conviction | 65-79: Solid | 50-64: Caution | <50: Weak

=== OUTPUT (respond with ONLY valid JSON, no extra text) ===
{
  "action": "Enter" | "Watch" | "Avoid",
  "strategy": "<1 sentence on recommended approach or size>",
  "reason": "<max 4 sentences: 1 flow/structure, 2 IV context, 3 main risk, 4 what must happen>",
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
        const validActions = ['Enter', 'Watch', 'Avoid'];
        parsed = {
          action: validActions.includes(obj.action) ? (obj.action as 'Enter' | 'Watch' | 'Avoid') : 'Watch',
          strategy: String(obj.strategy ?? '').trim() || strategyLabel,
          reason: String(obj.reason ?? '').trim() || 'No reasoning provided.',
          confidence: Math.min(100, Math.max(0, Math.round(Number(obj.confidence) || 50))),
          riskFlags: Array.isArray(obj.riskFlags)
            ? obj.riskFlags.map(String).map((s: string) => s.trim()).filter(Boolean)
            : [],
        };
      }
    } catch {
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
        parsed = {
          action: actionMatch[1] as 'Enter' | 'Watch' | 'Avoid',
          strategy: stratMatch ? stratMatch[1].trim() : strategyLabel,
          reason: reasonMatch ? reasonMatch[1].trim() : 'No reasoning provided.',
          confidence: confMatch ? Math.min(100, Math.max(0, parseInt(confMatch[1]))) : 50,
          riskFlags: flagsMatch && flagsMatch[1].trim().toLowerCase() !== 'none'
            ? flagsMatch[1].split(',').map(f => f.trim()).filter(Boolean)
            : [],
        };
      }
    }

    return parsed;
  } catch (err) {
    console.error('[getOptionsAiRecommendation] error:', err);
    return null;
  }
}
