import {getCtsForSymbol} from '@/app/lib/evaluateAi/evaluateHelpers/getCtsForSymbol';
import {getNoTradeReasons} from '@/app/lib/evaluateAi/evaluateHelpers/getNoTradeReasons';
import { getTrendStage } from '../evaluateHelpers/getTrendStage';
import { getMomentumState } from '../evaluateHelpers/getMomentumState';
import { isFakeBreakout } from '../evaluateHelpers/isFakeBreakout';

// Final evaluateStockForBuy - Rich Prompt + Early Cash Check
export const evaluateStockForBuy = async (symbol: string, autoStocks: any[], currentPrice: number) => {
    //console.log(`🔍 Evaluating BUY for ${symbol}`);

    try {
        //console.log(`Checking cash availability for ${symbol} at price $${currentPrice.toFixed(2)}...`, autoStocks);
        if (currentPrice <= 0) return { shouldBuy: false, reason: "Invalid price" };

        const autoStock = autoStocks.find((s: any) => s.symbol === symbol);
        if (!autoStock) return { shouldBuy: false, reason: "Stock not found" };

        const investedSoFar = (autoStock.currentPosition?.shares || 0) * (autoStock.currentPosition?.entryPrice || 0);
        const availableCash = (autoStock.allocation || 0) - investedSoFar;

        if (availableCash < currentPrice) {
            //console.log(`Skipping AI for ${symbol} - insufficient cash`);
            return { shouldBuy: false, reason: "Insufficient remaining cash" };
        }

        const indicatorData = await getCtsForSymbol(symbol);
        const ctsScore = indicatorData.ctsScore;
        const lastRSI = indicatorData.rsi;
        const lastMACD = indicatorData.macd;
        const lastSignal = indicatorData.signal;
        const ema200 = indicatorData.ema200;
        const recentCloses = indicatorData.recentCloses;

        const customGuidance = autoStock.customGuidance || "No special instruction.";
        const momentumState = getMomentumState(indicatorData.macdArr ?? [], indicatorData.signalArr ?? []);
        const trendStage = getTrendStage(indicatorData.closes, Number(indicatorData.ema200));
        console.log('trendStage', trendStage, indicatorData.closes.slice(-10), indicatorData.ema200);
        const fakeBreakout = isFakeBreakout(indicatorData.closes, indicatorData.volumes);
        // log all indicators for debugging
        //console.log(`Indicators for ${symbol} - CTS: ${ctsScore}, RSI: ${lastRSI}, MACD: ${lastMACD}, Signal: ${lastSignal}, EMA200: ${ema200}, Momentum: ${momentumState}, Trend: ${trendStage}, Fake Breakout: ${fakeBreakout}`);
        const prompt = `You are a disciplined trading analyst assisting a systematic trading engine.

The system already uses a Confluence Trading Score (CTS) to determine position sizing.
Your role is NOT to decide position size, but to VALIDATE or BLOCK trades based on risk and context.

CTS Zones (PRIMARY DRIVER):
- 85+: Very Strong (large position)
- 75–84: Strong (medium-large position)
- 65–74: Moderate (medium position)
- 55–64: Weak (small starter)
- Below 55: Avoid

Your Responsibilities:
1. Start by stating the CTS score and its zone for ${symbol}.
2. Do NOT override CTS unless there is a strong, clear risk.
3. Only recommend HOLD if there is a meaningful reason:
   - Weak or deteriorating momentum
   - Bearish MACD or RSI divergence
   - Price below 200 EMA (weak trend)
   - Choppy or unstable price action
   - Any risk from user guidance
4. If CTS is strong (75+), default to BUY unless there is a clear red flag.
5. Be decisive but not overly cautious.

Current Data:
Stock: ${symbol}
CTS Score: ${ctsScore}
Price: $${currentPrice.toFixed(2)}
RSI: ${lastRSI}
MACD: ${lastMACD} (Signal: ${lastSignal})
200 EMA: ${ema200}
Recent closes: ${recentCloses}
User Guidance: ${customGuidance}
Position Status: ${autoStock.currentPosition ? 'Already in position (considering add)' : 'New position'}
Momentum State: ${momentumState}
Trend Stage: ${trendStage}
Fake Breakout Risk: ${fakeBreakout ? 'Yes' : 'No'}

IMPORTANT:
- "accelerating_up" = strong continuation
- "slowing_up" = weakening trend
- "rolling_over" = high probability reversal
- "late_trend" = risk of exhaustion
- Avoid buying in late_trend unless strong breakout confirmation
- Be cautious of fake breakouts (price breakout without volume)

Format exactly:
ACTION: Buy or Hold
REASON: [2-3 sentences. Start with CTS score and zone, then validate or flag risks.]
TRADE THESIS: [1 sentence]
CONFIDENCE: [0-100]

      Decide now.`;

        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
        });

        let text = await res.text();
        const textClean = text.trim().replace(/\s+/g, ' ');

        const actionMatch = textClean.match(/ACTION:\s*(Buy|Hold)/i);
        const reasonMatch = textClean.match(/REASON:\s*(.+?)(?=TRADE THESIS:|CONFIDENCE:|$)/is);
        const thesisMatch = textClean.match(/TRADE THESIS:\s*(.+?)(?=CONFIDENCE:|$)/is);
        const confMatch = textClean.match(/CONFIDENCE:\s*(\d+)/i);

        const action = actionMatch ? actionMatch[1] : 'Hold';
        const reason = reasonMatch ? reasonMatch[1].trim() : '';
        const thesis = thesisMatch ? thesisMatch[1].trim() : 'Strong confluence detected.';
        const confidence = confMatch ? Number(confMatch[1]) : 60;

        let buyScore = 0;

        if (ctsScore >= 65) {
            buyScore += 50; // baseline confidence

            if (momentumState === "accelerating_up") buyScore += 20;
            if (trendStage === "early_trend") buyScore += 15;
            if (trendStage === "late_trend") buyScore -= 15;
            if (momentumState === "slowing_up") buyScore -= 10;
            if (fakeBreakout) buyScore -= 40;
            if (trendStage === "neutral") {
                buyScore -= 10; // or mild penalty
            }
        }

        // Final decision
        const shouldBuy = buyScore >= 50;
        const breakdown = indicatorData.breakdown;
        //console.log(`AI Decision for ${symbol}: ${action} (CTS: ${ctsScore}, Confidence: ${confidence})`);
        const noTradeReasons = getNoTradeReasons(
            ctsScore,
            Number(lastRSI),
            Number(lastMACD)
        );
        return {
            shouldBuy,
            entryPrice: shouldBuy ? currentPrice : undefined,
            thesis: thesis.substring(0, 200),
            confidence,
            ctsScore,
            breakdown,
            noTradeReasons
        };

    } catch (err) {
        console.error(`Buy evaluation failed for ${symbol}`, err);
        return { shouldBuy: false, reason: "Evaluation error" };
    }
};
// Sm