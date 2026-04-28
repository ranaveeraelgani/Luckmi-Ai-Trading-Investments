import { evaluateStockForBuy } from '@/app/lib/evaluateAi/evaluateBuy/evaluateStockForBuy';
import { evaluateSellDecision } from '@/app/lib/evaluateAi/evaluateSell/evaluateSellDecision';
import { getSmartPositionSize } from '@/app/lib/evaluateAi/evaluateHelpers/getSmartPositionSize';
import { getSellSizePercent } from '@/app/lib/evaluateAi/evaluateHelpers/getSellSizePercent';
import { getQuotes } from '@/app/lib/quotes/quotes';
// Safe number parsing with fallback
const safeNumber = (val: any, fallback = 0) => {
    const num = Number(val);
    return isNaN(num) ? fallback : num;
};
export async function runTradingEngine(stocks: any[], quotes: any) {
    const updatedStocks = [...stocks];
    let trades: any[] = [];
    let hasChanges = false;

    for (let i = 0; i < updatedStocks.length; i++) {
        const stock = updatedStocks[i];

        const currentPrice = safeNumber(quotes[stock.symbol]?.price);
        if (!currentPrice) continue;

        const now = Date.now();

        // =========================
        // 🔒 PRICE MOVEMENT FILTER
        // =========================
        const isFirstEval = !stock.lastEvaluatedPrice;
        const lastPrice = stock.lastEvaluatedPrice || currentPrice;
        const priceChangePercent = Math.abs(
            ((currentPrice - lastPrice) / lastPrice) * 100
        );

        if (!isFirstEval && stock.status !== 'in-position' && priceChangePercent < 0.3) continue;

        // =========================
        // 🔒 COOLDOWN + FLIP PROTECTION
        // =========================
        const BUY_MORE_COOLDOWN_MS = 15 * 60 * 1000;
        const FLIP_COOLDOWN_MS = 30 * 60 * 1000;

        const lastSellTime = stock.lastSellTime ? new Date(stock.lastSellTime).getTime() : 0;
        const inBuyMoreCooldown = now - lastSellTime < BUY_MORE_COOLDOWN_MS;

        const flipBlocked =
            stock.lastAiDecision?.action === 'Sell' &&
            stock.lastSellTime &&
            now - new Date(stock.lastSellTime).getTime() < FLIP_COOLDOWN_MS;
        console.log(`BuyMore Cooldown: ${inBuyMoreCooldown}, Flip Blocked: ${flipBlocked}`);
        if (flipBlocked && stock.status !== 'in-position') continue;

        // =========================
        // 💰 POSITION DATA
        // =========================
        const investedSoFar =
            (stock.currentPosition?.shares || 0) *
            (stock.currentPosition?.entryPrice || 0);

        const availableCash = (stock.allocation || 0) - investedSoFar;

        // =========================
        // 🟢 CASE 1: IN POSITION
        // =========================
        if (stock.status === 'in-position' && stock.currentPosition) {

            const entryPrice = stock.currentPosition.entryPrice;
            const shares = stock.currentPosition.shares;

            const pnlPercent =
                ((currentPrice - entryPrice) / entryPrice) * 100;

            const prevPeak = stock.currentPosition.peakPrice || currentPrice;
            const prevPeakPnL = stock.currentPosition.peakPnLPercent || 0;

            const newPeakPrice = Math.max(prevPeak, currentPrice);
            const newPeakPnL = Math.max(prevPeakPnL, pnlPercent);

            // ⏱ MIN HOLD
            const MIN_HOLD = 20 * 60 * 1000;
            const inMinHold =
                now - new Date(stock.currentPosition.entryTime).getTime() < MIN_HOLD;

            // 🔴 SELL
            const sellDecision = await evaluateSellDecision(
                stock.symbol,
                stock.currentPosition,
                currentPrice
            );
            let didAction = false;
            let shouldSell = sellDecision?.shouldSell;

            if (inMinHold && pnlPercent > -6) {
                shouldSell = false;
            }

            if (shouldSell) {
                const sellPercent = getSellSizePercent(sellDecision.sellScore || 80);

                let sharesToSell = Math.floor(shares * sellPercent);

                if (shares <= 5 || sharesToSell < 1) {
                    sharesToSell = shares;
                }

                if (sharesToSell <= 0) continue;

                const pnl = (currentPrice - entryPrice) * sharesToSell;
                const remainingShares = Math.max(0, shares - sharesToSell);
                const isFullExit = remainingShares === 0;

                const newTrade = {
                    id: crypto.randomUUID(),
                    auto_stock_id: stock.id,
                    user_id: stock.user_id, // 🔥 REQUIRED FOR DB
                    symbol: stock.symbol,
                    type: isFullExit ? "sell" : "partial_sell",
                    shares: sharesToSell,
                    price: currentPrice,
                    amount: sharesToSell * currentPrice,
                    pnl,
                    created_at: new Date().toISOString(),                  
                    sell_score: sellDecision.sellScore,
                    reason: sellDecision.reason,
                    confidence: sellDecision.confidence,
                    cts_score: sellDecision.ctsScore,
                };

                trades.push(newTrade);

                const newAllocation = stock.compoundProfits
                    ? (stock.allocation || 0) + pnl
                    : stock.allocation;

                // RINSE & REPEAT LOGIC                
                const repeatCount = stock.repeat_counter;
                const canRepeat =
                    stock.rinseRepeat &&
                    repeatCount < (stock.maxRepeats || 1);

                updatedStocks[i] = {
                    ...stock,
                    allocation: Math.max(newAllocation, 0),

                    status: isFullExit
                        ? (canRepeat ? 'monitoring' : 'completed')
                        : 'in-position',

                    currentPosition: isFullExit
                        ? null
                        : {
                            ...stock.currentPosition,
                            shares: remainingShares,
                            peakPrice: newPeakPrice,
                            peakPnLPercent: newPeakPnL,
                        },

                    lastSellTime: now,
                    lastEvaluatedPrice: currentPrice,
                    repeat_counter: isFullExit ? repeatCount + 1 : repeatCount,
                    lastAiDecision: {
                        action: 'Sell',
                        price: currentPrice,
                        pnlPercent,
                        reason: sellDecision.reason,
                        confidence: sellDecision.confidence,
                        timestamp: new Date(),
                        ctsScore: sellDecision.ctsScore,
                        ctsBreakdown: sellDecision.ctsBreakdown,
                    },

                    tradeHistory: [...(stock.tradeHistory || []), newTrade],
                };

                hasChanges = true;
                didAction = true;
                continue; // important to skip to avoid multiple actions in one cycle
            }

            // 🟢 BUY MORE
            if (!inBuyMoreCooldown && !inMinHold && availableCash >= currentPrice) {

                const buyResult = await evaluateStockForBuy(
                    stock.symbol,
                    updatedStocks,
                    currentPrice
                );

                if (buyResult?.shouldBuy && buyResult.entryPrice) {

                    const capitalToUse = getSmartPositionSize(
                        buyResult.ctsScore,
                        availableCash,
                        investedSoFar,
                        stock.allocation || 0
                    );

                    const sharesToBuy = Math.floor(capitalToUse / buyResult.entryPrice);
                    if (sharesToBuy < 1) continue;

                    const totalShares = shares + sharesToBuy;
                    const newAvg = (shares * entryPrice + sharesToBuy * buyResult.entryPrice) / totalShares;

                    const newTrade = {
                       id: crypto.randomUUID(),
                        auto_stock_id: stock.id,
                        user_id: stock.user_id,
                        symbol: stock.symbol,
                        type: 'buyMore',
                        shares: sharesToBuy,
                        price: buyResult.entryPrice,
                        created_at: new Date().toISOString(),
                        amount: sharesToBuy * buyResult.entryPrice,
                        reason: buyResult.thesis,
                        confidence: buyResult.confidence,
                        cts_score: buyResult.ctsScore,
                    };

                    trades.push(newTrade);

                    updatedStocks[i] = {
                        ...stock,
                        currentPosition: {
                            ...stock.currentPosition,
                            shares: totalShares,
                            entryPrice: parseFloat(newAvg.toFixed(4)),
                        },

                        lastAiDecision: {
                            action: 'Buy More',
                            price: buyResult.entryPrice,
                            reason: buyResult.thesis,
                            confidence: buyResult.confidence,
                            timestamp: new Date(),
                            ctsScore: buyResult.ctsScore,
                            ctsBreakdown: buyResult.breakdown || null,
                        },

                        tradeHistory: [...(stock.tradeHistory || []), newTrade],
                    };

                    hasChanges = true;
                    didAction = true;
                }
            }
            // =========================
            // ⚪ STEP 3: HOLD (FINAL FALLBACK)
            // =========================
            if (!didAction) {
                updatedStocks[i] = {
                    ...stock,
                    currentPosition: {
                        ...stock.currentPosition,
                        peakPrice: newPeakPrice,
                        peakPnLPercent: newPeakPnL,
                    },
                    lastEvaluatedPrice: currentPrice,

                    lastAiDecision: {
                        action: 'Hold',
                        price: currentPrice,
                        reason: sellDecision?.reason || "No strong signal",
                        confidence: sellDecision?.confidence || 50,
                        timestamp: new Date(),
                        ctsScore: sellDecision?.ctsScore || null,
                        ctsBreakdown: sellDecision?.ctsBreakdown || null
                    }
                };

                hasChanges = true;
            }
        }

        // =========================
        // 🔵 CASE 2: NO POSITION
        // =========================
        else {
            if (availableCash < currentPrice) continue;
            const repeatCount = Number(stock.repeat_counter ?? 0);
            const maxRepeats = Number(stock.max_repeats ?? 0);
            const repeatLimitReached = stock.rinse_repeat && repeatCount >= maxRepeats;
            if ((stock.status === 'idle' || stock.status === 'monitoring') && repeatLimitReached) {
                updatedStocks[i] = {
                    ...stock,
                    status: 'completed',
                    lastAiDecision: {
                        action: 'Hold',
                        price: currentPrice,
                        reason: `Max repeats reached (${repeatCount}/${maxRepeats})`,
                        confidence: 100,
                        timestamp: new Date(),
                        ctsScore: null,
                        ctsBreakdown: null,
                    },
                    lastEvaluatedPrice: currentPrice,
                };
                hasChanges = true;
                continue;
            }
            const buyResult = await evaluateStockForBuy(
                stock.symbol,
                updatedStocks,
                currentPrice
            );

            if (buyResult?.shouldBuy && buyResult.entryPrice) {
                const capitalToUse = getSmartPositionSize(
                    buyResult.ctsScore,
                    availableCash,
                    0,
                    stock.allocation || 0
                );

                const sharesToBuy = Math.floor(capitalToUse / buyResult.entryPrice);
                if (sharesToBuy < 1) continue;

                const newTrade = {
                    id: crypto.randomUUID(),
                    auto_stock_id: stock.id,
                    user_id: stock.user_id,
                    symbol: stock.symbol,
                    type: 'buy',
                    shares: sharesToBuy,
                    price: buyResult.entryPrice,
                    created_at: new Date().toISOString(),
                    amount: sharesToBuy * buyResult.entryPrice,
                    reason: buyResult.thesis,
                    confidence: buyResult.confidence,
                    cts_score: buyResult.ctsScore,
                };

                trades.push(newTrade);

                updatedStocks[i] = {
                    ...stock,
                    status: 'in-position',

                    currentPosition: {
                        entryPrice: buyResult.entryPrice,
                        shares: sharesToBuy,
                        entryTime: new Date(),
                        peakPrice: buyResult.entryPrice,
                        peakPnLPercent: 0,
                    },

                    lastAiDecision: {
                        action: 'Buy',
                        price: buyResult.entryPrice,
                        reason: buyResult.thesis,
                        confidence: buyResult.confidence,
                        timestamp: new Date(),
                        ctsScore: buyResult.ctsScore,
                        ctsBreakdown: buyResult.breakdown || null,
                    },

                    tradeHistory: [...(stock.tradeHistory || []), newTrade],
                };

                hasChanges = true;
            } else {
                updatedStocks[i] = {
                    ...stock,
                    lastEvaluatedPrice: currentPrice,
                    lastAiDecision: {
                        action: 'Hold',
                        price: currentPrice,
                        reason:
                            buyResult?.thesis ||
                            buyResult?.reason ||
                            buyResult?.noTradeReasons?.[0] ||
                            'No strong signal',
                        confidence: buyResult?.confidence || 50,
                        timestamp: new Date(),
                        ctsScore: buyResult?.ctsScore || null,
                        ctsBreakdown: buyResult?.breakdown || null,
                    },
                };

                hasChanges = true;
            }
        }
    }

    return { updatedStocks, trades, hasChanges };
}