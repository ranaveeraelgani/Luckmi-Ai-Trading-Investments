import {getCtsForSymbol} from '@/app/lib/evaluateAi/evaluateHelpers/getCtsForSymbol';
import { getMomentumState } from '../evaluateHelpers/getMomentumState';
import { getTrendStage } from '../evaluateHelpers/getTrendStage';
import { isFakeBreakout } from '../evaluateHelpers/isFakeBreakout';
  // Smart Sell Decision - Uses real AI call with structured prompt
  export const evaluateSellDecision = async (symbol: string, currentPosition: any, currentPrice: number) => {
    //console.log(`🔍 Evaluating SELL for ${symbol}`);

    try {
      if (currentPrice <= 0) return { shouldSell: false, reason: "Invalid price" };

      const pnl = (currentPrice - currentPosition.entryPrice) * currentPosition.shares;
      const pnlPercent = ((currentPrice - currentPosition.entryPrice) / currentPosition.entryPrice) * 100;

      const indicatorData = await getCtsForSymbol(symbol);
      const ctsScore = indicatorData.ctsScore;
      const recentCloses = indicatorData.recentCloses;
        const momentumState = getMomentumState(indicatorData.macdArr ?? [], indicatorData.signalArr ?? []);
        const trendStage = getTrendStage(indicatorData.closes, Number(indicatorData.ema200));
        const fakeBreakout = isFakeBreakout(indicatorData.closes, indicatorData.volumes);
        // Ai prompt will decide to SELL or HOLD based on CTS, PnL, momentum, and trend context
      const prompt = `You are a disciplined trading risk manager working alongside a systematic trading engine.

The system uses a Confluence Trading Score (CTS) as the primary signal for trend strength.
Your role is to decide whether to EXIT (SELL) or HOLD based on risk, trend strength, and profit protection.

CTS Zones:
- 85+: Very Strong Trend (hold unless clear reversal)
- 75–84: Strong Trend (hold, consider partial profit if extended)
- 65–74: Moderate (monitor closely)
- 55–64: Weak (consider exit if no momentum)
- Below 55: Bearish (exit preferred)

Current Position:
Stock: ${symbol}
Entry Price: $${currentPosition.entryPrice.toFixed(2)}
Current Price: $${currentPrice.toFixed(2)}
Unrealized P&L: $${pnl.toFixed(2)} (${pnlPercent.toFixed(1)}%)
CTS Score: ${ctsScore}
- Momentum State: ${momentumState}
- Trend Stage: ${trendStage}

Guidelines:
1. Always start reasoning with CTS score and its zone.
2. CTS is the PRIMARY trend signal:
   - If CTS < 55 → bias toward SELL
   - If CTS > 75 → bias toward HOLD (let winner run)
3. Protect capital:
   - If PnL ≤ -6% and CTS is weak → SELL
4. Protect profits:
   - If strong profit (>8–12%) AND momentum weakens → SELL
5. Do NOT sell strong trends too early:
   - High CTS + positive PnL → HOLD unless clear reversal
6. Only recommend HOLD if trend and structure still justify staying in.

IMPORTANT:
- "accelerating_up" = strong continuation
- "slowing_up" = weakening trend
- "rolling_over" = high probability reversal
- "late_trend" = risk of exhaustion
- Avoid buying in late_trend unless strong breakout confirmation
- Be cautious of fake breakouts (price breakout without volume)

Format exactly:
ACTION: Sell or Hold
REASON: [2-3 sentences. Must start with CTS score and zone for ${symbol}, then justify decision with PnL + trend context.]
CONFIDENCE: [0-100]

      Decide now.`;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
      });

      let text = await res.text();
      const textClean = text.trim().replace(/\s+/g, ' ');

      const actionMatch = textClean.match(/ACTION:\s*(Sell|Hold)/i);
      const reasonMatch = textClean.match(/REASON:\s*(.+?)(?=CONFIDENCE:|$)/is);
      const confMatch = textClean.match(/CONFIDENCE:\s*(\d+)/i);

      const action = actionMatch ? actionMatch[1] : 'Hold';
      const reason = reasonMatch ? reasonMatch[1].trim() : '';
      const confidence = confMatch ? Number(confMatch[1]) : 50;

        let sellScore = 0;

        // ❌ HARD STOP LOSS
        if (pnlPercent <= -6) {
            sellScore += 80;
        }

        // 📉 CTS weakness
        if (ctsScore < 50) {
            sellScore += 40;
        }

        // 📉 Momentum turning down
        if (momentumState === "slowing_down") {
            sellScore += 25;
        }

        // 📉 Trend weakening
        if (trendStage === "late_trend") {
            sellScore += 20;
        }

        // === STATES ===
        const isTrendStrong =
            trendStage === "early_trend" &&
            momentumState === "accelerating_up";

        const isHealthyPullback =
            momentumState === "slowing_up" &&
            trendStage !== "late_trend";

        const isExhaustion =
            momentumState === "slowing_up" &&
            trendStage === "late_trend";

        // 📈 STRUCTURE CHECK
        const makingHigherHighs =
            recentCloses.length >= 3 &&
            recentCloses.slice(-3).every((v: number, i: number, arr: number[]) =>
                i === 0 || v > arr[i - 1]
            );

        if (makingHigherHighs) {
            sellScore -= 5;
        }

        // 🚨 FAKE BREAKOUT
        if (fakeBreakout) {
            sellScore += 40;
        }

        // 💰 EARLY PROFIT (6–12%)
        if (pnlPercent >= 6 && pnlPercent < 12) {
            if (isHealthyPullback) {
                sellScore += 10;
            }
        }

        // 💰 MAIN PROFIT (12%+)
        if (pnlPercent >= 12) {

            if (isTrendStrong) {
                sellScore -= 10;
            }
            else if (isHealthyPullback) {
                sellScore += 15;
            }
            else if (isExhaustion) {
                sellScore += 30;
            }
        }
        
        const shouldSell = sellScore >= 50;
        const ctsBreakdown = indicatorData.breakdown;
      //console.log(`Sell Decision for ${symbol}: ${action} (Confidence: ${confidence})`);

      return {
        shouldSell,
        reason,
        confidence,
        ctsScore, 
        sellScore,
        ctsBreakdown
      };

    } catch (err) {
      console.error(`Sell evaluation failed for ${symbol}`, err);
      return { shouldSell: false, reason: "Evaluation error" };
    }
  };