// Sell size based on sell score - more aggressive exits for higher risk situations, while allowing for profit protection and trend following in moderate cases. This creates a more dynamic and responsive exit strategy that can adapt to different market conditions and stock behaviors.
export const getSellSizePercent = (sellScore: number) => {
    if (sellScore >= 80) return 1.0;   // 🚨 full exit (high risk)
    if (sellScore >= 60) return 0.75;  // ⚠️ heavy reduction
    if (sellScore >= 45) return 0.5;   // 💰 take half profits
    if (sellScore >= 30) return 0.25;  // 🤏 trim position
    return 0;                          // hold
};