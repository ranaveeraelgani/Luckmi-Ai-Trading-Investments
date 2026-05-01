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

  const minutes = et.hour * 60 + et.minute;
  const open = 9 * 60 + 30;
  const close = 16 * 60;

  return minutes >= open && minutes < close;
}

function getMassiveApiKey() {
  return process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY || "";
}

export async function isMarketOpenNowLive() {
  const apiKey = getMassiveApiKey();

  if (!apiKey) {
    return isMarketOpenNow();
  }

  try {
    const res = await fetch(
      `https://api.massive.com/v1/marketstatus/now?apiKey=${apiKey}`,
      { cache: "no-store" }
    );

    if (!res.ok) {
      return isMarketOpenNow();
    }

    const data = await res.json();
    const market = String(data?.market || "").toLowerCase();
    const nyse = String(data?.exchanges?.nyse || "").toLowerCase();
    const nasdaq = String(data?.exchanges?.nasdaq || "").toLowerCase();

    // We treat regular-session "open" as tradable; extended/pre/post are considered closed for this engine.
    return market === "open" || nyse === "open" || nasdaq === "open";
  } catch {
    return isMarketOpenNow();
  }
}