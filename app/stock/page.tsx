'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { formatDistanceToNow } from 'date-fns';
import dynamic from 'next/dynamic';
import { Chart } from 'react-chartjs-2';  // ← replace Line with Chart
import zoomPlugin from 'chartjs-plugin-zoom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
} from 'chart.js';

import 'chartjs-adapter-date-fns';
import { CandlestickController, CandlestickElement } from 'chartjs-chart-financial';
import { number, symbol } from 'zod';
import { createClient } from '@/utils/supabase'
import ProtectedRoute from '@/components/ProtectedRoute';
import { toast } from 'sonner';
// Register core Chart.js + candlestick (safe on server)
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  CandlestickController,
  CandlestickElement
);
interface CandleData {
  o: number;
  h: number;
  l: number;
  c: number;
}

interface CandlestickContext {
  raw: CandleData;
}
interface AiRecommendation {
  action: 'Buy' | 'Hold' | 'Sell' | 'Strong Buy' | null;
  reason: string;
  confidence: number;
  aiEstimate?: number;        // ← Add this line
  content?: string;           // optional fallback
  aiScore: number | null;
}
export default function ChatPage() {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string; timestamp: Date }[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [watchlistInput, setWatchlistInput] = useState('');
  const [selectedStock, setSelectedStock] = useState<string | null>(null);
  const [chartData, setChartData] = useState<any>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [resolution, setResolution] = useState<'1' | '5' | '15' | 'D'>('5');
  const [timeRange, setTimeRange] = useState<'1d' | '1w' | '1m'>('1m');
  const [zoomLoaded, setZoomLoaded] = useState(false);
  const [quotes, setQuotes] = useState<Record<string, { price: string; change: string; percentChange: string }>>({});
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState<AiRecommendation | null>(null);
  const [volumeData, setVolumeData] = useState<any[]>([]);
  // Near your other states
  const [closesState, setClosesState] = useState<number[]>([]);
  const [rsiState, setRsiState] = useState<number[]>([]);
  const [macdState, setMacdState] = useState<number[]>([]);
  const [signalState, setSignalState] = useState<number[]>([]);
  const [ema200State, setEma200State] = useState<number[]>([]);
  const [showCtsModal, setShowCtsModal] = useState(false);
  // Near top of component (with other states)
  const [rectangleBreakout, setRectangleBreakout] = useState<{
    type: 'bullish' | 'bearish';
    support: number;
    resistance: number;
    breakoutPrice: number;
    strength: number;
    reason: string;
  } | null>(null);
  //trending
  const [trendingStocks, setTrendingStocks] = useState<
    { symbol: string; price: string; changePercent: string; volume: number }[]
  >([]);
  const [trendingLoading, setTrendingLoading] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState<'3h' | '1d'>('3h'); // user toggle later
  const [newsData, setNewsData] = useState<any[]>([]);
  const [ctsScore, setCtsScore] = useState<number | null>(null);
  const [ctsBreakdown, setCtsBreakdown] = useState<Record<string, number> | null>(null);
  const [spyData, setSpyData] = useState<any>(null);           // for relative strength
  const [atrValue, setAtrValue] = useState<number>(0);         // for volatility filter
  const [finalCtsScore, setFinalCtsScore] = useState<number | null>(null);
  const [rawBaseScore, setRawBaseScore] = useState<number | null>(null);
  const [filtersApplied, setFiltersApplied] = useState<any>({});
  const [tradeRecommendation, setTradeRecommendation] = useState<'Strong Buy' | 'Buy' | 'Hold' | 'Avoid' | 'Sell'>('Hold');  // Register zoom plugin only in browser
  const [watchlistCtsScores, setWatchlistCtsScores] = useState<Record<string, number>>({});
  const [consensusStatus, setConsensusStatus] = useState<'Strong Agreement' | 'Mild Agreement' | 'Conflict' | null>(null);
  const [marketNews, setMarketNews] = useState<any[]>([]);
  const [isLoadingMarketNews, setIsLoadingMarketNews] = useState(false);
  const [showStockNews, setShowStockNews] = useState(true);
  const [showChartModal, setShowChartModal] = useState(false);
  const [portfolio, setPortfolio] = useState<any[]>([]); // array of holdings
  const [showAddPosition, setShowAddPosition] = useState(false);
  const [showAiRefreshModal, setShowAiRefreshModal] = useState(false);
  const [customInstruction, setCustomInstruction] = useState('');
  const [selectedPresets, setSelectedPresets] = useState<string[]>([]);
  const [newPosition, setNewPosition] = useState({
    symbol: '',
    entryPrice: '',
    quantity: '',
    date: new Date().toISOString().split('T')[0]
  });
  const [aiLastRSI, setAiLastRSI] = useState<number | null>(null);
  const [aiLastMACD, setAiLastMACD] = useState<string | null>(null);
  const [aiLastSignal, setAiLastSignal] = useState<string | null>(null);
  const [aiEma200Last, setAiEma200Last] = useState<string | null>(null);
  const [aiRecentCloses, setAiRecentCloses] = useState<number[]>([]);
  const [aiLastClose, setAiLastClose] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'watchlist' | 'portfolio' | 'auto'>('watchlist');
  const [autoStocks, setAutoStocks] = useState<any[]>([]);
  // Structure: { 
  //   id: string, 
  //   symbol: string, 
  //   allocation: number, 
  //   rinseRepeat: boolean, 
  //   maxRepeats: number, 
  //   customGuidance: string, 
  //   status: 'idle' | 'monitoring' | 'in-position' | 'completed',
  //   currentPosition: { entryPrice: number, shares: number, entryTime: Date, thesis: string } | null,
  //   tradeHistory: any[]
  // }

  const [showAddAutoModal, setShowAddAutoModal] = useState(false);
  const [newAutoSymbol, setNewAutoSymbol] = useState('');
  const [newAllocation, setNewAllocation] = useState(1000);
  const [rinseRepeat, setRinseRepeat] = useState(true);
  const [maxRepeats, setMaxRepeats] = useState(5);
  const [customGuidance, setCustomGuidance] = useState('');
  const [isAutoMonitoring, setIsAutoMonitoring] = useState(false);
  const [compoundProfits, setCompoundProfits] = useState(true);
  const [autoLog, setAutoLog] = useState<any[]>([]); // For history logging
  {/* Add these new states */ }
  const [targetProfit, setTargetProfit] = useState(12);
  const [stopLoss, setStopLoss] = useState(-8);
  const [showBuyMoreModal, setShowBuyMoreModal] = useState(false);
  const [buyMoreAmount, setBuyMoreAmount] = useState(100);
  const [selectedAutoStock, setSelectedAutoStock] = useState<any>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showWelcome, setShowWelcome] = useState(true);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showReportsModal, setShowReportsModal] = useState(false);
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  // Auto Trading Monitoring Engine
  useEffect(() => {
    if (!isAutoMonitoring || autoStocks.length === 0) return;

    const interval = setInterval(async () => {
      const updatedStocks = [...autoStocks];

      for (let i = 0; i < updatedStocks.length; i++) {
        const stock = updatedStocks[i];

        // Skip if max repeats reached
        if (stock.tradeHistory && stock.tradeHistory.length >= stock.maxRepeats && stock.maxRepeats !== 999) {
          continue;
        }

        try {
          // Get latest CTS and AI for this stock
          // (We'll reuse your existing fetchCandles + CTS + AI logic here)
          // For now, we'll simulate with current selectedStock logic. We'll refine this.

          if (stock.status === 'idle' || stock.status === 'monitoring') {
            // Trigger CTS + AI evaluation for this stock
            // You can call a function like evaluateStockForAuto(stock.symbol)
          }
          else if (stock.status === 'in-position' && stock.currentPosition) {
            // Ask AI for sell decision
            // We'll create a dedicated sell evaluation function
          }
        } catch (err) {
          console.error(`Auto error for ${stock.symbol}:`, err);
        }
      }

      setAutoStocks(updatedStocks);
    }, 60000); // Check every 60 seconds

    return () => clearInterval(interval);
  }, [isAutoMonitoring, autoStocks]);

  useEffect(() => {
    if (typeof window !== 'undefined' && !zoomLoaded) {
      // Load plugin
      const loadPlugin = async () => {
        try {
          const module = await import('chartjs-plugin-zoom');
          const zoomPlugin = module.default || module;

          ChartJS.register(zoomPlugin);
          console.log('Zoom plugin registered successfully');
          setZoomLoaded(true);
        } catch (err) {
          console.error('Failed to load/register zoom plugin', err);
        }
      };

      loadPlugin();
    }
  }, [zoomLoaded]);

  useEffect(() => {
    fetchQuotes();

    const interval = setInterval(fetchQuotes, 30000); // refresh every 30 seconds

    return () => clearInterval(interval);
  }, [watchlist, portfolio]);   // ← Must include 'portfolio'

  // Load watchlist from Supabase - Clean & Safe
  useEffect(() => {
    const loadWatchlist = async () => {
      const supabase = createClient();

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from('watchlists')
          .select('symbols')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Error loading watchlist:', error);
          setWatchlist([]);
          return;
        }

        if (data?.symbols && Array.isArray(data.symbols)) {
          setWatchlist(data.symbols);
          //console.log(`✅ Loaded ${data.symbols.length} watchlist items from Supabase`);
        } else {
          setWatchlist([]);
          console.log('No watchlist found in Supabase yet');
        }
      } catch (err) {
        console.error('Failed to load watchlist from Supabase', err);
        setWatchlist([]);
      }
    };

    loadWatchlist();
  }, []);

  // Load portfolio from Supabase
  useEffect(() => {
    const loadPortfolio = async () => {
      const supabase = createClient();

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from('portfolios')
          .select('positions')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Error loading portfolio:', error);
          setPortfolio([]);
          return;
        }

        if (data?.positions && Array.isArray(data.positions)) {
          setPortfolio(data.positions);
          //console.log(`✅ Loaded ${data.positions.length} portfolio positions from Supabase`);
        } else {
          setPortfolio([]);
          //console.log('No portfolio found in Supabase yet');
        }
      } catch (err) {
        console.error('Failed to load portfolio from Supabase', err);
        setPortfolio([]);
      }
    };

    loadPortfolio();
  }, []);

  // Save watchlist to Supabase whenever it changes
  useEffect(() => {
    const saveWatchlist = async () => {
      const supabase = createClient();
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        // First delete any existing row for this user
        await supabase
          .from('watchlists')
          .delete()
          .eq('user_id', user.id);

        const { error } = await supabase
          .from('watchlists')
          .upsert({
            user_id: user.id,
            symbols: watchlist,
            created_at: new Date().toISOString()
          }, {
            onConflict: 'user_id',   // This tells Supabase to update if user_id already exists
            ignoreDuplicates: false
          });


        if (error) console.error('Failed to save watchlist:', error);
        else {
          //console.log('✅ Watchlist saved to Supabase');
        }
      } catch (err) {
        console.error('Save watchlist error:', err);
      }
    };

    saveWatchlist();
  }, [watchlist]);

  // Save portfolio to Supabase (improved version)
  useEffect(() => {
    const savePortfolio = async () => {
      const supabase = createClient();
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        // First delete any existing row for this user
        await supabase
          .from('portfolios')
          .delete()
          .eq('user_id', user.id);

        const { error } = await supabase
          .from('portfolios')
          .upsert({
            user_id: user.id,
            positions: portfolio,
            created_at: new Date().toISOString()
          }, {
            onConflict: 'user_id',           // This tells it to update existing row
            ignoreDuplicates: false
          });

        if (error) {
          console.error('Failed to save portfolio:', error);
        } else {
          //console.log('✅ Portfolio saved to Supabase');
        }
      } catch (err) {
        console.error('Save portfolio error:', err);
      }
    };

    savePortfolio();
  }, [portfolio]);

  // Load autoStocks from Supabase - Final safe version
  useEffect(() => {
    const loadAutoStocks = async () => {
      const supabase = createClient();

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from('auto_trades')
          .select('stocks')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Error loading autoStocks:', error);
          setAutoStocks([]);
          return;
        }

        if (data?.stocks && Array.isArray(data.stocks)) {
          const restored = data.stocks.map((stock: any) => ({
            ...stock,
            currentPosition: stock.currentPosition ? {
              ...stock.currentPosition,
              entryTime: stock.currentPosition.entryTime
                ? new Date(stock.currentPosition.entryTime)
                : null
            } : null,
            tradeHistory: stock.tradeHistory
              ? stock.tradeHistory.map((entry: any) => ({
                ...entry,
                time: entry.time ? new Date(entry.time) : null
              }))
              : []
          }));

          setAutoStocks(restored);
          //console.log(`✅ Loaded ${restored.length} auto stocks from Supabase`);
        } else {
          setAutoStocks([]);
          console.log('No autoStocks data found in Supabase yet');
        }
      } catch (err) {
        console.error('Failed to load autoStocks from Supabase', err);
        setAutoStocks([]);
      }
    };

    loadAutoStocks();
  }, []);

  // Save autoStocks to Supabase - Handles empty array correctly
  useEffect(() => {
    const saveAutoStocks = async () => {
      const supabase = createClient();

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        // First delete any existing row for this user
        await supabase
          .from('auto_trades')
          .delete()
          .eq('user_id', user.id);

        const { error } = await supabase
          .from('auto_trades')
          .upsert({
            user_id: user.id,
            stocks: autoStocks,           // This can be empty array []
            created_at: new Date().toISOString()
          }, {
            onConflict: 'user_id',
            ignoreDuplicates: false
          });

        if (error) {
          console.error('Failed to save autoStocks:', error);
        } else {
          //console.log(`✅ AutoStocks saved (${autoStocks.length} stocks)`);
        }
      } catch (err) {
        console.error('Save autoStocks error:', err);
      }
    };

    saveAutoStocks();
  }, [autoStocks]);   // No early return — always save (even when empty)

  // Fetch general market news
  useEffect(() => {
    const fetchMarketNews = async () => {
      if (selectedStock) return; // Only fetch when no stock is selected

      setIsLoadingMarketNews(true);
      try {
        const res = await fetch('/api/market-news');
        if (res.ok) {
          const data = await res.json();
          setMarketNews(data);
        }
      } catch (error) {
        console.error('Failed to fetch market news:', error);
      } finally {
        setIsLoadingMarketNews(false);
      }
    };

    fetchMarketNews();
  }, [selectedStock]); // Re-fetch when selection changes

  // Add this after AI recommendation is set
  useEffect(() => {
    if (finalCtsScore === null || !aiRecommendation) {
      setConsensusStatus(null);
      return;
    }
    const ctsAction = finalCtsScore >= 65 ? 'Buy' : 'Hold/Avoid';
    if ((finalCtsScore >= 65 && aiRecommendation.action === 'Buy') ||
      (finalCtsScore < 65 && aiRecommendation.action === 'Hold')) {
      setConsensusStatus('Strong Agreement');
    }
    else if (finalCtsScore >= 65 && aiRecommendation.action === 'Hold') {
      setConsensusStatus('Conflict');   // CTS wants Buy, AI wants Hold
    }
    else if (finalCtsScore < 65 && aiRecommendation.action === 'Buy') {
      setConsensusStatus('Conflict');   // CTS wants Hold, AI wants Buy
    }
    else {
      setConsensusStatus('Mild Agreement');
    }
  }, [finalCtsScore, aiRecommendation]);

  // Run background CTS calculation when watchlist or quotes change
  // useEffect(() => {
  //   const timeout = setTimeout(() => {
  //     calculateAllWatchlistCts();
  //   }, 800); // small delay to avoid too many requests at once

  //   return () => clearTimeout(timeout);
  // }, [watchlist, quotes]);   // Important: re-run when these change

  //spy use-effect
  useEffect(() => {
    if (selectedStock && spyData !== null) {   // only re-fetch when params change
      fetchSpyForRS();
    }
  }, [resolution, timeRange]);

  const addToWatchlist = (symbol: string) => {
    const upper = symbol.toUpperCase().trim();
    if (!upper || watchlist.includes(upper)) return;

    setWatchlist((prev) => [...prev, upper]);
    setWatchlistInput('');
  };

  const removeFromWatchlist = (symbol: string) => {
    const upper = symbol.toUpperCase();
    setWatchlist((prev) => prev.filter((s) => s !== upper));
    if (selectedStock === upper) {
      setSelectedStock(null);
      setChartData(null);
    }
  };

  // Final robust AI trigger
  // Nuclear version - single pending flag + immediate cancellation
  //   const isAiProcessing = useRef(false);

  // // Simplified but strict AI trigger
  // useEffect(() => {
  //   // Reset immediately when anything changes
  //   isAiProcessing.current = false;

  //   if (!selectedStock || finalCtsScore === null) {
  //     setAiRecommendation(null);
  //     return;
  //   }

  //   const currentStock = selectedStock;
  //   const currentCts = finalCtsScore;

  //   console.log(`CTS ready (${currentCts}) → starting AI for ${currentStock}`);

  //   isAiProcessing.current = true;

  //   const timer = setTimeout(() => {
  //     // Strict check: only execute if still processing and values match
  //     if (!isAiProcessing.current || selectedStock !== currentStock || finalCtsScore !== currentCts) {
  //       console.log(`Ignoring stale AI for ${currentStock}`);
  //       return;
  //     }

  //     console.log(`Executing AI for ${currentStock} with CTS: ${currentCts}`);
  //     getAiRecommendation(currentStock, currentCts);
  //     fetchNews(currentStock);

  //     isAiProcessing.current = false;
  //   }, 650); // Slightly longer delay

  //   return () => {
  //     clearTimeout(timer);
  //     isAiProcessing.current = false;
  //   };
  // }, [selectedStock, finalCtsScore]);

  // Reset AI flag when stock or timeframe changes
  // useEffect(() => {
  //   aiHasRunRef.current = false;
  // }, [selectedStock, timeRange, resolution]);


  // Single stable effect for fetch + CTS + AI
  const processingRef = useRef(false);

  useEffect(() => {
    if (!selectedStock) {
      setChartData(null);
      setFinalCtsScore(null);
      setAiRecommendation(null);
      return;
    }

    let isCancelled = false;

    const processStock = async () => {
      setChartLoading(true);

      try {
        // 1. Fetch candles
        let daysBack = 30;
        if (timeRange === '1d') daysBack = 2;
        if (timeRange === '1w') daysBack = 10;
        if (timeRange === '1m') daysBack = 40;

        const fromDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const toDate = new Date().toISOString().split('T')[0];

        const multiplier = resolution === 'D' ? '1' : resolution;
        const timespan = resolution === 'D' ? 'day' : 'minute';

        const url = `/api/polygon-candles?symbol=${selectedStock}&multiplier=${multiplier}&timespan=${timespan}&from=${fromDate}&to=${toDate}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        if (data.error || !data.t?.length) throw new Error(data.error || 'No data');

        // Process data
        const maxPoints = 500;
        const startIndex = Math.max(0, data.t.length - maxPoints);

        const slicedData = {
          t: data.t.slice(startIndex),
          o: data.o.slice(startIndex),
          h: data.h.slice(startIndex),
          l: data.l.slice(startIndex),
          c: data.c.slice(startIndex),
          v: data.v.slice(startIndex),
        };

        const ohlc = slicedData.t.map((_: any, i: number) => ({
          x: new Date(slicedData.t[i] * 1000),
          o: slicedData.o[i],
          h: slicedData.h[i],
          l: slicedData.l[i],
          c: slicedData.c[i],
        }));

        const closes = ohlc.map((c: any) => c.c);

        const { macd, signal, histogram } = calculateMACD(closes);
        const rsi = calculateRSI(closes, 14);
        const ema200 = closes.length >= 200 ? calculateEMA(closes, 200) : [];

        const breakoutResult = detectRectangleBreakout(ohlc, slicedData.v);

        // 2. Calculate CTS
        const ctsResult = calculateFinalCTS(
          ohlc,
          closes,
          macd,
          rsi,
          ema200,
          slicedData.v,
          breakoutResult,
          newsData || [],
          spyData || []
        );
        // After const ctsResult = calculateFinalCTS(...)
        const toastId = toast.loading(`AI evaluating ${selectedStock}...`);
        setFinalCtsScore(ctsResult.finalScore);
        setAiLastRSI(ctsResult.lastRSI ?? null);
        setAiLastMACD(ctsResult.lastMACD ?? null);
        setAiLastSignal(ctsResult.lastSignal ?? null);
        setAiEma200Last(ctsResult.ema200Last ?? null);
        setAiRecentCloses(ctsResult.recentCloses || []);
        setAiLastClose(ctsResult.lastClose ?? null);
        if (isCancelled) return;
        // 3. Update chart and CTS
        setChartData({
          datasets: [
            // Price candlesticks (solid – from above)
            {
              label: `${selectedStock} Price`,
              data: ohlc,
              type: 'candlestick' as const,

              // Solid fill – keep function
              backgroundColor: (ctx: any) => {
                return ctx.raw.c >= ctx.raw.o ? '#26a69a' : '#ef5350';
              },

              // Aggressively kill body border
              borderColor: 'transparent',
              borderWidth: 0,                       // Must be 0 here

              // Wicks – try white or bright for contrast
              wickColor: '#ffffff',                 // or '#e2e8f0' for softer
              wickWidth: 1,                         // thinner = less bleed

              fill: false,                  // already good

              yAxisID: 'y',
            },

            // 200 EMA (if you still want it)
            {
              label: '200 EMA',
              data: ema200.map((value: number, i: number) => ({
                x: ohlc[i + 200]?.x ?? new Date(),
                y: value,
              })),
              borderColor: '#ff9800',
              borderWidth: 2.5,
              borderDash: [4, 4],
              type: 'line' as const,
              pointRadius: 0,
              yAxisID: 'y',
            },

            // MACD line
            {
              label: 'MACD',
              data: macd.map((value: number, i: number) => ({
                x: ohlc[i + 26]?.x ?? new Date(),
                y: value,
              })),
              borderColor: '#00bcd4', // cyan
              borderWidth: 2,
              type: 'line' as const,
              pointRadius: 0,
              yAxisID: 'y2',
            },

            // Signal line
            {
              label: 'Signal',
              data: signal.map((value: number, i: number) => ({
                x: ohlc[i + 26 + 9]?.x ?? new Date(),
                y: value,
              })),
              borderColor: '#ff9800', // orange
              borderWidth: 2,
              type: 'line' as const,
              pointRadius: 0,
              yAxisID: 'y2',
            },

            // Histogram
            {
              label: 'Histogram',
              data: histogram.map((value: number, i: number) => ({
                x: ohlc[i + 26 + 9]?.x ?? new Date(),
                y: value,
              })),
              type: 'bar' as const,
              backgroundColor: histogram.map((v: number) => v >= 0 ? '#26a69a' : '#ef5350'), // solid green/red
              yAxisID: 'y2',
            },

            // RSI line
            {
              label: 'RSI',
              data: rsi.map((value: number, i: number) => ({
                x: ohlc[i + 14]?.x ?? new Date(),
                y: value,
              })),
              borderColor: '#ab47bc', // bright purple
              borderWidth: 2,
              type: 'line' as const,
              pointRadius: 0,
              yAxisID: 'y3',
            },

            // RSI levels
            {
              label: 'Overbought (70)',
              data: rsi.map((_, i: number) => ({
                x: ohlc[i + 14]?.x ?? new Date(),
                y: 70,
              })),
              borderColor: '#ef5350',
              borderDash: [6, 3],
              type: 'line' as const,
              pointRadius: 0,
              yAxisID: 'y3',
            },
            {
              label: 'Oversold (30)',
              data: rsi.map((_, i: number) => ({
                x: ohlc[i + 14]?.x ?? new Date(),
                y: 30,
              })),
              borderColor: '#26a69a',
              borderDash: [6, 3],
              type: 'line' as const,
              pointRadius: 0,
              yAxisID: 'y3',
            },
            // Volume bars (below price)
            {
              label: 'Volume',
              data: slicedData.v.map((vol: number, i: number) => ({
                x: ohlc[i]?.x ?? new Date(),  // safe x
                y: vol,
              })),
              type: 'bar' as const,

              // Safe background color: fallback to gray if candle missing
              backgroundColor: (ctx: any) => {
                const index = ctx.dataIndex;
                const candle = ohlc[index];
                if (!candle || !candle.c || !candle.o) {
                  return '#64748b80'; // fallback gray semi-transparent
                }
                return candle.c >= candle.o ? '#26a69a80' : '#ef535080';
              },

              borderColor: 'transparent',
              barPercentage: 0.95,
              categoryPercentage: 0.95,
              yAxisID: 'yVolume',
            },
          ]
        });
        setRawBaseScore(ctsResult.rawBaseScore);
        setTradeRecommendation(ctsResult.recommendation as 'Strong Buy' | 'Buy' | 'Hold' | 'Avoid' | 'Sell');
        setFiltersApplied(ctsResult.filtersApplied || {});

        console.log(`CTS updated for ${selectedStock} (${timeRange} ${resolution}): ${ctsResult.finalScore}`);

        // 4. Trigger AI ONLY ONCE after everything is ready
        setTimeout(() => {
          const currentCts = ctsResult.finalScore;
          const currentStock = selectedStock;

          // Immediately use the fresh values
          getAiRecommendation(
            currentStock,
            currentCts,                    // ← Always use the just-calculated value
            undefined,
            ctsResult.lastRSI,
            ctsResult.lastMACD,
            ctsResult.lastSignal,
            ctsResult.ema200Last,
            ctsResult.recentCloses,
            ctsResult.lastClose
          );

          fetchNews(selectedStock);
          toast.dismiss(toastId);
        }, 400);

      } catch (err) {
        console.error('Process stock error:', err);
        setChartData(null);
      } finally {
        setChartLoading(false);
        processingRef.current = false;
      }
    };

    processStock();
    return () => {
      isCancelled = true;
    };
  }, [selectedStock, timeRange, resolution]);

  const getAiRecommendation = async (
    stockOverride?: string,
    ctsOverride?: number | null,
    customInstruction?: string,
    lastRSI?: number,
    lastMACD?: string,
    lastSignal?: string,
    ema200Last?: string,
    recentCloses?: number[],
    lastClose?: number
  ) => {
    const stock = stockOverride || selectedStock;
    const ctsScore = ctsOverride !== undefined && ctsOverride !== null
      ? ctsOverride
      : finalCtsScore;


    if (!stock || ctsScore === null) return;

    //console.log('Starting AI recommendation for', stock, 'with CTS:', ctsScore);

    try {
      // Safe fallbacks
      const safeLastRSI = lastRSI?.toFixed(2) ?? 'N/A';
      const safeLastMACD = lastMACD ?? 'N/A';
      const safeLastSignal = lastSignal ?? 'N/A';
      const safeEma200Last = ema200Last ?? 'N/A';
      const safeRecentCloses = recentCloses
        ? recentCloses.map(c => c.toFixed(2)).join(', ')
        : 'N/A';


      const prompt = `
You are a disciplined, rules-based trading analyst. Your primary input is the Confluence Trading Score (CTS) from the app.

CTS Zones - Follow these strictly as the main anchor:
- 78–100: Strong Buy Zone (high conviction opportunity)
- 65–77: Buy Zone (favorable setup)
- 53–64: Hold Zone (neutral, wait for better confirmation)
- 40–52: Avoid Zone (low probability or high risk)
- Below 40: Sell Zone (bearish bias)

Core Rules you MUST follow:
1. Always begin your reasoning by clearly stating the app's CTS score and which zone it falls into for ${stock}.
2. Default to the recommendation suggested by the CTS zone.
3. Your AI Score must stay within the same zone or ONE adjacent zone as the app's CTS score.
4. Only go outside adjacent zones if there is a VERY strong, clearly identifiable conflicting signal. In that case, explain the reason honestly and keep the deviation minimal.
5. Never recommend Buy if CTS is below 60 unless there is an exceptionally strong bullish reason (e.g. powerful breakout + high volume surge).
6. Never recommend Sell if CTS is above 65 unless there is a very strong bearish reason.

After your recommendation, provide your own independent AI Score (0-100).
Rules for AI Score:
- Calculate a NEW number based on your own analysis.
- Do NOT repeat or copy the exact app CTS score.
- The number must be within ±10 points of the app's CTS score, but it should be different and respect the zone rules above.

Current data:
Stock: ${stock}
App CTS Score: ${ctsScore}/100 (Raw Base Score: ${rawBaseScore || 'N/A'})
200 EMA: ${safeEma200Last}
RSI (14): ${safeLastRSI}
MACD: ${safeLastMACD} (Signal: ${safeLastSignal})
Trend vs 200 EMA: ${Number(lastClose) > Number(safeEma200Last) ? 'Above' : 'Below'}
Recent closes: ${safeRecentCloses}

${customInstruction ? `Additional user instruction: ${customInstruction}` : ''}

Format exactly:
ACTION: Buy / Hold / Sell
REASON: [3-4 sentences maximum. Must start with the CTS score and zone for ${stock}, then add supporting context about ${stock}'s price action, indicators, trend, and any key risks or confirmations. Keep it concise but informative.]
AI Score: [your own calculated DIFFERENT number] ±10
CONFIDENCE: [0-100]
`;
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
      });

      if (!res.ok) throw new Error(`API error: ${res.status}`);

      let text = '';
      try {
        const data = await res.json();
        text = data.content || data.message || data.text || JSON.stringify(data);
      } catch {
        text = await res.text();
      }

      const textClean = text.trim().replace(/\s+/g, ' ');

      // Parse ACTION
      const actionMatch = textClean.match(/ACTION:\s*(Buy|Hold|Sell|Strong Buy)/i);

      // Parse REASON (3-4 sentences)
      const reasonMatch = textClean.match(/REASON:\s*(.+?)(?=AI Score:|CONFIDENCE:|$)/is);

      // Parse AI Score - Improved regex
      const aiScoreMatch = textClean.match(/AI Score:\s*(\d+)/i);

      // Parse CONFIDENCE
      const confMatch = textClean.match(/CONFIDENCE:\s*(\d+)/i);

      if (actionMatch) {
        const action = actionMatch[1] as 'Buy' | 'Hold' | 'Sell' | 'Strong Buy';
        const reason = reasonMatch ? reasonMatch[1].trim() : 'No reasoning provided';
        const aiScore = aiScoreMatch ? parseInt(aiScoreMatch[1]) : null;
        const confidence = confMatch ? Number(confMatch[1]) : 50;

        //console.log('Parsed AI rec:', { action, reason, aiScore, confidence });

        setAiRecommendation({
          action,
          reason,
          aiScore,           // ← Now we store the AI Score
          confidence
        });
      } else {
        console.log('No valid ACTION in AI response');
        setAiRecommendation({
          action: 'Hold',
          reason: 'Could not parse AI recommendation',
          aiScore: null,
          confidence: 30
        });
      }
    } catch (err) {
      console.error('AI recommendation failed:', err);
      setAiRecommendation({
        action: 'Hold',
        reason: 'Error connecting to AI service',
        aiScore: null,
        confidence: 30
      });
    }
  };

  const handleWatchlistSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (watchlistInput.trim()) {
      addToWatchlist(watchlistInput);
    }
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = input.trim();
    const lower = userMessage.toLowerCase();

    if (lower.startsWith('add ') && lower.includes('to watchlist')) {
      const symbolMatch = userMessage.match(/add\s+([A-Za-z]+)/i);
      if (symbolMatch) {
        addToWatchlist(symbolMatch[1]);
        setInput('');
        return;
      }
    }
    if (lower.startsWith('remove ') || lower.startsWith('delete ')) {
      const symbolMatch = userMessage.match(/(?:remove|delete)\s+([A-Za-z]+)/i);
      if (symbolMatch) {
        removeFromWatchlist(symbolMatch[1]);
        setInput('');
        return;
      }
    }

    setMessages((prev) => [...prev, { role: 'user', content: userMessage, timestamp: new Date() }]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })).concat({ role: 'user', content: userMessage }),
        }),
      });

      if (!response.ok) throw new Error('API error');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader');

      let aiContent = '';
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        aiContent += decoder.decode(value);

        setMessages((prev) => {
          const newMsgs = [...prev];
          const last = newMsgs[newMsgs.length - 1];
          if (last && last.role === 'assistant') {
            newMsgs[newMsgs.length - 1] = { ...last, content: aiContent };
          } else {
            newMsgs.push({ role: 'assistant', content: aiContent, timestamp: new Date() });
          }
          return newMsgs;
        });
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, something went wrong.', timestamp: new Date() },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchQuotes = async () => {
    // Collect all unique symbols from watchlist, autoStocks, and portfolio
    const portfolioSymbols = portfolio.map((pos: any) => pos.symbol);

    const allSymbolsSet = new Set([
      ...watchlist,
      ...autoStocks.map((s: any) => s.symbol),
      ...portfolioSymbols,
      'SPY'   // Always include SPY for market reference
    ]);

    const allSymbols = Array.from(allSymbolsSet).filter(Boolean);

    if (allSymbols.length === 0) return;

    setQuotesLoading(true);

    try {
      //console.log('Fetching quotes for:', allSymbols.join(','));

      const res = await fetch(`/api/quotes?symbols=${allSymbols.join(',')}`);

      if (!res.ok) {
        throw new Error(`Quotes API failed: ${res.status}`);
      }

      const data = await res.json();

      const quoteMap: Record<string, any> = {};
      data.forEach((q: any) => {
        if (!q.error && q.symbol) {
          quoteMap[q.symbol] = {
            price: q.price,
            change: q.change || 0,
            percentChange: q.percentChange || 0,
          };
        }
      });

      setQuotes(quoteMap);
      setLastUpdated(new Date());
      //console.log('Quotes updated successfully');
    } catch (err) {
      console.error('Quotes fetch error:', err);
    } finally {
      setQuotesLoading(false);
    }
  };
  // Simple EMA calculation
  const calculateEMA = (data: number[], period: number): number[] => {
    const k = 2 / (period + 1);
    const ema: number[] = [];
    let sma = data.slice(0, period).reduce((a, b) => a + b, 0) / period;

    ema.push(sma);
    for (let i = period; i < data.length; i++) {
      sma = data[i] * k + sma * (1 - k);
      ema.push(sma);
    }
    return ema;
  };

  // MACD (12, 26, 9)
  const calculateMACD = (closes: number[]) => {
    if (closes.length < 26) return { macd: [], signal: [], histogram: [] };

    const ema12 = calculateEMA(closes, 12);
    const ema26 = calculateEMA(closes, 26);

    const macd: number[] = [];
    for (let i = 0; i < ema12.length; i++) {
      macd.push(ema12[i] - ema26[i + (ema26.length - ema12.length)]);
    }

    const signal = calculateEMA(macd, 9);
    const histogram = macd.slice(-signal.length).map((m, i) => m - signal[i]);

    return { macd, signal, histogram };
  };

  // RSI (14)
  const calculateRSI = (closes: number[], period = 14) => {
    if (closes.length < period + 1) return [];

    const gains: number[] = [];
    const losses: number[] = [];

    for (let i = 1; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }

    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

    const rsi: number[] = [];
    rsi.push(100 - (100 / (1 + avgGain / (avgLoss || 1))));

    for (let i = period; i < gains.length; i++) {
      avgGain = ((avgGain * (period - 1)) + gains[i]) / period;
      avgLoss = ((avgLoss * (period - 1)) + losses[i]) / period;
      rsi.push(100 - (100 / (1 + avgGain / (avgLoss || 1))));
    }

    return rsi;
  };

  // ← NEW: Rectangle Breakout Detector
  const detectRectangleBreakout = (
    ohlc: { o: number; h: number; l: number; c: number; x: Date }[],
    volumes: number[],
    lookback = 40
  ) => {
    if (ohlc.length < lookback + 5) return null;

    const recent = ohlc.slice(-lookback);
    const highs = recent.map((c) => c.h);
    const lows = recent.map((c) => c.l);
    const closes = recent.map((c) => c.c);
    const vols = volumes.slice(-lookback);

    const resistance = Math.max(...highs);
    const support = Math.min(...lows);
    const range = resistance - support;
    if (range < 0.01) return null;

    // Count touches (within 1% of level)
    let upperTouches = 0, lowerTouches = 0;
    for (let i = 0; i < recent.length - 3; i++) {
      if (Math.abs(recent[i].h - resistance) / range < 0.015) upperTouches++;
      if (Math.abs(recent[i].l - support) / range < 0.015) lowerTouches++;
    }

    const isValidRectangle = upperTouches >= 2 && lowerTouches >= 2;

    if (!isValidRectangle) return null;

    // Breakout check on last candle + volume spike
    const lastClose = closes[closes.length - 1];
    const prevClose = closes[closes.length - 2];
    const lastVol = vols[vols.length - 1];
    const avgVol = vols.slice(0, -5).reduce((a, b) => a + b, 0) / Math.max(1, vols.length - 5);

    let type: 'bullish' | 'bearish' | null = null;
    if (lastClose > resistance && prevClose <= resistance && lastVol > avgVol * 1.5) {
      type = 'bullish';
    } else if (lastClose < support && prevClose >= support && lastVol > avgVol * 1.5) {
      type = 'bearish';
    }

    if (!type) return null;

    return {
      type,
      support: Number(support.toFixed(2)),
      resistance: Number(resistance.toFixed(2)),
      breakoutPrice: Number(lastClose.toFixed(2)),
      strength: lastVol > avgVol * 2 ? 85 : 65,
      reason: `${type} rectangle breakout – price broke ${type === 'bullish' ? 'above resistance' : 'below support'} with strong volume`,
    };
  };

  // Fetch News
  const fetchNews = useCallback(async (symbol: string) => {
    if (!symbol) return;
    try {
      const res = await fetch(`/api/news?symbol=${symbol}`);
      if (res.ok) {
        const data = await res.json();
        //console.log("news " + symbol, data);
        setNewsData(data);
      }
    } catch (err) {
      console.error('News error', err);
      setNewsData([]);
    }
  }, []);

  //Fetch Trending
  const fetchTrending = useCallback(async () => {
    // setTrendingLoading(true);
    // try {
    //   const res = await fetch('/api/trending');
    //   if (!res.ok) {
    //     console.error('Trending API failed:', res.status, await res.text());
    //     return;
    //   }
    //   const data = await res.json();
    //   if (data.error) {
    //     console.error('API error:', data.error);
    //     return;
    //   }
    //   setTrendingStocks(data);
    // } catch (err) {
    //   console.error('Trending fetch error:', err);
    // } finally {
    //   setTrendingLoading(false);
    // }
  }, []);  // ← empty deps = function stable across renders

  // Then the effect that calls it automatically + sets interval
  useEffect(() => {
    fetchTrending();  // initial fetch

    const intervalMs = refreshInterval === '3h'
      ? 3 * 60 * 60 * 1000
      : 24 * 60 * 60 * 1000;

    const interval = setInterval(fetchTrending, intervalMs);

    return () => clearInterval(interval);
  }, [fetchTrending, refreshInterval]);  // depend on the stable function

  // Add these three tiny helpers first
  const linearRegressionSlope = (data: number[]) => {
    const n = data.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = data.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * data[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
    return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  };

  const detectStructure = (ohlc: any[]) => {
    let highs = 0, lows = 0;
    for (let i = 2; i < ohlc.length - 1; i++) {
      if (ohlc[i].h > ohlc[i - 1].h && ohlc[i].h > ohlc[i + 1].h) highs++;
      if (ohlc[i].l < ohlc[i - 1].l && ohlc[i].l < ohlc[i + 1].l) lows++;
    }
    return highs > lows + 2 ? 15 : highs > lows ? 7 : 0;
  };

  const calculateNewsSentiment = (news: any[]) => {
    if (!news || news.length === 0) return 8; // neutral base

    let score = 8; // start with neutral base

    const positiveKeywords = [
      'beat', 'raise', 'upgrade', 'strong', 'buy', 'bullish',
      'record', 'growth', 'outperform', 'surge', 'rally', 'positive'
    ];

    const negativeKeywords = [
      'miss', 'cut', 'downgrade', 'weak', 'sell', 'bearish',
      'decline', 'drop', 'loss', 'disappoint', 'negative', 'warn'
    ];

    news.forEach(n => {
      const text = (n.headline + ' ' + (n.summary || '')).toLowerCase();

      // Count positive matches
      const posMatches = positiveKeywords.filter(w => text.includes(w)).length;
      score += posMatches * 4;   // +4 per strong positive keyword

      // Count negative matches
      const negMatches = negativeKeywords.filter(w => text.includes(w)).length;
      score -= negMatches * 5;   // -5 per negative keyword (stronger penalty)
    });

    // Cap the sentiment contribution
    score = Math.max(-10, Math.min(20, score));

    return score;
  };

  // MAIN SCORER – exact to your 15-factor model
  const calculateFinalCTS = (
    ohlc: any[],
    closes: number[],
    macdData: any[] = [],      // This is the full MACD array
    rsiData: number[] = [],
    ema200Data: number[] = [],
    volumes: number[] = [],
    breakout: any = null,
    news: any[] = [],
    spyCloses: number[] = []
  ) => {
    if (closes.length < 30) {
      return {
        finalScore: 50,
        rawBaseScore: 50,
        recommendation: 'Hold',
        filtersApplied: {},
        lastRSI: 50,
        lastMACD: 'N/A',
        lastSignal: 'N/A',
        ema200Last: 'N/A',
        recentCloses: closes.slice(-10)
      };
    }

    let rawBaseScore = 42;

    const lastClose = closes[closes.length - 1];
    const ema200Last = ema200Data.length > 0 ? ema200Data[ema200Data.length - 1] : lastClose;
    const distanceFromEMA = Math.abs(lastClose - ema200Last);

    // 1. EMA Position
    const isAboveEMA200 = lastClose > ema200Last + 0.5;
    rawBaseScore += isAboveEMA200 ? 15 : 5;

    // 2. Trend Structure
    const isUptrend = closes[closes.length - 1] > closes[Math.max(0, closes.length - 20)];
    rawBaseScore += isUptrend ? 12 : 7;

    // 3. Momentum (RSI)
    const lastRSI = rsiData.length > 0 ? rsiData[rsiData.length - 1] : 50;
    let momentum = 8;
    if (lastRSI > 70) momentum = 13;
    else if (lastRSI > 58) momentum = 11;
    else if (lastRSI > 50) momentum = 10;
    else if (lastRSI < 45) momentum = 6;
    rawBaseScore += momentum;

    // 4. Volume
    const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20 || 1;
    const recentVol = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const volumeSurge = recentVol > avgVol * 1.35;
    rawBaseScore += volumeSurge ? 10 : 6;

    // 5. News Sentiment
    rawBaseScore += calculateNewsSentiment(news);

    // 6. Relative Strength vs SPY
    if (spyCloses.length > 15 && closes.length > 15) {
      const stockReturn = (closes[closes.length - 1] / closes[closes.length - 16]) - 1;
      const spyReturn = (spyCloses[spyCloses.length - 1] / spyCloses[spyCloses.length - 16]) - 1;
      const relative = stockReturn - spyReturn;
      if (relative > 0.06) rawBaseScore += 7;
      else if (relative < -0.05) rawBaseScore -= 6;
    }

    // 7. Chop Penalty
    const range10 = Math.max(...closes.slice(-10)) - Math.min(...closes.slice(-10));
    if (range10 < 2.5) rawBaseScore -= 11;

    // Timeframe stability
    const isShortTerm = closes.length < 80;
    if (!isShortTerm) rawBaseScore += 5;

    let finalScore = Math.round(rawBaseScore);
    finalScore = Math.max(38, Math.min(92, finalScore));

    const recommendation =
      finalScore >= 78 ? 'Strong Buy' :
        finalScore >= 65 ? 'Buy' :
          finalScore >= 53 ? 'Hold' :
            finalScore >= 40 ? 'Avoid' : 'Sell';

    // Extract last MACD and Signal safely
    const lastMACD = macdData.length > 0 ? macdData[macdData.length - 1] : 'N/A';
    const lastSignal = macdData.length > 9 ? macdData[macdData.length - 10] : 'N/A'; // rough approximation

    return {
      finalScore,
      rawBaseScore: Math.round(rawBaseScore),
      recommendation,
      filtersApplied: { lowVolatility: range10 < 2.5, structure: !isUptrend },

      // Values needed for AI prompt
      lastRSI: Math.round(lastRSI),
      lastMACD: typeof lastMACD === 'number' ? lastMACD.toFixed(4) : 'N/A',
      lastSignal: typeof lastSignal === 'number' ? lastSignal.toFixed(4) : 'N/A',
      ema200Last: ema200Last ? ema200Last.toFixed(2) : 'N/A',
      recentCloses: closes.slice(-10),
      lastClose: lastClose
    };
  };
  // 1. ATR (simple 14-period using closes for speed)
  const calculateATR = (closes: number[], period = 14): number => {
    if (closes.length < period + 1) return 0;
    let sum = 0;
    for (let i = 1; i < period + 1; i++) {
      sum += Math.abs(closes[i] - closes[i - 1]);
    }
    return sum / period;
  };

  const calculateRelativeStrength = (stockCloses: number[], spyCloses: number[]): number => {
    if (stockCloses.length < 10 || spyCloses.length < 10) return 0;
    const stockChange = stockCloses[stockCloses.length - 1] - stockCloses[stockCloses.length - 10];
    const spyChange = spyCloses[spyCloses.length - 1] - spyCloses[spyCloses.length - 10];
    const diff = stockChange - spyChange;
    if (diff > 6) return 12;
    if (diff < -6) return -15;
    return 0;
  };
  // Fetch SPY for relative strength
  // Fetch SPY for Relative Strength
  const fetchSpyForRS = async () => {
    if (!selectedStock) return;

    try {
      const daysBack = timeRange === '1d' ? 1 : timeRange === '1w' ? 7 : 30;
      const from = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const to = new Date().toISOString().split('T')[0];

      const multiplier = resolution === 'D' ? '1' : resolution;
      const timespan = resolution === 'D' ? 'day' : 'minute';

      const res = await fetch(
        `/api/polygon-candles?symbol=SPY&multiplier=${multiplier}&timespan=${timespan}&from=${from}&to=${to}`
      );

      if (!res.ok) throw new Error('SPY fetch failed');

      const data = await res.json();

      if (data.c && data.c.length > 0) {
        setSpyData(data.c);        // closing prices only (we only need closes for RS)
      }
    } catch (err) {
      console.error('Failed to fetch SPY data for relative strength:', err);
      setSpyData([]); // fallback
    }
  };

  // // Calculate Mini CTS for ALL watchlist items - exactly same logic as main CTS
  // const calculateAllWatchlistCts = async () => {
  //   if (watchlist.length === 0) return;

  //   const newScores: Record<string, number> = { ...watchlistCtsScores };

  //   for (const symbol of watchlist) {
  //     try {
  //       // Light & fast: ~40 days of daily candles (enough for reliable EMA, RSI, structure)
  //       const fromDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  //       const toDate = new Date().toISOString().split('T')[0];

  //       const res = await fetch(
  //         `/api/polygon-candles?symbol=${symbol}&multiplier=1&timespan=day&from=${fromDate}&to=${toDate}`
  //       );

  //       if (!res.ok) {
  //         newScores[symbol] = 50;
  //         continue;
  //       }

  //       const data = await res.json();

  //       if (!data.c || data.c.length < 30) {
  //         newScores[symbol] = 50;
  //         continue;
  //       }

  //       const closes = data.c;
  //       const volumes = data.v || [];
  //       const ohlc = data.t.map((t: number, i: number) => ({
  //         x: new Date(t * 1000),
  //         o: data.o[i],
  //         h: data.h[i],
  //         l: data.l[i],
  //         c: data.c[i],
  //       }));

  //       // Call your REAL calculateFinalCTS function exactly as you do for the selected stock
  //       // This ensures mini CTS = main CTS when the stock is selected
  //       const result = calculateFinalCTS(
  //         ohlc,           // ohlc data
  //         closes,         // closes array
  //         [],             // macd (optional - can compute inside if needed)
  //         [],             // rsi
  //         closes.map(() => 0), // dummy ema200 (your function likely computes it)
  //         volumes,        // volume
  //         null,           // breakout (skip for speed)
  //         [],             // news
  //         []              // spy data
  //       );

  //       // Use the exact same final score your main calculation returns
  //       newScores[symbol] = Math.round(result.finalScore ?? result.score ?? 50);

  //     } catch (err) {
  //       console.warn(`Mini CTS failed for ${symbol}`, err);
  //       newScores[symbol] = 50; // safe fallback
  //     }
  //   }

  //   setWatchlistCtsScores(newScores);
  // };
  // Lightweight CTS for watchlist items (fast enough to run for all tickers)
  const calculateMiniCTS = (closes: number[], ema200: number[], lastRSI: number, volumeData: number[]) => {
    if (closes.length < 10) return 45;

    let score = 30; // base floor

    const lastPrice = closes[closes.length - 1];
    const lastEma = ema200[ema200.length - 1] || lastPrice;
    const avgVol = volumeData.slice(-20).reduce((a, b) => a + b, 0) / 20 || 1;
    const lastVol = volumeData[volumeData.length - 1] || 0;

    // EMA
    score += lastPrice > lastEma * 1.01 ? 18 : lastPrice > lastEma ? 12 : 6;

    // RSI
    score += lastRSI > 58 ? 16 : lastRSI > 52 ? 11 : lastRSI > 47 ? 7 : 3;

    // Volume
    score += lastVol > avgVol * 1.7 ? 12 : lastVol > avgVol * 1.2 ? 8 : 4;

    return Math.min(92, Math.max(38, score));
  };
  // Buy More - Add to existing position
  const buyMore = (symbol: string, additionalAmount: number) => {
    if (!additionalAmount || additionalAmount <= 0) return;

    setAutoStocks(prev => prev.map(stock => {
      if (stock.symbol === symbol) {
        const currentAllocation = stock.allocation || 0;
        const newTotalAllocation = currentAllocation + additionalAmount;

        return {
          ...stock,
          allocation: newTotalAllocation,     // Just increase total capital pool
          // Do NOT touch currentPosition or tradeHistory here
        };
      }
      return stock;
    }));

    //addToAutoLog(`💰 BUY MORE ${symbol} - Added $${additionalAmount.toLocaleString()} to allocation`);
    // Success
    toast.success(`💰 BUY MORE ${symbol} - Added $${additionalAmount.toLocaleString()} to allocation`);
  };

  // Final evaluateStockForBuy - Rich Prompt + Early Cash Check
  const evaluateStockForBuy = async (symbol: string) => {
    console.log(`🔍 Evaluating BUY for ${symbol}`);

    try {
      const currentPrice = toNumber(quotes[symbol]?.price);
      if (currentPrice <= 0) return { shouldBuy: false, reason: "Invalid price" };

      const autoStock = autoStocks.find(s => s.symbol === symbol);
      if (!autoStock) return { shouldBuy: false, reason: "Stock not found" };

      const investedSoFar = (autoStock.currentPosition?.shares || 0) * currentPrice;
      const availableCash = (autoStock.allocation || 0) - investedSoFar;

      if (availableCash < currentPrice) {
        //console.log(`Skipping AI for ${symbol} - insufficient cash`);
        return { shouldBuy: false, reason: "Insufficient remaining cash" };
      }

      const indicatorData = await getCtsForSymbol(symbol);
      const ctsScore = indicatorData.ctsScore;
      const lastRSI = indicatorData.rsi;
      const lastMACD = indicatorData.macd;
      const lastSignal = indicatorData.signal;
      const ema200 = indicatorData.ema200;
      const recentCloses = indicatorData.recentCloses;

      const customGuidance = autoStock.customGuidance || "No special instruction.";

      const prompt = `You are a disciplined, rules-based trading analyst. Evaluate whether to BUY ${symbol} right now.

Current Data:
- CTS Score: ${ctsScore} (PRIMARY ANCHOR - very important)
- Current Price: $${currentPrice.toFixed(2)}
- RSI (14): ${lastRSI}
- MACD: ${lastMACD} (Signal: ${lastSignal})
- 200 EMA: ${ema200}
- Recent 10 closes: ${recentCloses}
- User Custom Guidance: ${customGuidance}

Decision Rules:
- CTS 85+ is VERY STRONG. Default to BUY unless there is a strong, specific reason not to.
- CTS 70-84 is favorable. Lean toward Buy if indicators are neutral or positive.
- You may recommend Hold only if there are clear red flags (RSI well below 50, strongly bearish MACD, poor recent price action, or obvious risk in custom guidance).
- When CTS is high, be decisive. Do not be overly cautious.

Format exactly:
ACTION: Buy or Hold
REASON: [3 sentences maximum. Start with CTS score and zone, then explain conviction.]
TRADE THESIS: [1-2 sentence concise thesis]
CONFIDENCE: [0-100]

Decide now.`;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
      });

      let text = await res.text();
      const textClean = text.trim().replace(/\s+/g, ' ');

      const actionMatch = textClean.match(/ACTION:\s*(Buy|Hold)/i);
      const reasonMatch = textClean.match(/REASON:\s*(.+?)(?=TRADE THESIS:|CONFIDENCE:|$)/is);
      const thesisMatch = textClean.match(/TRADE THESIS:\s*(.+?)(?=CONFIDENCE:|$)/is);
      const confMatch = textClean.match(/CONFIDENCE:\s*(\d+)/i);

      const action = actionMatch ? actionMatch[1] : 'Hold';
      const reason = reasonMatch ? reasonMatch[1].trim() : '';
      const thesis = thesisMatch ? thesisMatch[1].trim() : 'Strong confluence detected.';
      const confidence = confMatch ? Number(confMatch[1]) : 60;

      const shouldBuy = action === 'Buy' && ctsScore >= 70;

      //console.log(`AI Decision for ${symbol}: ${action} (CTS: ${ctsScore}, Confidence: ${confidence})`);

      return {
        shouldBuy,
        entryPrice: shouldBuy ? currentPrice : undefined,
        thesis: thesis.substring(0, 200),
        confidence,
        ctsScore
      };

    } catch (err) {
      console.error(`Buy evaluation failed for ${symbol}`, err);
      return { shouldBuy: false, reason: "Evaluation error" };
    }
  };
  // Smart Sell Decision - Uses real AI call with structured prompt
  const evaluateSellDecision = async (symbol: string, currentPosition: any, stock: any) => {
    console.log(`🔍 Evaluating SELL for ${symbol}`);

    try {
      const currentPrice = toNumber(quotes[symbol]?.price);
      if (currentPrice <= 0) return { shouldSell: false, reason: "Invalid price" };

      const pnl = (currentPrice - currentPosition.entryPrice) * currentPosition.shares;
      const pnlPercent = ((currentPrice - currentPosition.entryPrice) / currentPosition.entryPrice) * 100;

      const indicatorData = await getCtsForSymbol(symbol);
      const ctsScore = indicatorData.ctsScore;

      const prompt = `You are a disciplined, rules-based trading analyst. Evaluate whether to SELL ${symbol} right now.

Current Position:
- Entry Price: $${currentPosition.entryPrice.toFixed(2)}
- Current Price: $${currentPrice.toFixed(2)}
- Unrealized P&L: $${pnl.toFixed(2)} (${pnlPercent.toFixed(1)}%)
- CTS Score: ${ctsScore}

Decision Rules:
- Sell if profit target is reached, momentum is weakening, or there is clear risk.
- Be willing to take profits on strong gains.
- Recommend Sell if CTS has dropped significantly or there are bearish signals.
- Consider volatility and overall market conditions.

Format exactly:
ACTION: Sell or Hold
REASON: [3 sentences maximum]
CONFIDENCE: [0-100]

Decide now.`;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
      });

      let text = await res.text();
      const textClean = text.trim().replace(/\s+/g, ' ');

      const actionMatch = textClean.match(/ACTION:\s*(Sell|Hold)/i);
      const reasonMatch = textClean.match(/REASON:\s*(.+?)(?=CONFIDENCE:|$)/is);
      const confMatch = textClean.match(/CONFIDENCE:\s*(\d+)/i);

      const action = actionMatch ? actionMatch[1] : 'Hold';
      const reason = reasonMatch ? reasonMatch[1].trim() : '';
      const confidence = confMatch ? Number(confMatch[1]) : 50;

      const shouldSell = action === 'Sell';

      //console.log(`Sell Decision for ${symbol}: ${action} (Confidence: ${confidence})`);

      return {
        shouldSell,
        reason,
        confidence
      };

    } catch (err) {
      console.error(`Sell evaluation failed for ${symbol}`, err);
      return { shouldSell: false, reason: "Evaluation error" };
    }
  };

  // Final Stable Auto Trading Monitoring Loop
  // Final Auto Trading Monitoring Loop with Compounding
  useEffect(() => {
    if (!isAutoMonitoring || autoStocks.length === 0) {
      console.log('Auto monitoring: disabled or no stocks');
      return;
    }

    console.log(`🚀 Auto monitoring started for ${autoStocks.length} stocks`);

    const interval = setInterval(async () => {
      console.log('🔄 Auto trade check running...');

      let hasChanges = false;
      const currentStocks = [...autoStocks];   // Fresh copy every cycle

      for (let i = 0; i < currentStocks.length; i++) {
        const stock = currentStocks[i];
        const currentPrice = toNumber(quotes[stock.symbol]?.price);

        //console.log(`Evaluating ${stock.symbol} (status: ${stock.status}, allocation: $${stock.allocation || 0})`);

        // === BUY / BUY MORE CHECK ===
        const investedSoFar = (stock.currentPosition?.shares || 0) * currentPrice;
        const availableCash = (stock.allocation || 0) - investedSoFar;

        if (availableCash >= currentPrice) {
          const toastId = toast.loading(`AI evaluating ${stock.symbol}...`);
          const buyResult = await evaluateStockForBuy(stock.symbol);
          toast.dismiss(toastId);

          if (buyResult?.shouldBuy === true && buyResult.entryPrice) {
            const shares = Math.floor(availableCash / buyResult.entryPrice);

            if (shares > 0) {
              const newPosition = {
                entryPrice: buyResult.entryPrice,
                shares: (stock.currentPosition?.shares || 0) + shares,
                entryTime: stock.currentPosition?.entryTime || new Date(),
                thesis: buyResult.thesis || "AI approved entry"
              };

              const newTradeEntry = {
                id: Date.now().toString(),
                type: stock.currentPosition ? 'buy_more' : 'buy',
                time: new Date(),
                shares: shares,
                price: buyResult.entryPrice,
                amount: shares * buyResult.entryPrice,
                reason: buyResult.thesis || "AI buy signal",
                confidence: buyResult.confidence || 70
              };

              currentStocks[i] = {
                ...stock,
                status: 'in-position',
                currentPosition: newPosition,
                tradeHistory: [...(stock.tradeHistory || []), newTradeEntry]
              };

              hasChanges = true;
              toast.success(`Auto Buy executed for ${stock.symbol}`, {
                description: `${shares} shares @ $${buyResult.entryPrice.toFixed(2)}`,
              });
            }
          }
        }

        // === SELL CHECK ===
        else if (stock.status === 'in-position' && stock.currentPosition) {
          const toastId = toast.loading(`AI evaluating ${stock.symbol}...`);
          const sellDecision = await evaluateSellDecision(stock.symbol, stock.currentPosition, stock);
          toast.dismiss(toastId);

          if (sellDecision?.shouldSell) {
            const sellPrice = toNumber(quotes[stock.symbol]?.price);
            const pnl = (sellPrice - stock.currentPosition.entryPrice) * stock.currentPosition.shares;

            const newHistory = [
              ...(stock.tradeHistory || []),
              {
                id: Date.now().toString(),
                type: 'sell',
                time: new Date(),
                shares: stock.currentPosition.shares,
                price: sellPrice,
                amount: sellPrice * stock.currentPosition.shares,
                pnl: pnl,
                reason: sellDecision.reason || "AI sell signal"
              }
            ];

            // Compound profits if enabled
            const newAllocation = stock.compoundProfits
              ? (stock.allocation || 0) + pnl
              : (stock.allocation || 0);

            currentStocks[i] = {
              ...stock,
              allocation: Math.max(newAllocation, 0),
              status: stock.rinseRepeat && (stock.tradeHistory?.length || 0) < (stock.maxRepeats || 5)
                ? 'monitoring'
                : 'completed',
              currentPosition: null,
              tradeHistory: newHistory
            };

            hasChanges = true;
            toast.success(`Sold ${stock.symbol} | P&L: $${pnl.toFixed(2)}`, {
              description: sellDecision.reason
            });
          }
        }
      }

      if (hasChanges) {
        //console.log('💾 Updating autoStocks after trade(s)');
        setAutoStocks(currentStocks);
      }
    }, 45000); // 45 seconds

    return () => clearInterval(interval);
  }, [isAutoMonitoring]);

  // Manual Sell Now
  // Manual Sell for Auto Trading
  const manualSell = async (symbol: string) => {
    if (!confirm(`Sell all shares of ${symbol}?`)) return;

    setAutoStocks(prev => prev.map(stock => {
      if (stock.symbol === symbol && stock.currentPosition) {
        const currentPrice = toNumber(quotes[symbol]?.price);
        const pnl = (currentPrice - stock.currentPosition.entryPrice) * stock.currentPosition.shares;

        const newHistory = [
          ...(stock.tradeHistory || []),
          {
            id: Date.now().toString(),
            type: 'sell' as const,
            time: new Date(),
            shares: stock.currentPosition.shares,
            price: currentPrice,
            amount: currentPrice * stock.currentPosition.shares,
            pnl: pnl,
            reason: "Manual sell by user"
          }
        ];

        //addToAutoLog(`🚪 MANUAL SELL ${stock.currentPosition.shares} shares of ${symbol} | P&L: $${pnl.toFixed(2)}`);
        // When manual sell happens
        toast.success(`🚪 MANUAL SELL ${stock.currentPosition.shares} shares of ${symbol} | P&L: $${pnl.toFixed(2)}`, {
          description: "Manual Sell by user"
        });
        return {
          ...stock,
          status: stock.rinseRepeat && (stock.tradeHistory?.length || 0) < (stock.maxRepeats || 5)
            ? 'monitoring'
            : 'completed',
          currentPosition: null,
          tradeHistory: newHistory
        };
      }
      return stock;
    }));
  };
  // helper
  const toNumber = (value: string | number | undefined): number => {
    if (value === undefined || value === null) return 0;
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return isNaN(num) ? 0 : num;
  };
  // Check if US stock market is open (including major holidays)
  const isMarketOpen = (): boolean => {
    const now = new Date();

    // Convert to Eastern Time (ET)
    const etOffset = -4; // UTC-4 during daylight saving (most of the year)
    // const etOffset = -5; // Use -5 during standard time (Nov-Mar)

    const etHours = now.getUTCHours() + etOffset;
    const etMinutes = now.getUTCMinutes();
    const etDay = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat

    // Weekend = closed
    if (etDay === 0 || etDay === 6) return false;

    // Trading hours: 9:30 AM - 4:00 PM ET (inclusive until 4:00)
    const isTradingHours =
      (etHours > 9 || (etHours === 9 && etMinutes >= 30)) &&
      (etHours < 16 || (etHours === 16 && etMinutes === 0));

    if (!isTradingHours) return false;

    // Major fixed holidays (2025-2026)
    const month = now.getUTCMonth() + 1;
    const date = now.getUTCDate();

    const holidays = [
      { m: 1, d: 1 },   // New Year's Day
      { m: 6, d: 19 },  // Juneteenth
      { m: 7, d: 4 },   // Independence Day
      { m: 12, d: 25 }, // Christmas
    ];

    for (const h of holidays) {
      if (month === h.m && date === h.d) return false;
    }

    return true;
  };
  // Add log entry
  const addToAutoLog = (message: string) => {
    setAutoLog(prev => [{
      time: new Date(),
      message
    }, ...prev].slice(0, 50)); // Keep last 50 logs
  };
  const totalAutoPnl = autoStocks.reduce((total, stock) => {
    return total + (stock.tradeHistory || []).reduce((sum: number, trade: any) => sum + (trade.pnl || 0), 0);
  }, 0);

  // Improved getCtsForSymbol - More forgiving + better fallback
  // Ultra-safe getCtsForSymbol - Eliminates 'toFixed on never' error
  const getCtsForSymbol = async (symbol: string) => {
    try {
      console.log(`Calculating full indicators for ${symbol}...`);

      const fromDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const toDate = new Date().toISOString().split('T')[0];

      const res = await fetch(
        `/api/polygon-candles?symbol=${symbol}&multiplier=1&timespan=day&from=${fromDate}&to=${toDate}`
      );

      if (!res.ok) throw new Error(`Candle fetch failed: ${res.status}`);

      const data = await res.json();

      if (!data.c || data.c.length < 20) {
        console.log(`Not enough data for ${symbol} (${data.c?.length || 0} bars)`);
        return {
          ctsScore: 55,
          rsi: 'N/A',
          macd: 'N/A',
          signal: 'N/A',
          ema200: 'N/A',
          recentCloses: 'N/A'
        };
      }

      const closes = data.c;
      const ohlc = data.t.map((t: number, i: number) => ({
        x: new Date(t * 1000),
        o: data.o[i],
        h: data.h[i],
        l: data.l[i],
        c: data.c[i],
      }));

      const result = calculateFinalCTS(
        ohlc,
        closes,
        [],
        [],
        closes.map(() => 0),
        data.v || [],
        null,
        [],
        []
      );

      const ctsScore = typeof result?.finalScore === 'number' ? result.finalScore : 55;

      // Ultra-safe extraction
      // Ultra-safe extraction with type assertion
      const lastRSI = typeof result?.lastRSI === 'number' ? result.lastRSI.toFixed(2) : 'N/A';
      const lastMACD = typeof result?.lastMACD === 'number' ? (result.lastMACD as number).toFixed(4) : 'N/A';
      const lastSignal = typeof result?.lastSignal === 'number' ? (result.lastSignal as number).toFixed(4) : 'N/A';
      const ema200Last = typeof result?.ema200Last === 'number' ? (result.ema200Last as number).toFixed(2) : 'N/A';

      const recentClosesStr = closes.slice(-10).map((c: number) => Number(c).toFixed(2)).join(', ');

      console.log(`Real CTS for ${symbol}: ${ctsScore} (${closes.length} bars)`);

      return {
        ctsScore,
        rsi: lastRSI,
        macd: lastMACD,
        signal: lastSignal,
        ema200: ema200Last,
        recentCloses: recentClosesStr
      };

    } catch (err) {
      console.error(`Failed to calculate indicators for ${symbol}`, err);
      return {
        ctsScore: 55,
        rsi: 'N/A',
        macd: 'N/A',
        signal: 'N/A',
        ema200: 'N/A',
        recentCloses: 'N/A'
      };
    }
  };
  // migration starts here
  // Migration function - run once per user
  // const migrateFromLocalStorage = async () => {
  //   const supabase = createClient();
  //   setIsMigrating(true);

  //   try {
  //     const { data: { user } } = await supabase.auth.getUser();
  //     if (!user) return;

  //     // 1. Watchlist
  //     const savedWatchlist = localStorage.getItem('watchlist');
  //     if (savedWatchlist) {
  //       const watchlistArray = JSON.parse(savedWatchlist);
  //       await supabase.from('watchlists').upsert({
  //         user_id: user.id,
  //         symbol: watchlistArray,
  //         created_at: new Date().toISOString()
  //       });
  //     }

  //     // 2. Portfolio
  //     const savedPortfolio = localStorage.getItem('portfolio');
  //     if (savedPortfolio) {
  //       const portfolioArray = JSON.parse(savedPortfolio);
  //       await supabase.from('portfolios').upsert({
  //         user_id: user.id,
  //         positions: portfolioArray,
  //         created_at: new Date().toISOString()
  //       });
  //     }

  //     // 3. Auto Trading Stocks
  //     const savedAutoStocks = localStorage.getItem('autoStocks');
  //     if (savedAutoStocks) {
  //       const autoArray = JSON.parse(savedAutoStocks);
  //       await supabase.from('auto_trades').upsert({
  //         user_id: user.id,
  //         symbol: autoArray,
  //         created_at: new Date().toISOString()
  //       });
  //     }

  //     console.log('✅ Migration from localStorage completed');

  //     // Optional: clear localStorage after successful migration
  //     // localStorage.removeItem('watchlist');
  //     // localStorage.removeItem('portfolio');
  //     // localStorage.removeItem('autoStocks');

  //   } catch (err) {
  //     console.error('Migration failed:', err);
  //   } finally {
  //     setIsMigrating(false);
  //   }
  // };

  // // Run migration once on mount (after login)
  // useEffect(() => {
  //   migrateFromLocalStorage();
  // }, []);

  //Ui start here
  return (
    <ProtectedRoute>
      <div className="flex flex-col h-screen bg-[#0a0c11] overflow-hidden">
        {/* Testing Mode Banner */}
        <div className="bg-amber-500/10 border-b border-amber-500/30 py-2.5 px-4 text-center text-amber-400 text-sm font-medium">
          🔬 Luckmi AI Testing Mode • Paper Trading Only • All trades are simulated • Feedback is very welcome!
        </div>
        {/* Top Navigation Bar */}
        <div className="bg-[#11151c] border-b border-gray-800 px-4 py-3 flex items-center justify-between sticky top-0 z-50">
          <div className="flex items-center gap-3">
            {/* Burger Menu - Mobile Only */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 text-gray-400 hover:text-white"
            >
              <span className="text-2xl">☰</span>
            </button>

            <div>
              <h1 className="font-semibold text-2xl tracking-tight">Luckmi AI</h1>
              <p className="text-xs text-emerald-400 font-medium tracking-widest">
                TRADING & INVESTMENTS
              </p>
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-8 text-sm font-medium">
            <a href="/stock" className="hover:text-blue-400 transition-colors">Stocks</a>
            <a href="#" onClick={() => alert("You are already on Auto Trading")} className="hover:text-blue-400 transition-colors">Auto Trading</a>
            <a href="#" onClick={() => setShowOptionsModal(true)} className="hover:text-blue-400 transition-colors">Options</a>
            <a href="#" onClick={() => setShowReportsModal(true)} className="hover:text-blue-400 transition-colors">Reports</a>
            <a href="#" onClick={() => setShowAccountModal(true)} className="hover:text-blue-400 transition-colors">Account</a>
            <a href="#" onClick={() => setShowGuideModal(true)} className="block py-4 px-5 hover:bg-[#1a1f2e] rounded-2xl">
              Testing Guide
            </a>
          </div>

          {/* Logout */}
          <button
            onClick={async () => {
              const supabase = createClient();
              await supabase.auth.signOut();
              window.location.href = '/login';
            }}
            className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 rounded-xl transition-colors"
          >
            Logout
          </button>
        </div>

        {/* Mobile Top Bar */}
        <div className="lg:hidden border-b border-gray-800 bg-[#11151c] px-4 py-3 flex items-center justify-between shrink-0">
          <h1 className="font-semibold text-lg">AI Trading Assistant</h1>
        </div>

        {/* Top Tabs */}
        <div className="bg-[#11151c] border-b border-gray-800 px-4 py-3 flex gap-8 shrink-0">
          <button
            onClick={() => setActiveTab('watchlist')}
            className={`font-semibold text-lg pb-2 transition-colors border-b-2 ${activeTab === 'watchlist'
              ? 'border-blue-500 text-white'
              : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
          >
            Watchlist
          </button>
          <button
            onClick={() => setActiveTab('portfolio')}
            className={`font-semibold text-lg pb-2 transition-colors border-b-2 ${activeTab === 'portfolio'
              ? 'border-blue-500 text-white'
              : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
          >
            Portfolio
          </button>
          <button
            onClick={() => setActiveTab('auto')}
            className={`font-semibold text-lg pb-2 transition-colors border-b-2 ${activeTab === 'auto'
              ? 'border-blue-500 text-white'
              : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
          >
            Auto
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">

          {/* LEFT SIDEBAR - Watchlist / Portfolio */}
          <aside className="w-full lg:w-72 border-b lg:border-r border-gray-800 bg-[#11151c] p-4 lg:p-5 overflow-y-auto lg:shrink-0 max-h-[38vh] lg:max-h-none">

            {activeTab === 'watchlist' ? (
              // WATCHLIST TAB
              <>
                <h2 className="text-lg font-semibold mb-4 text-gray-200">Watchlist ({watchlist.length})</h2>

                <div className="flex items-center justify-end mb-4">
                  {watchlist.length > 0 && (
                    <button
                      onClick={() => {
                        if (confirm("Clear entire watchlist?")) {
                          setWatchlist([]);
                          localStorage.removeItem("watchlist");
                          setSelectedStock(null);
                        }
                      }}
                      className="text-xs text-red-400 hover:text-red-300 transition-colors"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                <form onSubmit={handleWatchlistSubmit} className="flex gap-2 mb-6">
                  <input
                    type="text"
                    value={watchlistInput}
                    onChange={(e) => setWatchlistInput(e.target.value.toUpperCase())}
                    placeholder="Add ticker"
                    className="flex-1 px-3 py-2.5 bg-[#1a1f2e] border border-gray-700 rounded-md focus:outline-none focus:border-blue-500 text-white placeholder-gray-500 text-sm"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-md text-white text-sm font-medium transition-colors"
                  >
                    +
                  </button>
                </form>

                <div className="space-y-2.5 flex-1 overflow-y-auto">
                  {Array.isArray(watchlist) && watchlist.length > 0 ? (
                    watchlist.map((symbol: string) => {
                      const quote = quotes[symbol] || { price: '—', change: '0', percentChange: '0' };
                      const isSelected = selectedStock === symbol;
                      return (
                        <div
                          key={symbol}
                          onClick={() => setSelectedStock(symbol)}
                          className={`group flex items-center justify-between p-3.5 rounded-2xl cursor-pointer transition-all hover:bg-[#1a1f2e] border ${selectedStock === symbol
                            ? 'bg-[#1a1f2e] border-blue-500'
                            : 'border-transparent hover:border-gray-700'
                            }`}
                        >
                          <div className="font-semibold text-white">{symbol}</div>

                          <div className="flex items-center gap-3 text-sm">
                            <div className="font-mono text-right">
                              ${parseFloat(quote.price).toFixed(2)}
                            </div>

                            <div className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${parseFloat(quote.percentChange) >= 0
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-red-500/20 text-red-400'
                              }`}>
                              {parseFloat(quote.percentChange) >= 0 ? '+' : ''}
                              {parseFloat(quote.percentChange).toFixed(1)}%
                            </div>
                            {/* Chart Icon - Opens Modal Directly */}
                            {isSelected && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();           // Prevent triggering row click
                                  setShowChartModal(true);
                                }}
                                className="p-3 text-blue-400 hover:text-blue-300 hover:bg-blue-900/40 rounded-2xl transition-all text-2xl active:scale-95"
                                title="View Full Chart"
                              >
                                📊
                              </button>
                            )}

                            {/* Delete Button - Always visible on mobile */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(`Remove ${symbol} from watchlist?`)) {
                                  const newWatchlist = watchlist.filter(s => s !== symbol);
                                  setWatchlist(newWatchlist);
                                  localStorage.setItem("watchlist", JSON.stringify(newWatchlist));
                                  if (selectedStock === symbol) setSelectedStock(null);
                                }
                              }}
                              className="p-2 text-red-400 hover:text-red-500 hover:bg-red-900/30 rounded-xl transition-all text-lg lg:opacity-0 lg:group-hover:opacity-100"
                            >
                              ✕
                            </button>
                            {/* Mini CTS if available */}
                            {watchlistCtsScores[symbol] !== undefined && (
                              <div className={`text-xs font-mono px-2 py-0.5 rounded-md ${watchlistCtsScores[symbol] >= 70 ? 'bg-emerald-500/20 text-emerald-400' :
                                watchlistCtsScores[symbol] >= 55 ? 'bg-yellow-500/20 text-yellow-400' :
                                  'bg-red-500/20 text-red-400'
                                }`}>
                                {watchlistCtsScores[symbol]}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-gray-500 text-sm py-12 text-center border border-dashed border-gray-700 rounded-2xl">
                      {isMigrating ? 'Loading your watchlist from Supabase...' : 'Your watchlist is empty.<br />Add stocks using the input above.'}
                    </div>
                  )}
                </div>
              </>
            ) : activeTab === 'portfolio' ? (
              // PORTFOLIO TAB CONTENT - your existing code (unchanged)
              <>
                <div className="space-y-6">

                  {/* Portfolio Summary Card */}
                  {portfolio.length > 0 && (
                    <div className="bg-gradient-to-br from-[#1a1f2e] to-[#11151c] border border-gray-700 rounded-3xl p-4 lg:p-5">   {/* Reduced padding */}

                      <div className="flex justify-between items-center">
                        <div>
                          <div className="text-xs text-gray-400">Total Portfolio Value</div>
                          <div className="text-3xl font-bold text-white mt-1">   {/* Smaller text */}
                            ${portfolio.reduce((total, pos) => {
                              const quote = quotes[pos.symbol];
                              const currentPrice = quote ? Number(quote.price) : 0;
                              return total + (currentPrice * Number(pos.quantity));
                            }, 0).toFixed(2)}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-xs text-gray-400">Total P&L</div>
                          <div className={`text-xl font-semibold mt-1 ${   // Smaller text
                            portfolio.reduce((total, pos) => {
                              const quote = quotes[pos.symbol];
                              const currentPrice = quote ? Number(quote.price) : 0;
                              return total + ((currentPrice - Number(pos.entryPrice)) * Number(pos.quantity));
                            }, 0) >= 0 ? 'text-green-400' : 'text-red-400'
                            }`}>
                            ${portfolio.reduce((total, pos) => {
                              const quote = quotes[pos.symbol];
                              const currentPrice = quote ? Number(quote.price) : 0;
                              return total + ((currentPrice - Number(pos.entryPrice)) * Number(pos.quantity));
                            }, 0).toFixed(2)}
                          </div>
                        </div>
                      </div>

                      {/* Small stats row */}
                      <div className="grid grid-cols-2 gap-4 mt-4 text-xs">
                        <div>
                          <span className="text-gray-400">Holdings:</span>
                          <span className="font-medium text-white ml-1.5">{portfolio.length}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">Avg Return:</span>
                          <span className={`font-medium ml-1.5 ${portfolio.length > 0
                            ? (portfolio.reduce((sum, pos) => {
                              const quote = quotes[pos.symbol];
                              const currentPrice = quote ? Number(quote.price) : 0;
                              return sum + ((currentPrice - Number(pos.entryPrice)) / Number(pos.entryPrice)) * 100;
                            }, 0) / portfolio.length) >= 0 ? 'text-green-400' : 'text-red-400'
                            : 'text-gray-400'
                            }`}>
                            {portfolio.length > 0
                              ? (portfolio.reduce((sum, pos) => {
                                const quote = quotes[pos.symbol];
                                const currentPrice = quote ? Number(quote.price) : 0;
                                return sum + ((currentPrice - Number(pos.entryPrice)) / Number(pos.entryPrice)) * 100;
                              }, 0) / portfolio.length).toFixed(1) + '%'
                              : '—'
                            }
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Add Position Button */}
                  <div className="flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-gray-200">Holdings ({portfolio.length})</h2>
                    <button
                      onClick={() => setShowAddPosition(true)}
                      className="px-5 py-2 bg-green-600 hover:bg-green-700 rounded-xl text-sm font-medium transition-colors"
                    >
                      + Add Position
                    </button>
                  </div>

                  {/* Portfolio Items List */}
                  {portfolio.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      Your portfolio is empty.<br />
                      Add your first position above.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {portfolio.map((pos, index) => {
                        const quote = quotes[pos.symbol];
                        const currentPrice = quote ? Number(quote.price) : 0;
                        const entryPrice = Number(pos.entryPrice);
                        const quantity = Number(pos.quantity);

                        const marketValue = currentPrice * quantity;
                        const costBasis = entryPrice * quantity;
                        const pnl = marketValue - costBasis;
                        const pnlPercent = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;

                        const isSelected = selectedStock === pos.symbol;
                        const miniCts = isSelected && finalCtsScore !== null ? finalCtsScore : null;

                        const isPriceLoaded = currentPrice > 0;

                        return (
                          <div
                            key={index}
                            onClick={() => setSelectedStock(pos.symbol)}
                            className={`p-4 rounded-2xl border transition-all cursor-pointer ${isSelected ? 'bg-blue-900/30 border-blue-500' : 'bg-[#1a1f2e] border-transparent hover:bg-[#242a3a]'
                              }`}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="font-semibold text-lg">{pos.symbol}</div>
                                <div className="text-xs text-gray-400">
                                  {quantity} shares @ ${entryPrice.toFixed(2)}
                                </div>
                              </div>

                              <div className="text-right">
                                {isPriceLoaded ? (
                                  <>
                                    <div className="font-medium">${currentPrice.toFixed(2)}</div>
                                    <div className={`text-sm font-medium ${pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                      {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(1)}%
                                    </div>
                                  </>
                                ) : (
                                  <div className="text-sm text-gray-500">Loading price...</div>
                                )}
                              </div>
                            </div>

                            <div className="mt-3 flex justify-between items-center">
                              {isPriceLoaded ? (
                                <div className={`font-medium ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  P&L: ${pnl.toFixed(2)}
                                </div>
                              ) : (
                                <div className="text-sm text-gray-500">P&L: —</div>
                              )}

                              {miniCts !== null && (
                                <span className={`px-3 py-1 rounded text-xs font-mono ${miniCts >= 65 ? 'bg-green-900/40 text-green-400' :
                                  miniCts >= 53 ? 'bg-yellow-900/40 text-yellow-400' : 'bg-red-900/40 text-red-400'
                                  }`}>
                                  CTS {miniCts}
                                </span>
                              )}
                              {/* Chart Icon - Opens Modal Directly */}
                              {isSelected && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();           // Prevent triggering row click
                                    setShowChartModal(true);
                                  }}
                                  className="p-3 text-blue-400 hover:text-blue-300 hover:bg-blue-900/40 rounded-2xl transition-all text-2xl active:scale-95"
                                  title="View Full Chart"
                                >
                                  📊
                                </button>
                              )}

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm(`Remove ${pos.symbol} from portfolio?`)) {
                                    const newPortfolio = portfolio.filter((_, i) => i !== index);
                                    setPortfolio(newPortfolio);
                                    localStorage.setItem('portfolio', JSON.stringify(newPortfolio));
                                    if (selectedStock === pos.symbol) setSelectedStock(null);
                                  }
                                }}
                                className="text-red-400 hover:text-red-500 text-lg"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </aside>
          {/* MAIN CONTENT AREA - This is where Auto tab (and future rich content) lives comfortably */}
          <main className="flex-1 overflow-y-auto bg-[#0a0c11] p-2 lg:p-6 min-h-0">
            {/* Scrollable Tab Content */}
            <div className="flex-1 overflow-y-auto p-4 lg:p-6">
              {activeTab === 'auto' && (
                <div className="max-w-5xl mx-auto">
                  <div className="space-y-6">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h2 className="text-2xl font-semibold text-white">Auto Paper Trading</h2>
                        <p className="text-gray-400 text-sm mt-1">
                          AI-powered simulated trading • Max 3 stocks • AI has final veto
                        </p>
                      </div>

                      {/* Last Updated Timestamp */}
                      {lastUpdated && (
                        <div className="text-xs text-gray-500 text-right mb-4">
                          Last updated: {lastUpdated.toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      )}

                      {/* Auto Trading Portfolio Summary */}
                      <div className="bg-[#11151c] border border-gray-700 rounded-3xl p-6 mb-8">
                        <div className="flex justify-between items-center mb-6">
                          <div>
                            <div className="text-lg font-semibold">Auto Trading Portfolio</div>
                            <div className="text-xs text-gray-400">Live Paper Trading Performance</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm text-gray-400">Total Allocation</div>
                            <div className="text-2xl font-mono font-semibold">
                              ${autoStocks.reduce((sum, s) => sum + (s.allocation || 0), 0).toLocaleString()}
                            </div>
                          </div>
                        </div>

                        {/* Overall P&L */}
                        {(() => {
                          let totalInvested = 0;
                          let totalCurrentValue = 0;

                          autoStocks.forEach(stock => {
                            if (stock.currentPosition) {
                              const currentPrice = toNumber(quotes[stock.symbol]?.price || 0);
                              totalInvested += stock.currentPosition.shares * stock.currentPosition.entryPrice;
                              totalCurrentValue += stock.currentPosition.shares * currentPrice;
                            }
                          });

                          const totalPnL = totalCurrentValue - totalInvested;
                          const totalPnLPercent = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

                          return (
                            <div className={`p-5 rounded-2xl ${totalPnL >= 0 ? 'bg-emerald-900/30 border border-emerald-500/50' : 'bg-red-900/30 border border-red-500/50'}`}>
                              <div className="flex justify-between items-center">
                                <div className="text-sm text-gray-400">Overall Unrealized P&L</div>
                                <div className={`text-2xl font-mono font-semibold ${totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(0)}
                                  <span className="text-sm">({totalPnLPercent.toFixed(1)}%)</span>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setIsAutoMonitoring(!isAutoMonitoring)}
                          className={`px-6 py-3 rounded-2xl font-medium transition-all flex items-center gap-2 ${isAutoMonitoring
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                            }`}
                        >
                          {isAutoMonitoring ? '⏹️ Stop Monitoring' : '▶️ Start Monitoring'}
                        </button>

                        <button
                          onClick={() => setShowAddAutoModal(true)}
                          disabled={autoStocks.length >= 3}
                          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed px-6 py-3 rounded-2xl font-medium flex items-center gap-2 transition-colors"
                        >
                          + Add Stock
                        </button>
                      </div>
                    </div>

                    {/* Market Status Banner */}
                    <div className={`rounded-2xl p-4 flex items-center gap-3 text-sm ${isMarketOpen()
                      ? 'bg-emerald-900/30 border border-emerald-600 text-emerald-300'
                      : 'bg-amber-900/30 border border-amber-600 text-amber-300'
                      }`}>
                      <div className="text-xl">
                        {isMarketOpen() ? '🟢' : '🔴'}
                      </div>
                      <div>
                        {isMarketOpen()
                          ? 'Market is currently OPEN — Auto monitoring is active'
                          : 'Market is currently CLOSED — Auto monitoring is paused until next trading session'}
                      </div>
                    </div>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-[#1a1f2e] rounded-3xl p-6">
                        <p className="text-gray-400 text-sm">Stocks in Auto</p>
                        <p className="text-4xl font-bold mt-2">{autoStocks.length}/3</p>
                      </div>
                      <div className="bg-[#1a1f2e] rounded-3xl p-6">
                        <p className="text-gray-400 text-sm">Active Positions</p>
                        <p className="text-4xl font-bold mt-2 text-emerald-400">
                          {autoStocks.filter(s => s.status === 'in-position').length}
                        </p>
                      </div>
                      <div className="bg-[#1a1f2e] rounded-3xl p-6">
                        <p className="text-gray-400 text-sm">Total Allocated</p>
                        <p className="text-4xl font-bold mt-2">
                          ${autoStocks.reduce((sum, s) => sum + (s.allocation || 0), 0).toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-[#1a1f2e] rounded-3xl p-6">
                        <p className="text-gray-400 text-sm">Monitoring</p>
                        <p className={`text-4xl font-bold mt-2 ${isAutoMonitoring ? 'text-emerald-400' : 'text-gray-500'}`}>
                          {isAutoMonitoring ? 'ON' : 'OFF'}
                        </p>
                      </div>
                    </div>

                    {/* Auto Stocks List */}
                    <div className="bg-[#11151c] rounded-3xl border border-gray-700 overflow-hidden">
                      {autoStocks.length === 0 ? (
                        <div className="py-20 text-center text-gray-400">
                          No stocks added to Auto Trading yet.<br />
                          Click "+ Add Stock" to begin simulated trading.
                        </div>
                      ) : (

                        <div className="divide-y divide-gray-800">
                          {/* Auto Stock Card - Clean with subtle indicators */}
                          {autoStocks.map((stock, index) => {
                            const currentPrice = toNumber(quotes[stock.symbol]?.price || 0);
                            const invested = stock.currentPosition
                              ? stock.currentPosition.shares * currentPrice
                              : 0;
                            const remainingCash = (stock.allocation || 0) - invested;
                            const unrealizedPnL = stock.currentPosition
                              ? (currentPrice - stock.currentPosition.entryPrice) * stock.currentPosition.shares
                              : 0;
                                // Direction indicator
                            const priceChange = toNumber(quotes[stock.symbol]?.change || 0);
                            const isUp = priceChange >= 0;
                            const percentChange = parseFloat(quotes[stock.symbol]?.percentChange);
                            return (
                              <div key={stock.id} className="bg-[#11151c] border border-gray-700 rounded-3xl p-6">
                                <div className="flex justify-between items-start">
                                  <div>
                                    <div className="font-semibold text-xl">{stock.symbol}</div>
                                    <div className="text-xs text-gray-400">Auto Trading</div>
                                  </div>
                                  <div className="text-right">
                                    <div className={`text-2xl font-mono font-semibold flex items-center gap-1 justify-end ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                                      ${currentPrice.toFixed(2)}
                                      <span className="text-lg">{isUp ? '↑' : '↓'}</span>
                                    </div>
                                    <div className={`text-xs ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                                      {isUp ? '+' : ''}{priceChange.toFixed(2)} ({percentChange.toFixed(1)}%)
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-end gap-1">
                                    <div className={`px-3 py-0.5 text-xs rounded-full ${stock.status === 'in-position'
                                      ? 'bg-emerald-500/20 text-emerald-400'
                                      : 'bg-gray-700 text-gray-400'
                                      }`}>
                                      {stock.status === 'in-position' ? 'In Position' : 'Monitoring'}
                                    </div>

                                    {/* Subtle indicators */}
                                    <div className="flex gap-2 text-[10px] text-gray-500">
                                      {stock.compoundProfits && <span className="bg-emerald-900/50 px-2 py-0.5 rounded">♻️ Compound</span>}
                                      {stock.rinseRepeat && <span className="bg-blue-900/50 px-2 py-0.5 rounded">🔄 Repeat ×{stock.maxRepeats}</span>}
                                    </div>
                                  </div>
                                </div>

                                {/* Allocation Summary */}
                                <div className="mt-6 grid grid-cols-3 gap-4 text-sm">
                                  <div>
                                    <div className="text-gray-400 text-xs">Total Allocation</div>
                                    <div className="font-mono font-medium">${(stock.allocation || 0).toLocaleString()}</div>
                                  </div>
                                  <div>
                                    <div className="text-gray-400 text-xs">Invested</div>
                                    <div className="font-mono">${invested.toFixed(0)}</div>
                                  </div>
                                  <div>
                                    <div className="text-gray-400 text-xs">Unrealized P&L</div>
                                    <div className={`font-mono ${unrealizedPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                      {unrealizedPnL >= 0 ? '+' : ''}${unrealizedPnL.toFixed(0)}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-gray-400 text-xs">Remaining</div>
                                    <div className={`font-mono ${remainingCash > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                      ${remainingCash.toFixed(0)}
                                    </div>
                                  </div>
                                  {/* <div>
                                      <div className="text-gray-400 text-xs">Current Value</div>
                                      <div className="font-mono">${(stock.currentPosition ? stock.currentPosition.shares * currentPrice : 0).toFixed(0)}</div>
                                    </div> */}
                                </div>

                                {/* Action Buttons */}
                                <div className="mt-6 flex gap-3">
                                  <button
                                    onClick={() => {
                                      setSelectedAutoStock(stock);
                                      setBuyMoreAmount(0);
                                      setShowBuyMoreModal(true);
                                    }}
                                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 rounded-2xl text-sm font-medium transition-colors"
                                  >
                                    Buy More
                                  </button>

                                  {stock.status === 'in-position' && (
                                    <button
                                      onClick={() => manualSell(stock.symbol)}
                                      className="flex-1 py-3 bg-red-600 hover:bg-red-700 rounded-2xl text-sm font-medium transition-colors"
                                    >
                                      Sell Now
                                    </button>
                                  )}

                                  <button
                                    onClick={() => {
                                      if (confirm(`Remove ${stock.symbol} from Auto Trading?`)) {
                                        setAutoStocks(prev => prev.filter((_, i) => i !== index));
                                      }
                                    }}
                                    className="px-5 py-3 bg-gray-800 hover:bg-red-900/50 text-red-400 rounded-2xl text-sm font-medium transition-colors"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Activity Log */}
                    {autoLog.length > 0 && (
                      <div className="mt-8">
                        <h3 className="text-lg font-medium mb-3 text-white">Activity Log</h3>
                        <div className="bg-[#1a1f2e] rounded-3xl p-5 text-sm max-h-64 overflow-y-auto space-y-2">
                          {autoLog.slice(0, 20).map((log, i) => (
                            <div key={i} className="flex gap-3 text-gray-300">
                              <span className="text-gray-500 whitespace-nowrap font-mono text-xs pt-0.5">
                                {new Date(log.time).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit'
                                })}
                              </span>
                              <span>{log.message}</span>
                            </div>
                          ))}
                          {autoLog.length > 20 && (
                            <div className="text-center text-xs text-gray-500 pt-2">
                              ... {autoLog.length - 20} more events
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Improved Trade History Panel */}
                    <div className="mt-12">
                      <div className="flex items-center justify-between mb-5">
                        <h3 className="text-lg font-semibold text-white">Trade History</h3>
                        <span className="text-xs bg-gray-700 px-3 py-1 rounded-full font-mono">
                          {autoStocks.reduce((sum, s) => sum + (s.tradeHistory?.length || 0), 0)} trades
                        </span>
                      </div>

                      {autoStocks.every(s => !s.tradeHistory || s.tradeHistory.length === 0) ? (
                        <div className="bg-[#11151c] border border-dashed border-gray-700 rounded-3xl p-16 text-center">
                          <p className="text-gray-400">No trades yet</p>
                          <p className="text-xs text-gray-500 mt-2">Auto trading activity will appear here when buys or sells happen</p>
                        </div>
                      ) : (
                        <div className="bg-[#11151c] border border-gray-700 rounded-3xl divide-y divide-gray-800 overflow-hidden">
                          {autoStocks.flatMap(stock =>
                            (stock.tradeHistory || []).map((trade: any, idx: number) => (
                              <div key={`${stock.symbol}-${idx}`} className="p-5 hover:bg-[#1a1f2e] transition-colors">
                                <div className="flex justify-between">
                                  <div>
                                    <div className="font-medium flex items-center gap-2">
                                      {trade.type === 'buy' || trade.type === 'buy_more' ? (
                                        <span className="text-emerald-400">🟢 BUY</span>
                                      ) : (
                                        <span className="text-red-400">🔴 SELL</span>
                                      )}
                                      {trade.shares} shares of {stock.symbol}
                                    </div>
                                    <div className="text-xs text-gray-400 mt-1">
                                      {trade.time.toLocaleString()} • {trade.reason}
                                    </div>
                                  </div>

                                  <div className="text-right">
                                    <div className="font-mono text-sm">
                                      @ ${Number(trade.price).toFixed(2)}
                                    </div>
                                    {trade.pnl !== undefined && (
                                      <div className={`text-sm font-medium ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {trade.pnl >= 0 ? '+' : ''}${Number(trade.pnl).toFixed(2)}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    {/* Ai Thinking/Busy */}
                    {isAiThinking && (
                      <div className="fixed bottom-4 right-4 bg-[#11151c] border border-gray-700 text-xs px-4 py-2 rounded-2xl flex items-center gap-2 z-50">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                        AI Thinking...
                      </div>
                    )}
                  </div>
                </div>
              )}
              {autoStocks.every(s => !s.tradeHistory || s.tradeHistory.length === 0) && (
                <div className="mt-10 text-center py-12 text-gray-500">
                  No trades yet.<br />Auto trading will appear here when buys/sells happen.
                </div>
              )}
            </div>
            {/* CTS + AI + News - Show on ALL tabs when a stock is selected */}
            {selectedStock && (
              <div className="mb-8">
                {/* Middle Area - Shared Analysis (CTS + AI + News) */}
                <div className="p-2 lg:p-6 overflow-y-auto flex-1 space-y-5 lg:space-y-6">

                  {/* Timeframe Info Bar */}
                  {selectedStock && (
                    <div className="bg-[#1a1f2e] border border-gray-700 rounded-2xl px-5 py-3 flex items-center justify-between text-sm">
                      <div className="flex items-center gap-4">
                        <span className="text-gray-400">Chart Data:</span>
                        <span className="font-medium text-white">{timeRange}</span>
                        <span className="text-gray-500">•</span>
                        <span className="font-medium text-white">
                          {resolution === 'D' ? 'Daily' : resolution + 'min'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">Used for CTS calculation</div>
                    </div>
                  )}

                  {/* CTS Card - With Stock Symbol */}
                  {selectedStock && finalCtsScore !== null && (
                    <div className={`rounded-3xl p-5 lg:p-7 border shadow-2xl ${finalCtsScore >= 67 ? 'bg-gradient-to-br from-emerald-950 to-green-950 border-emerald-600' :
                      finalCtsScore >= 52 ? 'bg-gradient-to-br from-amber-950 to-yellow-950 border-amber-600' :
                        'bg-gradient-to-br from-red-950 to-rose-950 border-red-600'
                      }`}>

                      {/* Stock Header */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl font-bold text-white">{selectedStock}</span>
                          {quotes[selectedStock] && (
                            <span className="text-sm text-gray-400">
                              ${Number(quotes[selectedStock].price).toFixed(2)}
                            </span>
                          )}
                        </div>

                        <span className={`px-4 py-1 rounded-2xl text-sm font-semibold ${tradeRecommendation.includes('Buy') ? 'bg-green-500/20 text-green-400' :
                          tradeRecommendation === 'Hold' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'
                          }`}>
                          {tradeRecommendation}
                        </span>
                      </div>

                      {/* Main Score */}
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="text-lg font-semibold text-white">Luckmi Score</div>
                        </div>
                        <div className="text-right">
                          <div className={`text-6xl lg:text-8xl font-mono font-bold ${finalCtsScore >= 85 ? 'text-emerald-400' :
                            finalCtsScore >= 70 ? 'text-blue-400' :
                              finalCtsScore >= 55 ? 'text-yellow-400' : 'text-red-400'}`}>
                            {finalCtsScore}
                          </div>
                        </div>
                      </div>

                      <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden mb-5">
                        <div
                          className={`h-full transition-all duration-500 
                            ${finalCtsScore >= 85 ? 'bg-emerald-500' :
                              finalCtsScore >= 70 ? 'bg-blue-500' :
                                finalCtsScore >= 55 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                          style={{ width: `${finalCtsScore}%` }}
                        />
                      </div>
                      <div className="text-xs text-gray-400 leading-relaxed">
                        Luckmi Score measures how strong the overall setup is by combining technical signals,
                        momentum, and market structure. Higher scores mean better probability of a successful move.
                      </div>
                      {/* Caution / Timeframe Info */}
                      <div className="mt-4 pt-4 border-t border-gray-700/50 text-xs text-amber-400 flex items-center gap-2">
                        <span>⚠️</span>
                        <span>
                          Based on <span className="font-medium text-white">{timeRange} • {resolution === 'D' ? 'Daily' : resolution + 'min'}</span><br />
                          Short-term views can be more optimistic. Always check Daily view.
                        </span>
                      </div>

                      {/* Why this score? */}
                      <details
                        className="mt-5 text-sm"
                        onClick={(e) => {
                          e.preventDefault();
                          setShowCtsModal(true);
                        }}
                      >
                        <summary className="cursor-pointer text-blue-400 hover:text-blue-300 font-medium">
                          How Luckmi Score works →
                        </summary>
                        <div className="mt-4 text-xs text-gray-300 bg-black/30 p-5 rounded-2xl space-y-3">
                          <div><strong>Raw Base Score:</strong> {rawBaseScore} — strength of technical signals before filters</div>
                          <div><strong>Volatility filter:</strong> {filtersApplied?.volatility ? 'Applied (reduced score due to low movement)' : 'Not applied'}</div>
                          <div><strong>Structure filter:</strong> {filtersApplied?.structure ? 'Applied' : 'Not applied'}</div>
                          <div><strong>Relative Strength:</strong> {filtersApplied?.relativeStrength ? 'Applied' : 'Not applied'}</div>

                          <div className="pt-3 border-t border-gray-700 text-emerald-300 text-[13px]">
                            Higher score = stronger confluence of bullish factors.<br />
                            Scores above 65 indicate Buy Zone potential.<br />
                            Scores below 55 suggest caution (Avoid or Sell Zone).
                          </div>
                        </div>
                      </details>
                    </div>
                  )}

                  {/* Consensus Banner - Polished */}
                  {consensusStatus && (
                    <div className={`mt-3 p-4 rounded-2xl border text-sm flex items-start gap-3 ${consensusStatus === 'Strong Agreement'
                      ? 'bg-emerald-900/30 border-emerald-600 text-emerald-300'
                      : consensusStatus === 'Conflict'
                        ? 'bg-red-900/30 border-red-600 text-red-300'
                        : 'bg-amber-900/30 border-amber-600 text-amber-300'
                      }`}>

                      <div className="mt-0.5 text-xl">
                        {consensusStatus === 'Strong Agreement' && '✅'}
                        {consensusStatus === 'Conflict' && '⚠️'}
                        {consensusStatus === 'Mild Agreement' && '⚠️'}
                      </div>

                      <div>
                        <p className="font-medium">
                          {consensusStatus === 'Strong Agreement' && 'Strong Agreement'}
                          {consensusStatus === 'Conflict' && 'Conflict Detected'}
                          {consensusStatus === 'Mild Agreement' && 'Mild Agreement'}
                        </p>
                        <p className="text-xs leading-relaxed mt-1 opacity-90">
                          {consensusStatus === 'Strong Agreement' &&
                            'Luckmi and AI analysis are well aligned. High confidence setup.'}
                          {consensusStatus === 'Conflict' &&
                            'Luckmi and AI disagree. Exercise extra caution and verify with your own analysis.'}
                          {consensusStatus === 'Mild Agreement' &&
                            'Luckmi and AI are mostly aligned but not fully in sync. Consider additional confirmation.'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* AI Recommendation Card - Purple Border + Modern Polish */}
                  {aiRecommendation && selectedStock && (
                    <div className="rounded-3xl p-6 border border-purple-500/60 bg-[#11151c] shadow-2xl">

                      {/* Header */}
                      <div className="flex items-center justify-between mb-5">
                        <div>
                          <p className="text-xs uppercase tracking-widest text-purple-400">AI ANALYSIS</p>
                          <p className="text-2xl font-semibold text-white mt-1">{selectedStock}</p>
                        </div>

                        {/* Action Badge */}
                        <div className={`px-5 py-1.5 rounded-2xl font-semibold text-sm flex items-center gap-2 ${aiRecommendation.action === 'Buy' || aiRecommendation.action === 'Strong Buy'
                          ? 'bg-emerald-600 text-white'
                          : aiRecommendation.action === 'Sell'
                            ? 'bg-red-600 text-white'
                            : 'bg-amber-600 text-white'
                          }`}>
                          {aiRecommendation.action}
                        </div>
                      </div>

                      {/* AI Score */}
                      <div className="flex items-baseline gap-3 mb-6">
                        <span className="text-sm text-gray-400">AI Score</span>
                        <span className="text-4xl font-bold text-white">
                          {aiRecommendation.aiScore !== null ? aiRecommendation.aiScore : '—'}
                        </span>
                        <span className="text-gray-500">/100</span>
                      </div>

                      {/* Reason */}
                      <div className="text-[15px] leading-relaxed text-gray-200 mb-6">
                        {aiRecommendation.reason}
                      </div>

                      {/* Footer */}
                      <div className="pt-4 border-t border-gray-800 flex justify-between text-xs text-gray-500">
                        <div>Confidence: <span className="text-gray-400">{aiRecommendation.confidence}%</span></div>
                        <div>Updated just now</div>
                      </div>
                    </div>
                  )}

                  {/* News Panel */}
                  <div className="bg-[#11151c] rounded-3xl p-5 lg:p-7 border border-gray-700">
                    <div className="flex gap-8 border-b border-gray-700 pb-4 mb-6">
                      <button
                        onClick={() => setShowStockNews(true)}
                        className={`font-semibold text-base lg:text-lg pb-1 transition-colors ${showStockNews ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400'
                          }`}
                      >
                        Stock News
                      </button>
                      <button
                        onClick={() => setShowStockNews(false)}
                        className={`font-semibold text-base lg:text-lg pb-1 transition-colors ${!showStockNews ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400'
                          }`}
                      >
                        Market News
                      </button>
                    </div>

                    {showStockNews && selectedStock && newsData.length > 0 ? (
                      // Stock-specific news
                      <div className="space-y-6">
                        {newsData.slice(0, 6).map((item: any, i: number) => (
                          <div key={i} className="border-l-2 border-gray-700 pl-5">
                            <p className="font-medium text-gray-100 leading-tight">{item.headline}</p>
                            {item.summary && <p className="text-sm text-gray-400 mt-2 line-clamp-3">{item.summary}</p>}

                            {/* Read more link - more robust */}
                            {item.url ? (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 text-xs mt-3 inline-block"
                              >
                                Read more →
                              </a>
                            ) : (
                              <a
                                href={`https://www.google.com/search?q=${encodeURIComponent(selectedStock + " stock news")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 text-xs mt-3 inline-block"
                              >
                                Search news for {selectedStock} →
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      // Market News
                      <div>
                        <p className="font-medium text-gray-200 mb-4">
                          Today's Market Headlines
                        </p>

                        {isLoadingMarketNews ? (
                          <div className="text-gray-500 py-8 text-center">Loading market news...</div>
                        ) : marketNews.length > 0 ? (
                          <div className="space-y-6 text-sm">
                            {marketNews.map((item: any, i: number) => (
                              <div key={i} className="border-l-2 border-gray-700 pl-5">
                                <p className="font-medium text-gray-100 leading-tight">{item.headline}</p>
                                {item.summary && <p className="text-sm text-gray-400 mt-2 line-clamp-3">{item.summary}</p>}
                                {(item.url || item.link) && (
                                  <a
                                    href={item.url || item.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-400 hover:text-blue-300 text-xs mt-3 inline-block"
                                  >
                                    Read more →
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="space-y-6 text-sm">
                            <div className="border-l-2 border-gray-700 pl-5">
                              <p className="font-medium text-gray-100">Major indices mixed as traders await upcoming economic data...</p>
                            </div>
                            <div className="border-l-2 border-gray-700 pl-5">
                              <p className="font-medium text-gray-100">Tech sector leads gains on continued AI momentum...</p>
                            </div>
                            <div className="border-l-2 border-gray-700 pl-5">
                              <p className="font-medium text-gray-100">Oil prices remain steady amid geopolitical tensions...</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </main>

          {/* Right Sidebar - Chart (Desktop only) */}
          <div className="hidden lg:flex w-[10%] border-l border-gray-800 bg-[#11151c] flex-col shrink-0 overflow-hidden">
            {/* Chart Area */}
            <div className="flex-1 border-b border-gray-800 overflow-hidden relative">
              {selectedStock ? (
                <div className="h-full p-2">
                  {/* Your chart component goes here */}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500 text-sm px-4 text-center">
                  Select a stock to view chart
                </div>
              )}
            </div>

            {/* Top 10 Trending */}
            <div className="h-96 overflow-y-auto p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-orange-400">🔥</span>
                  <h3 className="font-semibold">Top 10 Trending</h3>
                </div>
                <button className="text-xs text-blue-400">Refresh</button>
              </div>
              <div className="text-sm text-gray-400">
                Trending data will appear here during market hours
              </div>
            </div>
          </div>
        </div>

        {/* Footer Disclaimer */}
        <footer className="border-t border-gray-800 bg-[#0a0c11] py-3 px-6 text-[10px] text-gray-500 text-center lg:text-left shrink-0">
          For educational purposes only • Not financial advice • Trading involves substantial risk of loss
        </footer>

        {/* How Luckmi Score Works Modal */}
        {showCtsModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[90] p-6">
            <div className="bg-[#11151c] rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-700">
              <div className="p-8">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-3xl font-bold">How Luckmi Score Works</h2>
                  <button
                    onClick={() => setShowCtsModal(false)}
                    className="text-3xl text-gray-400 hover:text-white"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-10 text-gray-300">
                  <div>
                    <h3 className="text-xl font-semibold mb-3 text-white">What is Luckmi Score?</h3>
                    <p className="leading-relaxed">
                      Luckmi Score is a 0–100 rating that shows how strong a stock's trading setup is.
                      It combines multiple technical signals, momentum, volume, and market structure into one easy number.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold mb-4 text-white">Score Zones</h3>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="bg-emerald-950/60 border border-emerald-500 rounded-2xl p-5">
                        <div className="font-medium text-emerald-400">85–100: Strong Buy Zone</div>
                        <div className="text-sm text-gray-400 mt-1">High conviction opportunity. Best setups.</div>
                      </div>
                      <div className="bg-blue-950/60 border border-blue-500 rounded-2xl p-5">
                        <div className="font-medium text-blue-400">70–84: Buy Zone</div>
                        <div className="text-sm text-gray-400 mt-1">Favorable setup. Good probability.</div>
                      </div>
                      <div className="bg-yellow-950/60 border border-yellow-500 rounded-2xl p-5">
                        <div className="font-medium text-yellow-400">55–69: Hold Zone</div>
                        <div className="text-sm text-gray-400 mt-1">Neutral. Wait for better confirmation.</div>
                      </div>
                      <div className="bg-red-950/60 border border-red-500 rounded-2xl p-5">
                        <div className="font-medium text-red-400">Below 55: Avoid / Sell Zone</div>
                        <div className="text-sm text-gray-400 mt-1">Low probability or high risk.</div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold mb-3 text-white">Why This Score Matters</h3>
                    <p className="leading-relaxed">
                      Instead of looking at many indicators separately, Luckmi Score gives you one clear number.
                      Higher score = stronger alignment of bullish factors. This helps remove emotion and makes decisions easier.
                    </p>
                  </div>

                  <div className="bg-red-950/30 border border-red-800 rounded-2xl p-6 text-sm">
                    <p className="font-semibold text-red-400 mb-2">Important Disclaimer</p>
                    <p className="text-gray-400 leading-relaxed">
                      Luckmi Score and AI recommendations are for educational and informational purposes only.
                      They are not financial advice. Trading involves significant risk of loss.
                      Always do your own research.
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-700 p-6 flex justify-end">
                <button
                  onClick={() => setShowCtsModal(false)}
                  className="px-8 py-3 bg-blue-600 hover:bg-blue-700 rounded-2xl font-medium transition-colors"
                >
                  Got it, thanks
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Universal Chart Modal - Works on Both Mobile and Desktop */}
        {showChartModal && selectedStock && (
          <div className="fixed inset-0 bg-black/90 z-[80] flex items-center justify-center p-4">
            <div className="bg-[#11151c] rounded-3xl w-full max-w-6xl max-h-[95vh] overflow-hidden border border-gray-700 flex flex-col">

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-[#11151c] shrink-0">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">📊</span>
                  <div>
                    <div className="font-semibold text-xl">{selectedStock} - Full Chart</div>
                    <div className="text-xs text-gray-400">
                      Timeframe: {timeRange} • Resolution: {resolution === 'D' ? 'Daily' : resolution + 'min'}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setShowChartModal(false)}
                  className="text-3xl text-gray-400 hover:text-white p-2 transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Chart Content Area */}
              <div className="flex-1 bg-[#0a0c11] relative overflow-hidden p-4">

                {selectedStock && chartData ? (
                  <div className="h-full flex flex-col gap-4">
                    {/* Header */}
                    {/* Current Data Info Bar */}
                    <div className="bg-[#1a1f2e] border-b border-gray-700 px-4 py-2.5 flex items-center justify-between text-sm">
                      <div className="flex items-center gap-4">
                        <span className="text-gray-400">Chart:</span>
                        <span className="font-medium text-white">{timeRange}</span>
                        <span className="text-gray-500">•</span>
                        <span className="font-medium text-white">
                          {resolution === 'D' ? 'Daily' : resolution + 'min'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        Data used for CTS calculation
                      </div>
                    </div>
                    {/* Timeframe & Resolution Controls */}
                    <div className="bg-[#11151c] border-b border-gray-800 px-2 py-3 flex gap-1 overflow-x-auto shrink-0">
                      {(['1d', '1w', '1m'] as const).map((range) => (
                        <button
                          key={range}
                          onClick={() => setTimeRange(range)}
                          className={`px-4 py-2 text-sm rounded-2xl font-medium transition-all whitespace-nowrap ${timeRange === range
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-[#1a1f2e] text-gray-400 hover:bg-[#242a3a]'
                            }`}
                        >
                          {range}
                        </button>
                      ))}

                      <div className="w-px bg-gray-700 mx-3 my-1" />

                      {(['1', '5', '15', 'D'] as const).map((res) => (
                        <button
                          key={res}
                          onClick={() => setResolution(res)}
                          className={`px-4 py-2 text-sm rounded-2xl font-medium transition-all whitespace-nowrap ${resolution === res
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-[#1a1f2e] text-gray-400 hover:bg-[#242a3a]'
                            }`}
                        >
                          {res}
                        </button>
                      ))}
                    </div>

                    {/* Main Candlestick + Volume Chart */}
                    <div className="flex-[65%] relative border border-gray-800 rounded-2xl overflow-hidden">
                      <Chart
                        type="candlestick"
                        data={{
                          ...chartData,
                          datasets: [
                            {
                              label: `${selectedStock} Price`,
                              data: chartData.datasets.find((d: any) => d.type === 'candlestick')?.data || [],
                              type: 'candlestick' as const,

                              backgroundColor: (ctx: any) => {
                                if (!ctx || !ctx.raw || typeof ctx.raw.c === 'undefined' || typeof ctx.raw.o === 'undefined') {
                                  return '#64748b';
                                }
                                return ctx.raw.c >= ctx.raw.o ? '#26a69a' : '#ef5350';
                              },

                              borderColor: (ctx: any) => {
                                if (!ctx || !ctx.raw || typeof ctx.raw.c === 'undefined' || typeof ctx.raw.o === 'undefined') {
                                  return '#64748b';
                                }
                                return ctx.raw.c >= ctx.raw.o ? '#26a69a' : '#ef5350';
                              },

                              borderWidth: 1.5,
                              wickColor: '#ffffff',
                              wickWidth: 1.5,
                              fill: false,
                              yAxisID: 'y',
                            },
                            // Volume and other datasets...
                            ...chartData.datasets.filter((d: any) => d.type !== 'candlestick')
                          ],
                        }}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: {
                            legend: { display: false },
                            zoom: { zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'xy' } }
                          },
                          scales: {
                            x: { type: 'time', ticks: { color: '#a0aec0' } },
                            y: { position: 'right', ticks: { color: '#a0aec0' } },
                          }
                        }}
                      />
                    </div>
                    {/* MACD */}
                    <div className="flex-[17.5%] relative border-b border-gray-800">
                      <Chart
                        type="line"
                        data={{
                          datasets: chartData.datasets.filter((d: any) =>
                            ['MACD', 'Signal', 'Histogram'].includes(d.label)
                          )
                        }}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: { legend: { display: false } },
                          scales: { x: { display: false }, y: { ticks: { color: '#a0aec0', font: { size: 10 } } } }
                        }}
                        className="absolute inset-0"
                      />
                    </div>

                    {/* RSI */}
                    <div className="h-24 relative">
                      <Chart
                        type="line"
                        data={{
                          datasets: chartData.datasets.filter((d: any) =>
                            ['RSI', 'Overbought (70)', 'Oversold (30)'].includes(d.label)
                          )
                        }}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: { legend: { display: false } },
                          scales: {
                            x: { display: false },
                            y: { min: 0, max: 100, grid: { color: '#1f2937' } }
                          }
                        }}
                        className="absolute inset-0"
                      />
                    </div>

                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-500 text-lg">
                    Loading chart for {selectedStock}...
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-3 border-t border-gray-700 text-xs text-gray-500 flex justify-between bg-[#11151c]">
                <div>Drag to zoom • Scroll to pan • ESC or ✕ to close</div>
                <div>Data from Polygon.io</div>
              </div>
            </div>
          </div>
        )}

        {/* Improved Add Position Modal */}
        {showAddPosition && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] p-4">
            <div className="bg-[#11151c] rounded-3xl w-full max-w-md border border-gray-700 overflow-hidden">

              {/* Header */}
              <div className="px-6 pt-6 pb-4 border-b border-gray-700">
                <h2 className="text-2xl font-semibold text-white">Add New Position</h2>
                <p className="text-sm text-gray-400 mt-1">Track your holdings and get CTS-based insights</p>
              </div>

              <div className="p-6 space-y-6">
                {/* Ticker */}
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Ticker Symbol</label>
                  <input
                    type="text"
                    value={newPosition.symbol}
                    onChange={(e) => setNewPosition({ ...newPosition, symbol: e.target.value.toUpperCase().trim() })}
                    placeholder="AAPL"
                    className="w-full px-4 py-3.5 bg-[#1a1f2e] border border-gray-700 rounded-2xl focus:outline-none focus:border-blue-500 text-white text-lg font-medium"
                    autoFocus
                  />
                </div>

                {/* Entry Price + Quantity */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1.5">Entry Price ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newPosition.entryPrice}
                      onChange={(e) => setNewPosition({ ...newPosition, entryPrice: e.target.value })}
                      placeholder="22.50"
                      className="w-full px-4 py-3.5 bg-[#1a1f2e] border border-gray-700 rounded-2xl focus:outline-none focus:border-blue-500 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1.5">Quantity (Shares)</label>
                    <input
                      type="number"
                      step="1"
                      value={newPosition.quantity}
                      onChange={(e) => setNewPosition({ ...newPosition, quantity: e.target.value })}
                      placeholder="100"
                      className="w-full px-4 py-3.5 bg-[#1a1f2e] border border-gray-700 rounded-2xl focus:outline-none focus:border-blue-500 text-white"
                    />
                  </div>
                </div>

                {/* Purchase Date */}
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Purchase Date (optional)</label>
                  <input
                    type="date"
                    value={newPosition.date}
                    onChange={(e) => setNewPosition({ ...newPosition, date: e.target.value })}
                    className="w-full px-4 py-3.5 bg-[#1a1f2e] border border-gray-700 rounded-2xl focus:outline-none focus:border-blue-500 text-white"
                  />
                </div>
              </div>

              {/* Footer Buttons */}
              <div className="border-t border-gray-700 p-4 flex gap-3">
                <button
                  onClick={() => {
                    setShowAddPosition(false);
                    setNewPosition({
                      symbol: '',
                      entryPrice: '',
                      quantity: '',
                      date: new Date().toISOString().split('T')[0]
                    });
                  }}
                  className="flex-1 py-3.5 text-gray-400 hover:text-white font-medium transition-colors rounded-2xl"
                >
                  Cancel
                </button>

                <button
                  onClick={() => {
                    if (!newPosition.symbol.trim()) {
                      alert("Please enter a ticker symbol");
                      return;
                    }
                    if (!newPosition.entryPrice || parseFloat(newPosition.entryPrice) <= 0) {
                      alert("Please enter a valid entry price");
                      return;
                    }
                    if (!newPosition.quantity || parseFloat(newPosition.quantity) <= 0) {
                      alert("Please enter a valid quantity");
                      return;
                    }

                    const position = {
                      symbol: newPosition.symbol.toUpperCase().trim(),
                      entryPrice: parseFloat(newPosition.entryPrice),
                      quantity: parseFloat(newPosition.quantity),
                      date: newPosition.date,
                      addedAt: new Date().toISOString()
                    };

                    const updatedPortfolio = [...portfolio, position];
                    setPortfolio(updatedPortfolio);
                    localStorage.setItem('portfolio', JSON.stringify(updatedPortfolio));

                    setShowAddPosition(false);

                    // Reset form
                    setNewPosition({
                      symbol: '',
                      entryPrice: '',
                      quantity: '',
                      date: new Date().toISOString().split('T')[0]
                    });

                    // Auto-select the newly added stock
                    setSelectedStock(position.symbol);
                  }}
                  className="flex-1 py-3.5 bg-green-600 hover:bg-green-700 rounded-2xl font-medium transition-colors"
                >
                  Add to Portfolio
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Refresh AI Analysis Modal */}
        {showAiRefreshModal && selectedStock && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] p-4">
            <div className="bg-[#11151c] rounded-3xl w-full max-w-lg border border-gray-700 overflow-hidden">

              {/* Header */}
              <div className="px-6 pt-6 pb-4 border-b border-gray-700">
                <h2 className="text-xl font-semibold">Refresh AI Analysis</h2>
                <p className="text-sm text-gray-400 mt-1">
                  For <span className="font-medium text-white">{selectedStock}</span>
                </p>
              </div>

              <div className="p-6 space-y-6">
                {/* Quick Options - Select up to 3 */}
                <div>
                  <p className="text-sm text-gray-400 mb-3">
                    Quick focus areas (select up to 3):
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      "Be more conservative",
                      "Focus on downside risk",
                      "Compare to SPY",
                      "Explain the volume",
                      "Look at longer-term trend",
                      "Highlight risks",
                      "Be more aggressive",
                      "Focus on momentum",
                      "Consider recent news"
                    ].map((option) => {
                      const isSelected = selectedPresets.includes(option);
                      return (
                        <button
                          key={option}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedPresets(selectedPresets.filter(p => p !== option));
                            } else if (selectedPresets.length < 3) {
                              setSelectedPresets([...selectedPresets, option]);
                            }
                          }}
                          className={`px-4 py-2 text-sm rounded-2xl transition-all border ${isSelected
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-[#1a1f2e] border-gray-700 hover:bg-[#242a3a] text-gray-300'
                            }`}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                  {selectedPresets.length > 0 && (
                    <p className="text-xs text-blue-400 mt-2">
                      Selected: {selectedPresets.length}/3
                    </p>
                  )}
                </div>

                {/* Custom Input */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Or type your own instruction (optional, max 100 characters)
                  </label>
                  <input
                    type="text"
                    value={customInstruction}
                    onChange={(e) => setCustomInstruction(e.target.value)}
                    placeholder="e.g. Focus more on risk management"
                    maxLength={100}
                    className="w-full px-4 py-3 bg-[#1a1f2e] border border-gray-700 rounded-2xl focus:outline-none focus:border-blue-500 text-white placeholder-gray-500"
                  />
                  <div className="text-right text-xs text-gray-500 mt-1">
                    {customInstruction.length}/100
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-gray-700 p-4 flex gap-3">
                <button
                  onClick={() => {
                    setShowAiRefreshModal(false);
                    setCustomInstruction('');
                    setSelectedPresets([]);
                  }}
                  className="flex-1 py-3.5 text-gray-400 hover:text-white font-medium rounded-2xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const combinedInstruction = [
                      ...selectedPresets,
                      customInstruction.trim()
                    ].filter(Boolean).join(". ");

                    getAiRecommendation(
                      selectedStock,
                      finalCtsScore || undefined,
                      combinedInstruction || undefined,
                      aiLastRSI || undefined,
                      aiLastMACD || undefined,
                      aiLastSignal || undefined,
                      aiEma200Last || undefined,
                      aiRecentCloses,
                      aiLastClose || undefined
                    );

                    setShowAiRefreshModal(false);
                    setCustomInstruction('');
                    setSelectedPresets([]);
                  }}
                  className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 rounded-2xl font-medium transition-colors"
                  disabled={selectedPresets.length === 0 && !customInstruction.trim()}
                >
                  Refresh Analysis
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Stock to Auto Trading Modal */}
        {showAddAutoModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] p-4">
            <div className="bg-[#11151c] rounded-3xl w-full max-w-md border border-gray-700 overflow-hidden">

              {/* Header */}
              <div className="px-6 pt-6 pb-4 border-b border-gray-700">
                <h2 className="text-xl font-semibold">Add Stock to Auto Trading</h2>
                <p className="text-sm text-gray-400 mt-1">AI will monitor and trade this stock</p>
              </div>

              <div className="p-6 space-y-6">

                {/* Stock Symbol */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Stock Symbol</label>
                  <input
                    type="text"
                    value={newAutoSymbol}
                    onChange={(e) => setNewAutoSymbol(e.target.value.toUpperCase())}
                    placeholder="e.g. TSLA"
                    className="w-full px-4 py-3 bg-[#1a1f2e] border border-gray-700 rounded-2xl focus:outline-none focus:border-blue-500 text-white text-lg font-medium"
                    maxLength={10}
                  />
                </div>

                {/* Allocation Amount */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Initial Allocation Amount ($)</label>
                  <input
                    type="number"
                    value={newAllocation}
                    onChange={(e) => setNewAllocation(Number(e.target.value) || 0)}
                    placeholder="5000"
                    className="w-full px-4 py-3 bg-[#1a1f2e] border border-gray-700 rounded-2xl focus:outline-none focus:border-blue-500 text-white text-lg font-mono"
                    min="100"
                  />
                </div>

                {/* Compound Profits Toggle */}
                <div className="flex items-center justify-between bg-[#1a1f2e] p-4 rounded-2xl">
                  <div>
                    <div className="font-medium">Compound Profits</div>
                    <div className="text-xs text-gray-400">Automatically add realized profits back to allocation</div>
                  </div>
                  <button
                    onClick={() => setCompoundProfits(!compoundProfits)}
                    className={`w-14 h-8 rounded-full transition-colors flex items-center px-1 ${compoundProfits ? 'bg-emerald-500' : 'bg-gray-600'
                      }`}
                  >
                    <div className={`w-6 h-6 bg-white rounded-full transition-transform ${compoundProfits ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>

                {/* Rinse & Repeat */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={rinseRepeat}
                    onChange={(e) => setRinseRepeat(e.target.checked)}
                    className="w-5 h-5 accent-blue-500"
                  />
                  <div>
                    <div className="font-medium">Rinse & Repeat</div>
                    <div className="text-xs text-gray-400">Continue trading this stock after each sell</div>
                  </div>
                </div>

                {/* Max Repeats */}
                {rinseRepeat && (
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Maximum Repeats</label>
                    <select
                      value={maxRepeats}
                      onChange={(e) => setMaxRepeats(Number(e.target.value))}
                      className="w-full px-4 py-3 bg-[#1a1f2e] border border-gray-700 rounded-2xl focus:outline-none focus:border-blue-500 text-white"
                    >
                      {[3, 5, 7, 10].map(n => (
                        <option key={n} value={n}>{n} times</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Custom Guidance */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Custom AI Guidance (Optional)</label>
                  <textarea
                    value={customGuidance}
                    onChange={(e) => setCustomGuidance(e.target.value)}
                    placeholder="e.g. Be more aggressive on momentum, avoid trading during earnings"
                    className="w-full px-4 py-3 bg-[#1a1f2e] border border-gray-700 rounded-2xl focus:outline-none focus:border-blue-500 text-white h-24 resize-y"
                  />
                </div>

              </div>

              {/* Footer */}
              <div className="border-t border-gray-700 p-4 flex gap-3">
                <button
                  onClick={() => {
                    setShowAddAutoModal(false);
                    // Reset form
                    setNewAutoSymbol('');
                    setNewAllocation(1000);
                    setCompoundProfits(true);
                    setRinseRepeat(true);
                    setMaxRepeats(5);
                    setCustomGuidance('');
                  }}
                  className="flex-1 py-3.5 text-gray-400 hover:text-white font-medium rounded-2xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!newAutoSymbol.trim()) {
                      alert("Please enter a stock symbol");
                      return;
                    }

                    const newStock = {
                      id: Date.now().toString(),
                      symbol: newAutoSymbol.trim().toUpperCase(),
                      allocation: Number(newAllocation),
                      compoundProfits: compoundProfits,        // ← New field
                      rinseRepeat: rinseRepeat,
                      maxRepeats: Number(maxRepeats),
                      customGuidance: customGuidance.trim(),
                      status: 'idle' as const,
                      currentPosition: null,
                      tradeHistory: []
                    };

                    setAutoStocks(prev => [...prev, newStock]);
                    setShowAddAutoModal(false);

                    // Reset form
                    setNewAutoSymbol('');
                    setNewAllocation(1000);
                    setCompoundProfits(true);
                    setRinseRepeat(true);
                    setMaxRepeats(5);
                    setCustomGuidance('');
                  }}
                  disabled={!newAutoSymbol.trim()}
                  className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-2xl font-medium transition-colors"
                >
                  Add to Auto Trading
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Buy More Modal */}
        {showBuyMoreModal && selectedAutoStock && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[80] p-4">
            <div className="bg-[#11151c] rounded-3xl w-full max-w-md border border-gray-700 overflow-hidden">

              {/* Header */}
              <div className="px-6 pt-6 pb-4 border-b border-gray-700">
                <h2 className="text-xl font-semibold">Buy More {selectedAutoStock.symbol}</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Add more capital to this auto trading position
                </p>
              </div>

              <div className="p-6 space-y-6">

                {/* Current Status */}
                <div className="bg-[#1a1f2e] rounded-2xl p-4">
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-gray-400 text-xs">Total Allocation</div>
                      <div className="font-mono font-medium">
                        ${(selectedAutoStock.allocation || 0).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-400 text-xs">Invested</div>
                      <div className="font-mono">
                        ${((selectedAutoStock.currentPosition?.shares || 0) *
                          toNumber(quotes[selectedAutoStock.symbol]?.price || 0)).toFixed(0)}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-400 text-xs">Remaining</div>
                      <div className="font-mono text-emerald-400">
                        ${((selectedAutoStock.allocation || 0) -
                          ((selectedAutoStock.currentPosition?.shares || 0) *
                            toNumber(quotes[selectedAutoStock.symbol]?.price || 0))).toFixed(0)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Additional Amount Input */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Additional Allocation Amount ($)
                  </label>
                  <input
                    type="number"
                    value={buyMoreAmount}
                    onChange={(e) => setBuyMoreAmount(Number(e.target.value) || 0)}
                    placeholder="5000"
                    className="w-full px-5 py-4 bg-[#1a1f2e] border border-gray-700 rounded-2xl focus:outline-none focus:border-blue-500 text-white text-2xl font-mono"
                    min="100"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    This will increase the total capital the AI can use for {selectedAutoStock.symbol}
                  </p>
                </div>

              </div>

              {/* Footer Buttons */}
              <div className="border-t border-gray-700 p-4 flex gap-3">
                <button
                  onClick={() => {
                    setShowBuyMoreModal(false);
                    setBuyMoreAmount(0);
                  }}
                  className="flex-1 py-3.5 text-gray-400 hover:text-white font-medium rounded-2xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (buyMoreAmount > 0) {
                      buyMore(selectedAutoStock.symbol, buyMoreAmount);
                      setShowBuyMoreModal(false);
                      setBuyMoreAmount(0);
                    }
                  }}
                  disabled={buyMoreAmount <= 0}
                  className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-2xl font-medium transition-colors"
                >
                  Add ${buyMoreAmount.toLocaleString()}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="fixed inset-0 bg-black/80 z-[90] lg:hidden" onClick={() => setIsMobileMenuOpen(false)}>
            <div
              className="bg-[#11151c] w-72 h-full p-6 overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="text-2xl font-semibold">Luckmi AI</h2>
                  <p className="text-xs text-gray-500">Trading & Investments</p>
                </div>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-3xl text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-1 text-lg">
                <a href="/stock" className="block py-4 px-5 hover:bg-[#1a1f2e] rounded-2xl">Stocks</a>
                <a href="#" onClick={() => alert("Auto Trading is the current page")} className="block py-4 px-5 hover:bg-[#1a1f2e] rounded-2xl">Auto Trading</a>
                <a href="#" onClick={() => setShowOptionsModal(true)} className="block py-4 px-5 hover:bg-[#1a1f2e] rounded-2xl">Options</a>
                <a href="#" onClick={() => setShowReportsModal(true)} className="block py-4 px-5 hover:bg-[#1a1f2e] rounded-2xl">Reports</a>
                <a href="#" onClick={() => setShowAccountModal(true)} className="block py-4 px-5 hover:bg-[#1a1f2e] rounded-2xl">Account</a>
                <a href="#" onClick={() => setShowGuideModal(true)} className="block py-4 px-5 hover:bg-[#1a1f2e] rounded-2xl">
                  Testing Guide
                </a>
              </div>

              {/* Logout */}
              <div className="pt-10 mt-10 border-t border-gray-700">
                <button
                  onClick={async () => {
                    const supabase = createClient();
                    await supabase.auth.signOut();
                    window.location.href = '/login';
                  }}
                  className="w-full py-4 bg-red-600 hover:bg-red-700 rounded-2xl text-sm font-medium"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Welcome Modal - Shows once */}
        {showWelcome && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4">
            <div className="bg-[#11151c] rounded-3xl max-w-md w-full border border-gray-700 p-8 text-center">
              <div className="text-5xl mb-6">🤖</div>
              <h2 className="text-2xl font-semibold mb-3">Welcome to Luckmi AI</h2>
              <p className="text-gray-400 leading-relaxed mb-8">
                Your intelligent AI trading assistant.<br />
                Monitor markets, get real-time analysis, and let AI handle paper trading automatically.
              </p>

              <button
                onClick={() => setShowWelcome(false)}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 rounded-2xl font-medium transition-colors"
              >
                Get Started
              </button>

              <p className="text-xs text-gray-500 mt-6">
                This is a paper trading prototype.<br />
                All trades are simulated.
              </p>
            </div>
          </div>
        )}

        {/* Account Modal */}
        {showAccountModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[80] p-4">
            <div className="bg-[#11151c] rounded-3xl max-w-md w-full border border-gray-700 overflow-hidden">
              <div className="px-6 pt-6 pb-4 border-b border-gray-700">
                <h2 className="text-2xl font-semibold">Account</h2>
              </div>

              <div className="p-6 space-y-6">
                <div className="bg-[#1a1f2e] rounded-2xl p-5">
                  <div className="text-gray-400 text-sm">Email</div>
                  <div className="font-medium mt-1 break-all">
                    {/* You can replace this with real user email later */}
                    user@example.com
                  </div>
                </div>

                <div className="bg-[#1a1f2e] rounded-2xl p-5">
                  <div className="text-gray-400 text-sm">Member Since</div>
                  <div className="font-medium mt-1">April 2026</div>
                </div>

                <div className="bg-[#1a1f2e] rounded-2xl p-5">
                  <div className="text-gray-400 text-sm">Trading Mode</div>
                  <div className="font-medium mt-1 text-emerald-400">Paper Trading (Simulation)</div>
                </div>

                <div className="pt-4">
                  <button
                    onClick={async () => {
                      const supabase = createClient();
                      await supabase.auth.signOut();
                      window.location.href = '/login';
                    }}
                    className="w-full py-4 bg-red-600 hover:bg-red-700 rounded-2xl text-sm font-medium transition-colors"
                  >
                    Logout
                  </button>
                </div>
              </div>

              <div className="border-t border-gray-700 p-6">
                <button
                  onClick={() => setShowAccountModal(false)}
                  className="w-full py-4 bg-gray-700 hover:bg-gray-600 rounded-2xl font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reports Modal */}
        {showReportsModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[80] p-4">
            <div className="bg-[#11151c] rounded-3xl max-w-2xl w-full border border-gray-700 overflow-hidden">

              {/* Header */}
              <div className="px-6 pt-6 pb-4 border-b border-gray-700 flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-semibold">Reports & Performance</h2>
                  <p className="text-sm text-gray-400 mt-1">Your Auto Trading Activity</p>
                </div>
                <button
                  onClick={() => setShowReportsModal(false)}
                  className="text-3xl text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="p-6">
                {/* Overall Performance Summary */}
                <div className="bg-[#1a1f2e] rounded-3xl p-6 mb-8">
                  <div className="text-sm text-gray-400 mb-4">Overall Auto Trading Performance</div>

                  {(() => {
                    let totalInvested = 0;
                    let totalCurrentValue = 0;
                    let totalPnL = 0;

                    autoStocks.forEach(stock => {
                      if (stock.currentPosition) {
                        const currentPrice = toNumber(quotes[stock.symbol]?.price || 0);
                        const invested = stock.currentPosition.shares * stock.currentPosition.entryPrice;
                        const currentValue = stock.currentPosition.shares * currentPrice;
                        totalInvested += invested;
                        totalCurrentValue += currentValue;
                        totalPnL += (currentValue - invested);
                      }
                    });

                    const totalPnLPercent = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

                    return (
                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <div className="text-xs text-gray-400">Total Invested</div>
                          <div className="text-3xl font-mono font-semibold mt-1">${totalInvested.toFixed(0)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-400">Unrealized P&L</div>
                          <div className={`text-3xl font-mono font-semibold mt-1 ${totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(0)}
                            <span className="text-base">({totalPnLPercent.toFixed(1)}%)</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Individual Stock Performance */}
                <div className="mb-6">
                  <div className="text-sm text-gray-400 mb-4">Per Stock Performance</div>
                  {autoStocks.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      No auto trading positions yet
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {autoStocks.map((stock) => {
                        const currentPrice = toNumber(quotes[stock.symbol]?.price || 0);
                        const invested = stock.currentPosition
                          ? stock.currentPosition.shares * stock.currentPosition.entryPrice
                          : 0;
                        const currentValue = stock.currentPosition
                          ? stock.currentPosition.shares * currentPrice
                          : 0;
                        const pnl = currentValue - invested;
                        const pnlPercent = invested > 0 ? (pnl / invested) * 100 : 0;

                        return (
                          <div key={stock.symbol} className="bg-[#1a1f2e] rounded-2xl p-5 flex justify-between items-center">
                            <div>
                              <div className="font-medium">{stock.symbol}</div>
                              <div className="text-xs text-gray-400">
                                {stock.currentPosition ? `${stock.currentPosition.shares} shares` : 'No position'}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={`font-mono text-lg ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {pnl >= 0 ? '+' : ''}${pnl.toFixed(0)}
                              </div>
                              <div className={`text-xs ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                ({pnlPercent.toFixed(1)}%)
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Future Reports Note */}
                <div className="bg-[#1a1f2e]/70 border border-dashed border-gray-600 rounded-2xl p-6 text-center">
                  <p className="text-sm text-gray-400">
                    Full performance reports, comparison with other users, and detailed analytics will be available soon.
                  </p>
                </div>
              </div>

              <div className="border-t border-gray-700 p-6">
                <button
                  onClick={() => setShowReportsModal(false)}
                  className="w-full py-4 bg-gray-700 hover:bg-gray-600 rounded-2xl font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Options Modal */}
        {showOptionsModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[80] p-4">
            <div className="bg-[#11151c] rounded-3xl max-w-md w-full border border-gray-700 overflow-hidden">
              <div className="px-6 pt-6 pb-4 border-b border-gray-700">
                <h2 className="text-2xl font-semibold">Options Trading</h2>
                <p className="text-sm text-gray-400 mt-1">Advanced AI-powered options strategies</p>
              </div>

              <div className="p-8 text-center">
                <div className="text-6xl mb-6">📈</div>
                <h3 className="text-xl font-medium mb-3">Coming Soon</h3>
                <p className="text-gray-400 leading-relaxed">
                  Options trading with AI-generated strategies, Greeks analysis, and automated option plays will be available in the next update.
                </p>
                <p className="text-xs text-gray-500 mt-8">
                  This feature is currently under development.
                </p>
              </div>

              <div className="border-t border-gray-700 p-6">
                <button
                  onClick={() => setShowOptionsModal(false)}
                  className="w-full py-4 bg-gray-700 hover:bg-gray-600 rounded-2xl font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Testing Guide Modal */}
        {showGuideModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[80] p-4">
            <div className="bg-[#11151c] rounded-3xl max-w-2xl w-full border border-gray-700 overflow-hidden max-h-[90vh] overflow-y-auto">
              <div className="px-6 pt-6 pb-4 border-b border-gray-700 sticky top-0 bg-[#11151c]">
                <h2 className="text-2xl font-semibold">Luckmi AI Testing Guide</h2>
              </div>

              <div className="p-8 space-y-8 text-gray-300">
                <div>
                  <h3 className="text-lg font-medium text-white mb-3">Welcome to Luckmi AI</h3>
                  <p className="leading-relaxed">
                    Luckmi AI is an intelligent AI-powered paper trading assistant.
                    It helps you monitor stocks, calculate Confluence Trading Score (CTS),
                    get AI recommendations, and run autonomous simulated trades.
                  </p>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-white mb-3">How Auto Trading Works</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Add stocks to Auto Trading with an initial allocation</li>
                    <li>Use "Buy More" to increase capital for any stock</li>
                    <li>The AI monitors the stock every 45 seconds when market is open</li>
                    <li>It buys when CTS + AI signal is strong and there is enough cash</li>
                    <li>It sells based on profit targets, risk, or weakening momentum</li>
                    <li>Profits can be compounded automatically (default: ON)</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-white mb-3">Important Notes</h3>
                  <ul className="list-disc pl-6 space-y-2 text-amber-400">
                    <li>This is **paper trading only** — no real money is used</li>
                    <li>All trades are simulated</li>
                    <li>AI decisions are not financial advice</li>
                    <li>Past performance in simulation does not guarantee future results</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-white mb-3">What We Want Your Feedback On</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Is the interface clear and easy to use?</li>
                    <li>How useful are the AI recommendations?</li>
                    <li>Does the auto trading behavior make sense?</li>
                    <li>Any bugs or confusing parts?</li>
                  </ul>
                </div>
              </div>

              <div className="border-t border-gray-700 p-6">
                <button
                  onClick={() => setShowGuideModal(false)}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-700 rounded-2xl font-medium transition-colors"
                >
                  Got it, thanks
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}