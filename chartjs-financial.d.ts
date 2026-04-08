// types/chartjs-financial.d.ts
import { ChartTypeRegistry } from 'chart.js';

declare module 'chart.js' {
  interface ElementOptionsByType {
    candlestick: {
      borderWidth?: number;
      borderColor?: string | CanvasGradient | CanvasPattern | ((ctx: any) => string);
      // Add other candlestick-specific options if you use them
      color?: {
        up?: string;
        down?: string;
        unchanged?: string;
      };
      // etc.
    };
  }

  // If needed for dataset options too (less common here)
  interface ChartTypeRegistry {
    candlestick: {
      // dataset options if customizing beyond defaults
    };
  }
}