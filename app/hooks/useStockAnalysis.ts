"use client";

import { useCallback, useEffect, useState } from "react";
import {
  loadStockAnalysis,
  type StockAnalysisResult,
} from "@/app/lib/stocks/loadStockAnalysis";

type UseStockAnalysisParams = {
  symbol: string;
  timeRange?: string;
  resolution?: string;
  filtersApplied?: Record<string, any>;
};

export function useStockAnalysis({
  symbol,
  timeRange,
  resolution,
  filtersApplied,
}: UseStockAnalysisParams) {
  const [data, setData] = useState<StockAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    if (!symbol) return;

    try {
      setLoading(true);
      setError(null);

      const result = await loadStockAnalysis({
        symbol,
        timeRange,
        resolution,
        filtersApplied,
      });

      setData(result);
    } catch (err: any) {
      setError(err?.message || "Failed to load stock analysis");
    } finally {
      setLoading(false);
    }
  }, [symbol, timeRange, resolution, filtersApplied]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!symbol) return;

      try {
        setLoading(true);
        setError(null);

        const result = await loadStockAnalysis({
          symbol,
          timeRange,
          resolution,
          filtersApplied,
        });

        if (!cancelled) {
          setData(result);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Failed to load stock analysis");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [symbol, timeRange, resolution, filtersApplied]);

  return {
    data,
    loading,
    error,
    reload,
  };
}