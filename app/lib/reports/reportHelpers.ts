/**
 * Shared report utilities used across user AI review, admin system review,
 * and admin overview routes.
 */

export function toNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

/**
 * Full action classifier. Handles compound variants (buy_more, partial_sell)
 * in addition to the basic buy / sell / hold buckets.
 */
export function classifyAction(action?: string | null): string {
  const a = String(action || "").toLowerCase();
  if (a.includes("buy_more") || a.includes("buy more") || a.includes("buymore")) {
    return "buy_more";
  }
  if (
    a.includes("partial_sell") ||
    a.includes("partial sell") ||
    a.includes("partialsell")
  ) {
    return "partial_sell";
  }
  if (a.includes("buy")) return "buy";
  if (a.includes("sell")) return "sell";
  if (a.includes("hold") || a.includes("wait")) return "hold";
  return "other";
}

/**
 * Attempts to parse a JSON string from an LLM response.
 * Falls back to locating the outermost `{}` block if direct parse fails.
 */
export function extractJsonFromText<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
