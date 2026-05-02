import { createClient } from '@supabase/supabase-js';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

function toIsoStart(input) {
  return `${input}T00:00:00.000Z`;
}

function toIsoEnd(input) {
  return `${input}T23:59:59.999Z`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function dateDaysAgo(days) {
  const now = new Date();
  const d = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function getScoreField(row, scoreField) {
  const v = row?.[scoreField];
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function decisionKeyOf(row) {
  return `${row.user_id}::${row.auto_stock_id || 'na'}::${row.symbol}`;
}

function parseBuyScoreFromBreakdown(ctsBreakdown) {
  const score = ctsBreakdown?.meta?.buyScore;
  const n = Number(score);
  return Number.isFinite(n) ? n : null;
}

function resolveBuyScoreFromDecisions(row, decisionSeriesByKey) {
  const key = decisionKeyOf(row);
  const series = decisionSeriesByKey.get(key) || [];
  if (series.length === 0) return null;

  const tradeTs = new Date(row.created_at).getTime();
  if (!Number.isFinite(tradeTs)) return null;

  // Decision timestamp can be slightly before or after trade timestamps.
  // Match nearest decision within +/- 20 minutes.
  const toleranceMs = 20 * 60 * 1000;
  let bestScore = null;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const d of series) {
    const decisionTs = new Date(d.created_at).getTime();
    if (!Number.isFinite(decisionTs)) continue;
    const delta = Math.abs(decisionTs - tradeTs);
    if (delta > toleranceMs) continue;
    if (delta < bestDelta) {
      bestDelta = delta;
      bestScore = d.buyScore;
    }
  }

  return bestScore;
}

function keyOf(row) {
  return `${row.user_id}::${row.auto_stock_id || 'na'}::${row.symbol}`;
}

function findNextExit(entries, idx, entryTimeMs, windowMs) {
  for (let j = idx + 1; j < entries.length; j++) {
    const next = entries[j];
    const t = new Date(next.created_at).getTime();
    if (!Number.isFinite(t)) continue;
    if (t <= entryTimeMs) continue;
    if (t - entryTimeMs > windowMs) break;
    if (next.type === 'sell' || next.type === 'partial_sell') {
      return next;
    }
  }
  return null;
}

function formatPct(v) {
  return `${v.toFixed(2)}%`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('Missing env: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const userId = args.userId || null;
  const from = args.from || dateDaysAgo(120);
  const to = args.to || dateDaysAgo(0);
  const minThreshold = toNumber(args.min, 50);
  const maxThreshold = toNumber(args.max, 70);
  const step = Math.max(1, toNumber(args.step, 1));
  const scoreField = String(args.scoreField || 'cts_score');
  const windowDays = Math.max(1, toNumber(args.windowDays, 3));
  const minSample = Math.max(1, toNumber(args.minSample, 15));

  const fromIso = toIsoStart(from);
  const toIso = toIsoEnd(to);

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
    global: { headers: { 'x-client-info': 'threshold-sweep-script' } },
  });

  const wantsBuyScore = scoreField === 'buy_score';

  let query = supabase
    .from('trades')
    .select('id,user_id,auto_stock_id,symbol,type,price,amount,pnl,cts_score,confidence,created_at')
    .in('type', ['buy', 'buyMore', 'sell', 'partial_sell'])
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .order('created_at', { ascending: true });

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data: rows, error } = await query;
  if (error) {
    console.error('Query failed:', error.message);
    process.exit(1);
  }

  const trades = Array.isArray(rows) ? rows : [];
  if (trades.length === 0) {
    console.log('No trades found in selected date range.');
    process.exit(0);
  }

  const decisionSeriesByKey = new Map();
  if (wantsBuyScore) {
    let decisionQuery = supabase
      .from('ai_decisions')
      .select('user_id,auto_stock_id,symbol,action,cts_breakdown,created_at')
      .in('action', ['Buy', 'Buy More'])
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .order('created_at', { ascending: true });

    if (userId) {
      decisionQuery = decisionQuery.eq('user_id', userId);
    }

    const { data: decisionRows, error: decisionError } = await decisionQuery;
    if (decisionError) {
      console.error('ai_decisions query failed:', decisionError.message);
      process.exit(1);
    }

    for (const d of decisionRows || []) {
      const buyScore = parseBuyScoreFromBreakdown(d.cts_breakdown);
      if (buyScore === null) continue;
      const k = decisionKeyOf(d);
      if (!decisionSeriesByKey.has(k)) decisionSeriesByKey.set(k, []);
      decisionSeriesByKey.get(k).push({
        created_at: d.created_at,
        buyScore,
      });
    }
  }

  const grouped = new Map();
  for (const t of trades) {
    const k = keyOf(t);
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k).push(t);
  }

  const samples = [];
  const windowMs = windowDays * 24 * 60 * 60 * 1000;

  for (const series of grouped.values()) {
    series.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    for (let i = 0; i < series.length; i++) {
      const row = series[i];
      if (row.type !== 'buy' && row.type !== 'buyMore') continue;

      const score = wantsBuyScore
        ? resolveBuyScoreFromDecisions(row, decisionSeriesByKey)
        : getScoreField(row, scoreField);
      if (score === null) continue;

      const entryPrice = Number(row.price);
      const entryTime = new Date(row.created_at).getTime();
      if (!Number.isFinite(entryPrice) || entryPrice <= 0 || !Number.isFinite(entryTime)) continue;

      const nextExit = findNextExit(series, i, entryTime, windowMs);
      if (!nextExit) continue;

      const exitPrice = Number(nextExit.price);
      const exitTime = new Date(nextExit.created_at).getTime();
      if (!Number.isFinite(exitPrice) || exitPrice <= 0 || !Number.isFinite(exitTime)) continue;

      const rawReturnPct = ((exitPrice - entryPrice) / entryPrice) * 100;
      const holdMinutes = (exitTime - entryTime) / (60 * 1000);

      samples.push({
        score,
        returnPct: rawReturnPct,
        holdMinutes,
        entryType: row.type,
        exitType: nextExit.type,
      });
    }
  }

  if (samples.length === 0) {
    console.log(`No matched buy->exit pairs found (windowDays=${windowDays}, scoreField=${scoreField}).`);
    process.exit(0);
  }

  const results = [];
  for (let threshold = minThreshold; threshold <= maxThreshold; threshold += step) {
    const slice = samples.filter((s) => s.score >= threshold);
    if (slice.length === 0) continue;

    const returns = slice.map((s) => s.returnPct);
    const wins = returns.filter((r) => r > 0).length;
    const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
    const sorted = [...returns].sort((a, b) => a - b);
    const p50 = percentile(sorted, 50);
    const p25 = percentile(sorted, 25);
    const p75 = percentile(sorted, 75);
    const avgHold = slice.reduce((a, b) => a + b.holdMinutes, 0) / slice.length;

    results.push({
      threshold,
      n: slice.length,
      winRatePct: (wins / slice.length) * 100,
      avgReturnPct: avg,
      medianReturnPct: p50,
      p25ReturnPct: p25,
      p75ReturnPct: p75,
      avgHoldMinutes: avgHold,
      stable: slice.length >= minSample,
    });
  }

  results.sort((a, b) => a.threshold - b.threshold);

  console.log('');
  console.log('=== Buy Threshold Sweep ===');
  console.log(`Range: ${from} to ${to}`);
  console.log(`Score field: ${scoreField}`);
  if (wantsBuyScore) {
    console.log('Score source: ai_decisions.cts_breakdown.meta.buyScore (nearest match to trade timestamp)');
  }
  console.log(`Pairs analyzed: ${samples.length}`);
  console.log(`Window: next exit within ${windowDays} day(s)`);
  if (userId) console.log(`User: ${userId}`);
  console.log('');

  const tableRows = results.map((r) => ({
    threshold: r.threshold,
    n: r.n,
    stable: r.stable ? 'yes' : 'no',
    win_rate: formatPct(r.winRatePct),
    avg_return: formatPct(r.avgReturnPct),
    median_return: formatPct(r.medianReturnPct),
    p25: formatPct(r.p25ReturnPct),
    p75: formatPct(r.p75ReturnPct),
    avg_hold_min: Number(r.avgHoldMinutes.toFixed(1)),
  }));

  console.table(tableRows);

  const stable = results.filter((r) => r.stable);
  const ranked = (stable.length > 0 ? stable : results)
    .slice()
    .sort((a, b) => {
      if (b.avgReturnPct !== a.avgReturnPct) return b.avgReturnPct - a.avgReturnPct;
      if (b.winRatePct !== a.winRatePct) return b.winRatePct - a.winRatePct;
      return b.n - a.n;
    });

  const best = ranked[0];
  if (best) {
    console.log('');
    console.log(
      `Suggested threshold: ${best.threshold} ` +
      `(n=${best.n}, avg=${formatPct(best.avgReturnPct)}, win=${formatPct(best.winRatePct)})`
    );
  }

  console.log('');
  console.log('Tip: if this returns too few samples, widen --from/--to or lower --minSample.');
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
