export const getMomentumState = (macdArr: number[], signalArr: number[]) => {
  const len = macdArr.length;
  if (len < 3) return "unknown";

  const m1 = macdArr[len - 1];
  const m2 = macdArr[len - 2];
  const m3 = macdArr[len - 3];

  // Slope (velocity)
  const slope = m1 - m2;
  const prevSlope = m2 - m3;

  if (m1 > 0 && slope > 0 && slope > prevSlope) return "accelerating_up";
  if (m1 > 0 && slope > 0 && slope < prevSlope) return "slowing_up";
  if (m1 > 0 && slope < 0) return "rolling_over";

  if (m1 < 0 && slope < 0 && slope < prevSlope) return "accelerating_down";
  if (m1 < 0 && slope < 0 && slope > prevSlope) return "slowing_down";
  if (m1 < 0 && slope > 0) return "recovering";

  return "neutral";
};