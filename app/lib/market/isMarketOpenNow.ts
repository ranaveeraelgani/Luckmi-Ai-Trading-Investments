const MARKET_HOLIDAYS_2026 = new Set([
  "2026-01-01",
  "2026-01-19",
  "2026-02-16",
  "2026-04-03",
  "2026-05-25",
  "2026-06-19",
  "2026-07-03",
  "2026-09-07",
  "2026-11-26",
  "2026-12-25",
]);

const EARLY_CLOSES_2026 = new Set([
  "2026-11-27",
  "2026-12-24",
]);

function getEasternParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((p) => [p.type, p.value])
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

export function isMarketOpenNow(date = new Date()) {
  const et = getEasternParts(date);

  if (et.weekday === "Sat" || et.weekday === "Sun") return false;
  if (MARKET_HOLIDAYS_2026.has(et.date)) return false;

  const minutes = et.hour * 60 + et.minute;
  const open = 9 * 60 + 30;
  const close = EARLY_CLOSES_2026.has(et.date) ? 13 * 60 : 16 * 60;

  return minutes >= open && minutes < close;
}