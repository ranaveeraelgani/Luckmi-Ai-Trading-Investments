// ============================================================
// Luckmi Options — AI recommendation layer
//
// Uses the same /api/chat route (gpt-4o-mini) as stock analysis.
// AI explains and validates; it does NOT drive the score.
// All score inputs are pre-computed deterministically before this runs.
// ============================================================

import type { OptionsOpportunity } from './types';
import { getBaseUrl } from '@/app/lib/utils/get-base-url';

type OptionsAiResult = {
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
      : 'Put Debit Spread (bearish)';

    const longType = opp.longLeg.optionType.toUpperCase();
    const prompt = `
You are an expert options analyst for Luckmi AI. Your job is to VALIDATE a pre-scored options setup and explain it clearly. The numerical score is already calculated — do NOT second-guess the math. Your role is to add context, flag genuine risks, and recommend whether to act.

=== SETUP ===
Symbol: ${opp.symbol}
Direction: ${opp.direction}
Strategy: ${strategyLabel}

Long leg: Buy $${opp.longLeg.strike} ${longType} expiring ${opp.longLeg.expiry}
${opp.shortLeg ? `Short leg: Sell $${opp.shortLeg.strike} ${longType} expiring ${opp.shortLeg.expiry}` : 'Short leg: None (single-leg long option)'}
DTE Bucket: ${opp.dteBucket} days
Net Debit: $${opp.netDebit.toFixed(2)} per spread
Max Gain: $${opp.maxGain.toFixed(2)}
Max Loss: $${opp.maxLoss.toFixed(2)} (the debit paid)
Risk/Reward: ${opp.riskRewardRatio.toFixed(2)}:1

=== LUCKMI SCORES ===
Overall Options Score (OCS): ${opp.score.finalScore}/100
 - Flow Score: ${opp.score.flowScore}/100
 - Structure Score: ${opp.score.structureScore}/100
 - Volatility Fit Score: ${opp.score.volatilityFitScore}/100
 - Execution Quality Score: ${opp.score.executionQualityScore}/100

=== MARKET CONTEXT ===
IV Rank: ${opp.ivRank}% (for debit spreads, lower is better; ideal < 45)
GEX Bias: ${opp.gexBias} (negative = trending environment; positive = pinning)
Flow Summary: ${opp.flowSummary}
Structure Summary: ${opp.structureSummary}
Invalidation: ${opp.invalidationCondition}

=== SCORING SCALE ===
Score 80+: High conviction setup
Score 65-79: Solid setup, worth monitoring
Score 50-64: Mixed signals, caution warranted
Below 50: Weak setup, avoid

=== YOUR OUTPUT FORMAT (strict — no deviation) ===
ACTION: Enter / Watch / Avoid
STRATEGY: [1 sentence on the recommended approach or size adjustment]
REASON: [4 sentences MAX. Sentence 1: summarize flow and structure alignment. Sentence 2: explain IV context for this strategy. Sentence 3: state the main risk. Sentence 4: what must happen for this to work.]
CONFIDENCE: [0-100]
RISK FLAGS: [comma-separated short phrases OR "None"]
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

    const clean = text.trim().replace(/\s+/g, ' ');

    const actionMatch = clean.match(/ACTION:\s*(Enter|Watch|Avoid)/i);
    const strategyMatch = clean.match(/STRATEGY:\s*(.+?)(?=REASON:|$)/is);
    const reasonMatch = clean.match(/REASON:\s*(.+?)(?=CONFIDENCE:|$)/is);
    const confMatch = clean.match(/CONFIDENCE:\s*(\d+)/i);
    const flagsMatch = clean.match(/RISK FLAGS:\s*(.+?)$/i);

    if (!actionMatch) return null;

    return {
      action: actionMatch[1] as 'Enter' | 'Watch' | 'Avoid',
      strategy: strategyMatch ? strategyMatch[1].trim() : strategyLabel,
      reason: reasonMatch ? reasonMatch[1].trim() : 'No reasoning provided.',
      confidence: confMatch ? Math.min(100, Math.max(0, parseInt(confMatch[1]))) : 50,
      riskFlags: flagsMatch && flagsMatch[1].trim().toLowerCase() !== 'none'
        ? flagsMatch[1].split(',').map(f => f.trim()).filter(Boolean)
        : [],
    };
  } catch (err) {
    console.error('[getOptionsAiRecommendation] error:', err);
    return null;
  }
}
