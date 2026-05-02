import { evaluateStockForBuy } from '@/app/lib/evaluateAi/evaluateBuy/evaluateStockForBuy';
import { evaluateSellDecision } from '@/app/lib/evaluateAi/evaluateSell/evaluateSellDecision';
import { getSmartPositionSize } from '@/app/lib/evaluateAi/evaluateHelpers/getSmartPositionSize';
import { getSellSizePercent } from '@/app/lib/evaluateAi/evaluateHelpers/getSellSizePercent';
import { getCtsForSymbol } from '@/app/lib/evaluateAi/evaluateHelpers/getCtsForSymbol';
import { getQuotes } from '@/app/lib/quotes/quotes';
import type { MarketRegime } from '@/app/lib/engine/helpers/getMarketRegime';

export type EngineContext = {
    marketRegime: MarketRegime;
    earningsRiskSet: Set<string>;
};
// Safe number parsing with fallback
const safeNumber = (val: any, fallback = 0) => {
    const num = Number(val);
    return isNaN(num) ? fallback : num;
};

const MIN_REENTRY_COOLDOWN_MS = 15 * 60 * 1000;
const MAX_REENTRY_COOLDOWN_MS = 120 * 60 * 1000;
const BUY_EXECUTION_SCORE_MIN = 58;
const SELL_EXECUTION_SCORE_MIN = 60;

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function computeFlipRate(closes: number[]) {
    if (closes.length < 4) return 0.5;

    const returns: number[] = [];
    for (let i = 1; i < closes.length; i++) {
        const prev = closes[i - 1];
        const curr = closes[i];
        if (!Number.isFinite(prev) || !Number.isFinite(curr) || prev === 0) continue;
        returns.push((curr - prev) / prev);
    }

    if (returns.length < 3) return 0.5;

    let flips = 0;
    let lastSign = 0;

    for (const r of returns) {
        const sign = r > 0 ? 1 : r < 0 ? -1 : 0;
        if (sign === 0) continue;
        if (lastSign !== 0 && sign !== lastSign) flips += 1;
        lastSign = sign;
    }

    return clamp(flips / Math.max(1, returns.length - 1), 0, 1);
}

function getDynamicReentryCooldownMs(indicatorData: any) {
    const intradayClosesRaw = Array.isArray(indicatorData?.intradayCloses)
        ? indicatorData.intradayCloses
        : Array.isArray(indicatorData?.recentCloses)
        ? indicatorData.recentCloses
        : [];
    const intradayCloses = intradayClosesRaw.map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v));

    const flipRate = computeFlipRate(intradayCloses.slice(-24));
    const dailyCTS = safeNumber(indicatorData?.dailyCTS, safeNumber(indicatorData?.ctsScore, 55));
    const intradayCTS = safeNumber(indicatorData?.intradayCTS, safeNumber(indicatorData?.ctsScore, 55));
    const ctsDivergence = clamp(Math.abs(dailyCTS - intradayCTS) / 40, 0, 1);
    const neutrality = clamp(1 - Math.abs(safeNumber(indicatorData?.ctsScore, 55) - 60) / 25, 0, 1);

    const alignment = String(indicatorData?.alignment || "mixed").toLowerCase();
    const alignmentPenalty =
        alignment === "mixed" || alignment === "countertrend_bounce" || alignment === "bullish_timing_weak"
            ? 0.8
            : alignment === "bearish_confirmed" || alignment === "bullish_confirmed"
            ? 0.2
            : 0.5;

    const chopScore = clamp(
        flipRate * 0.45 + ctsDivergence * 0.25 + neutrality * 0.15 + alignmentPenalty * 0.15,
        0,
        1
    );

    const cooldownMs = MIN_REENTRY_COOLDOWN_MS + (MAX_REENTRY_COOLDOWN_MS - MIN_REENTRY_COOLDOWN_MS) * chopScore;
    return Math.round(cooldownMs);
}

export async function runTradingEngine(stocks: any[], quotes: any, context?: EngineContext) {
    const updatedStocks = [...stocks];
    let trades: any[] = [];
    let hasChanges = false;

    // Regime-adjusted buy threshold: raise bar in choppy/bearish markets
    const effectiveBuyScoreMin = BUY_EXECUTION_SCORE_MIN + (context?.marketRegime.entryScoreBoost ?? 0);
    const earningsRiskSet = context?.earningsRiskSet ?? new Set<string>();

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
        const RECENT_ENTRY_PROTECTION_MS = 2 * 60 * 60 * 1000;

        const lastSellTime = stock.lastSellTime ? new Date(stock.lastSellTime).getTime() : 0;
        const inBuyMoreCooldown = now - lastSellTime < BUY_MORE_COOLDOWN_MS;

        let sharedIndicatorData: any = null;

        // Re-entry cooldown: use the expiry timestamp computed at sell-time (stored in DB).
        // This is deterministic — the cooldown duration is fixed at sell moment, not recomputed.
        const reentryCooldownUntil = stock.reentryCooldownUntil
            ? new Date(stock.reentryCooldownUntil).getTime()
            : 0;
        const flipBlocked = stock.status !== 'in-position' && reentryCooldownUntil > 0 && now < reentryCooldownUntil;
        const earningsBlocked = stock.status !== 'in-position' && earningsRiskSet.has(stock.symbol);
        console.log(`BuyMore Cooldown: ${inBuyMoreCooldown}, Flip Blocked: ${flipBlocked}, Earnings Blocked: ${earningsBlocked}, CooldownUntil: ${stock.reentryCooldownUntil ?? 'none'}`);
        if (flipBlocked || earningsBlocked) continue;

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
            // Fetch CTS data once — reused for both sell and buy-more evaluation
            sharedIndicatorData = sharedIndicatorData || await getCtsForSymbol(stock.symbol);
            const sellDecision = await evaluateSellDecision(
                stock.symbol,
                stock.currentPosition,
                currentPrice,
                sharedIndicatorData
            );
            let didAction = false;
            let shouldSell = sellDecision?.shouldSell;
            const sellScore = Number(sellDecision?.sellScore || 0);
            const inRecentEntryWindow =
                now - new Date(stock.currentPosition.entryTime).getTime() < RECENT_ENTRY_PROTECTION_MS;

            if (inMinHold && pnlPercent > -6) {
                shouldSell = false;
            }

            // Hysteresis band: avoid exits from tiny score wobbles unless loss is meaningful.
            if (shouldSell && pnlPercent > -4 && sellScore < SELL_EXECUTION_SCORE_MIN) {
                shouldSell = false;
            }

            // Anti-whipsaw guard: avoid fast churn exits soon after entry unless
            // drawdown is meaningful or sell conviction is very strong.
            if (shouldSell && inRecentEntryWindow && pnlPercent > -3 && sellScore < 70) {
                shouldSell = false;
            }

            if (shouldSell) {
                const decisionId = crypto.randomUUID();
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
                    ai_decision_id: decisionId,
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

                // Compute cooldown expiry at sell-time so future cycles use a fixed window.
                const sellCooldownMs = getDynamicReentryCooldownMs(sharedIndicatorData);
                const sellCooldownUntil = new Date(now + sellCooldownMs).toISOString();

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
                    reentryCooldownUntil: isFullExit ? sellCooldownUntil : stock.reentryCooldownUntil,
                    lastEvaluatedPrice: currentPrice,
                    repeat_counter: isFullExit ? repeatCount + 1 : repeatCount,
                    lastAiDecision: {
                        id: decisionId,
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
                    currentPrice,
                    sharedIndicatorData
                );

                if (buyResult?.shouldBuy && buyResult.entryPrice) {
                    const decisionId = crypto.randomUUID();
                    const buyScore = Number(
                        (buyResult as any).buyScore ??
                        (buyResult as any)?.breakdown?.meta?.buyScore ??
                        0
                    );

                    // Hysteresis band for buys: require stronger conviction than base shouldBuy.
                    // effectiveBuyScoreMin is already raised by regime boost in choppy/bearish markets.
                    if (buyScore < effectiveBuyScoreMin) {
                        continue;
                    }

                    // Anti-whipsaw guard: require stronger conviction for add-ins
                    // while still inside the recent-entry protection window.
                    if (inRecentEntryWindow && buyScore < 60) {
                        continue;
                    }

                    const buyReason =
                        buyResult.reason ||
                        buyResult.thesis ||
                        'Buy criteria met';

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
                        ai_decision_id: decisionId,
                        amount: sharesToBuy * buyResult.entryPrice,
                        reason: buyReason,
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
                            id: decisionId,
                            action: 'Buy More',
                            price: buyResult.entryPrice,
                            reason: buyReason,
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
            sharedIndicatorData = sharedIndicatorData || await getCtsForSymbol(stock.symbol);

            const buyResult = await evaluateStockForBuy(
                stock.symbol,
                updatedStocks,
                currentPrice,
                sharedIndicatorData
            );

            if (buyResult?.shouldBuy && buyResult.entryPrice) {
                const decisionId = crypto.randomUUID();
                const buyScore = Number(
                    (buyResult as any).buyScore ??
                    (buyResult as any)?.breakdown?.meta?.buyScore ??
                    0
                );

                // Hysteresis band for new entries.
                // effectiveBuyScoreMin is already raised by regime boost in choppy/bearish markets.
                if (buyScore < effectiveBuyScoreMin) {
                    continue;
                }

                const buyReason =
                    buyResult.reason ||
                    buyResult.thesis ||
                    'Buy criteria met';

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
                    ai_decision_id: decisionId,
                    amount: sharesToBuy * buyResult.entryPrice,
                    reason: buyReason,
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
                        id: decisionId,
                        action: 'Buy',
                        price: buyResult.entryPrice,
                        reason: buyReason,
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
                            buyResult?.reason ||
                            buyResult?.thesis ||
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