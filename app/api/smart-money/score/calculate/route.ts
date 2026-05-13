import { NextRequest, NextResponse } from 'next/server';
import { calculateSmartMoneyScore } from '@/app/lib/smartMoney/calculateSmartMoneyScore';
import { classifyTier } from '@/app/lib/smartMoney/classifyTier';
import { fetchSmartMoneyInputs } from '@/app/lib/smartMoney/fetchSmartMoneyInputs';
import { createSmartMoneyNarrative } from '@/app/lib/smartMoney/createSmartMoneyNarrative';
import { isSmartMoneyEnabled, smartMoneyError } from '@/app/lib/smartMoney/http';

function asSymbol(raw: string | null): string {
  return String(raw || '')
    .trim()
    .toUpperCase();
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

    const body = await req.json();
    const symbol = asSymbol(body?.symbol);

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

    const tierResult = classifyTier(
      score.ctsScore,
      score.smartMoneyScore,
      score.alignment,
      score.finalConviction,
    );
    const narrative = createSmartMoneyNarrative({
      symbol,
      ctsScore: score.ctsScore,
      smartMoneyScore: score.smartMoneyScore,
      finalConviction: score.finalConviction,
      tier: tierResult.tier,
      alignment: score.alignment,
    });

    return NextResponse.json({
      symbol,
      ctsScore: score.ctsScore,
      alignment: score.alignment,
      smartMoneyScore: score.smartMoneyScore,
      finalConviction: score.finalConviction,
      tier: tierResult.tier,
      tierReason: tierResult.reason,
      isAutoTradingEligible: tierResult.isAutoTradingEligible,
      breakdown: score.breakdown,
      signals: score.signals,
      dataAvailability: score.dataAvailability,
      aiNarrative: narrative.aiNarrative,
      aiConfidence: narrative.aiConfidence,
      generatedAt: score.generatedAt,
      ctsMeta: inputs.ctsMeta,
    });
  } catch (error) {
    console.error('[smart-money/score/calculate] error:', error);
    return smartMoneyError(
      'Failed to calculate smart money score',
      500,
      'INTERNAL_ERROR',
      {
        route: 'smart-money/score/calculate',
      },
    );
  }
}
