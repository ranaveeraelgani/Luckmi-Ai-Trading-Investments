// Position sizing based on conviction (CTS score)
const getPositionSizePercent = (cts: number) => {
    if (cts >= 85) return 1.0;     // full conviction
    if (cts >= 75) return 0.75;    // strong
    if (cts >= 65) return 0.5;     // moderate
    if (cts >= 55) return 0.3;     // starter
    return 0.15;                   // probe
};

// Smart position sizing that also considers how much capital is already invested in the stock to prevent overloading on a single name. This allows for more aggressive scaling on high conviction picks while maintaining overall portfolio balance.
export const getSmartPositionSize = (
    cts: number,
    availableCash: number,
    investedSoFar: number,
    totalAllocation: number
) => {
    const basePercent = getPositionSizePercent(cts);

    // How much already used
    const usedPercent = totalAllocation > 0 ? investedSoFar / totalAllocation : 0;

    // Remaining capacity (prevents overloading)
    const remainingPercent = Math.max(0, 1 - usedPercent);

    // Scale only part of remaining capital
    const finalPercent = Math.min(basePercent, remainingPercent);

    return availableCash * finalPercent;
};