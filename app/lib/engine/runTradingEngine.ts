import { evaluateStockForBuy } from '@/app/lib/evaluateAi/evaluateBuy/evaluateStockForBuy';
import { evaluateSellDecision } from '@/app/lib/evaluateAi/evaluateSell/evaluateSellDecision';
import { getSmartPositionSize } from '@/app/lib/evaluateAi/evaluateHelpers/getSmartPositionSize';
import { getSellSizePercent } from '@/app/lib/evaluateAi/evaluateHelpers/getSellSizePercent';
// Safe number parsing with fallback
const safeNumber = (val: any, fallback = 0) => {
    const num = Number(val);
    return isNaN(num) ? fallback : num;
};
export async function runTradingEngine(stocks: any[], quotes: any) {
    const updatedStocks = [...stocks];

    for (let i = 0; i < updatedStocks.length; i++) {
        const stock = updatedStocks[i];

        // 👇 paste your loop logic here
        // REMOVE setState
        // RETURN updatedStocks at end
        const currentPrice = safeNumber(quotes[stock.symbol]?.price || 0);
        if (currentPrice <= 0) continue;

        const now = Date.now();

        // =========================
        // 🔒 PRICE MOVEMENT FILTER
        // =========================
        const lastPrice = stock.lastEvaluatedPrice || currentPrice;
        const priceChangePercent = Math.abs(
            ((currentPrice - lastPrice) / lastPrice) * 100
        );

        if (priceChangePercent < 0.3) continue;

        // =========================
        // 🔒 COOLDOWN + FLIP PROTECTION
        // =========================
        const COOLDOWN_MS = 30 * 60 * 1000;
        const FLIP_COOLDOWN = 30 * 60 * 1000;

        const lastSellTime = stock.lastSellTime || 0;
        const inCooldown = now - lastSellTime < COOLDOWN_MS;

        const flipBlocked =
            stock.lastAiDecision?.action === 'Sell' &&
            stock.lastSellTime &&
            now - new Date(stock.lastSellTime).getTime() < FLIP_COOLDOWN;

        if (flipBlocked) continue;

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

            // 🔥 UPDATE PEAK
            const prevPeak = stock.currentPosition.peakPrice || currentPrice;
            const prevPeakPnL = stock.currentPosition.peakPnLPercent || 0;

            const newPeakPrice = Math.max(prevPeak, currentPrice);
            const newPeakPnL = Math.max(prevPeakPnL, pnlPercent);

            // =========================
            // ⏱ MIN HOLD PROTECTION
            // =========================
            const MIN_HOLD = 20 * 60 * 1000;
            const inMinHold =
                Date.now() - new Date(stock.currentPosition.entryTime).getTime() < MIN_HOLD;

            // =========================
            // 🔴 SELL EVALUATION
            // =========================
            const sellDecision = await evaluateSellDecision(
                stock.symbol,
                stock.currentPosition,
                currentPrice
            );

            let shouldSell = sellDecision?.shouldSell;

            // 🔥 enforce min hold (except hard stop)
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

                const sellPrice = currentPrice;

                const pnl = (sellPrice - entryPrice) * sharesToSell;
                const remainingShares = Math.max(0, shares - sharesToSell);
                const isFullExit = remainingShares === 0;

                const newTrade = {
                    id: Date.now().toString(),
                    type: isFullExit ? 'sell' : 'partial_sell',
                    time: new Date(),
                    shares: sharesToSell,
                    price: sellPrice,
                    amount: sellPrice * sharesToSell,
                    pnl,
                    sellDecisionScore: sellDecision.sellScore,
                    reason: sellDecision.reason,
                    confidence: sellDecision.confidence,
                    ctsScore: sellDecision.ctsScore,
                    ctsBreakdown: sellDecision.ctsBreakdown,
                };

                const newAllocation = stock.compoundProfits
                    ? (stock.allocation || 0) + pnl
                    : stock.allocation;

                updatedStocks[i] = {
                    ...stock,
                    allocation: Math.max(newAllocation, 0),

                    status: isFullExit
                        ? (stock.rinseRepeat ? 'monitoring' : 'completed')
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

                    lastAiDecision: {
                        action: 'Sell',
                        reason: sellDecision.reason,
                        confidence: sellDecision.confidence,
                        timestamp: new Date(),
                        ctsScore: sellDecision.ctsScore,
                    },

                    tradeHistory: [...(stock.tradeHistory || []), newTrade],
                };

                //hasChanges = true;
                continue; // 🔥 NEVER BUY AFTER SELL
            }

            // =========================
            // 🟡 HOLD UPDATE
            // =========================
            updatedStocks[i] = {
                ...stock,
                currentPosition: {
                    ...stock.currentPosition,
                    peakPrice: newPeakPrice,
                    peakPnLPercent: newPeakPnL,
                },
                lastEvaluatedPrice: currentPrice,
            };

            // =========================
            // 🟢 BUY MORE
            // =========================
            if (!inCooldown && availableCash >= currentPrice) {

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

                    const oldShares = shares;
                    const oldCost = oldShares * entryPrice;
                    const newCost = sharesToBuy * buyResult.entryPrice;

                    const totalShares = oldShares + sharesToBuy;
                    const newAvg = (oldCost + newCost) / totalShares;

                    updatedStocks[i] = {
                        ...stock,
                        currentPosition: {
                            ...stock.currentPosition,
                            shares: totalShares,
                            entryPrice: parseFloat(newAvg.toFixed(4)),
                        },

                        lastAiDecision: {
                            action: 'Buy More',
                            reason: buyResult.thesis,
                            confidence: buyResult.confidence,
                            timestamp: new Date(),
                            ctsScore: buyResult.ctsScore,
                        },

                        tradeHistory: [
                            ...(stock.tradeHistory || []),
                            {
                                id: Date.now().toString(),
                                type: 'buy_more',
                                time: new Date(),
                                shares: sharesToBuy,
                                price: buyResult.entryPrice,
                            },
                        ],
                    };

                    //hasChanges = true;
                }
            }
        }

        // =========================
        // 🔵 CASE 2: NO POSITION
        // =========================
        else {

            if (inCooldown || availableCash < currentPrice) continue;

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
                        reason: buyResult.thesis,
                        confidence: buyResult.confidence,
                        timestamp: new Date(),
                        ctsScore: buyResult.ctsScore,
                    },

                    tradeHistory: [
                        ...(stock.tradeHistory || []),
                        {
                            id: Date.now().toString(),
                            type: 'buy',
                            time: new Date(),
                            shares: sharesToBuy,
                            price: buyResult.entryPrice,
                        },
                    ],
                };

                //hasChanges = true;
            }
        }
    }

    return updatedStocks;
}