"use client";

import { useEffect, useState } from "react";

export type MarketHolidayEvent = {
  date: string;   // "YYYY-MM-DD"
  name: string;
  status: string; // "closed" | "early-close"
  exchange: string;
};

/**
 * Returns the next upcoming market holiday/early-close within `withinDays` days.
 * Returns null while loading or if nothing is coming up soon.
 */
export function useMarketHoliday(withinDays = 4): {
  event: MarketHolidayEvent | null;
  loading: boolean;
} {
  const [event, setEvent] = useState<MarketHolidayEvent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const res = await fetch("/api/market-holidays", { cache: "no-store" });
        if (!res.ok || !active) return;

        const data: MarketHolidayEvent[] = await res.json();
        if (!Array.isArray(data)) return;

        const now = new Date();
        const cutoff = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);

        const next = data.find((e) => {
          const d = new Date(e.date);
          return d >= now && d <= cutoff;
        });

        if (active) setEvent(next ?? null);
      } catch {
        // soft fail — no banner shown
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => { active = false; };
  }, [withinDays]);

  return { event, loading };
}
