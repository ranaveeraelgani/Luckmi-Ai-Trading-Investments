import { toNumber, classifyAction } from "@/app/lib/reports/reportHelpers";
import { computeCtsBuckets } from "@/app/lib/reports/ctsBuckets";

export function buildEmptyAdminOverviewResponse(range: string) {
  return {
    generated_at: new Date().toISOString(),
    applied_range: range,
    summary: {
      total_users: 0,
      users_with_positions: 0,
      users_in_profit: 0,
      users_in_loss: 0,
      total_open_positions: 0,
      total_unrealized_pnl: 0,
      total_realized_pnl: 0,
      total_ai_decisions: 0,
      buy_decisions: 0,
      hold_decisions: 0,
      sell_decisions: 0,
      avg_ai_confidence: 0,
      avg_cts: 0,
      engine_success_rate: 0,
      engine_failed_runs: 0,
      engine_blocked_runs: 0,
    },
    users: [],
    diagnostics: {
      top_loss_symbols: [],
      low_confidence_sell_decisions: 0,
      decisions_last_7d: 0,
      hold_to_sell_ratio: null,
      top_plans_by_users: [],
      users_by_position_bucket: {
        no_positions: 0,
        one_to_three: 0,
        four_plus: 0,
      },
    },
  };
}

export function buildAdminOverviewResponse({
  range,
  users,
  subscriptions,
  positions,
  trades,
  decisions,
  runs,
  brokerOrders,
}: {
  range: string;
  users: any[];
  subscriptions: any[];
  positions: any[];
  trades: any[];
  decisions: any[];
  runs: any[];
  brokerOrders: any[];
}) {
  const planByUser = new Map<string, { plan_code: string | null; status: string | null }>();
  for (const row of subscriptions) {
    planByUser.set(row.user_id, {
      plan_code: row.plan_code || null,
      status: row.status || null,
    });
  }

  const positionsByUser = new Map<string, { open_positions: number; unrealized_pnl: number }>();
  for (const row of positions) {
    const current = positionsByUser.get(row.user_id) || {
      open_positions: 0,
      unrealized_pnl: 0,
    };

    const isOpen = String(row.status || "").toLowerCase() === "in-position";
    if (isOpen) {
      current.open_positions += 1;
      current.unrealized_pnl += toNumber(row.pnl);
    }

    positionsByUser.set(row.user_id, current);
  }

  const realizedByUser = new Map<string, number>();
  const symbolPnl = new Map<string, number>();

  for (const trade of trades) {
    const isSell = String(trade.type || "").toLowerCase().includes("sell");
    if (!isSell) continue;

    const pnl = toNumber(trade.pnl);
    realizedByUser.set(trade.user_id, toNumber(realizedByUser.get(trade.user_id)) + pnl);

    const symbol = String(trade.symbol || "").toUpperCase();
    if (symbol) {
      symbolPnl.set(symbol, toNumber(symbolPnl.get(symbol)) + pnl);
    }
  }

  const decisionStatsByUser = new Map<
    string,
    {
      total: number;
      buy: number;
      hold: number;
      sell: number;
      confidence_sum: number;
      confidence_count: number;
      cts_sum: number;
      cts_count: number;
    }
  >();

  let decisionsLast7d = 0;
  let lowConfidenceSellDecisions = 0;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  for (const row of decisions) {
    const current = decisionStatsByUser.get(row.user_id) || {
      total: 0,
      buy: 0,
      hold: 0,
      sell: 0,
      confidence_sum: 0,
      confidence_count: 0,
      cts_sum: 0,
      cts_count: 0,
    };

    current.total += 1;

    const action = classifyAction(row.action);
    if (action === "buy") current.buy += 1;
    if (action === "hold") current.hold += 1;
    if (action === "sell") current.sell += 1;

    const confidence = Number(row.confidence);
    if (Number.isFinite(confidence)) {
      current.confidence_sum += confidence;
      current.confidence_count += 1;
      if (action === "sell" && confidence < 55) {
        lowConfidenceSellDecisions += 1;
      }
    }

    const cts = Number(row.cts_score);
    if (Number.isFinite(cts)) {
      current.cts_sum += cts;
      current.cts_count += 1;
    }

    const createdAt = new Date(String(row.created_at || "")).getTime();
    if (Number.isFinite(createdAt) && createdAt >= sevenDaysAgo) {
      decisionsLast7d += 1;
    }

    decisionStatsByUser.set(row.user_id, current);
  }

  const runStatsByUser = new Map<
    string,
    {
      total: number;
      success: number;
      failed: number;
      blocked: number;
      trades: number;
      stocks: number;
      last_run_at: string | null;
    }
  >();

  for (const row of runs) {
    const current = runStatsByUser.get(row.user_id) || {
      total: 0,
      success: 0,
      failed: 0,
      blocked: 0,
      trades: 0,
      stocks: 0,
      last_run_at: null,
    };

    current.total += 1;
    const runStatus = String(row.status || "").toLowerCase();
    if (runStatus === "success") current.success += 1;
    if (runStatus === "failed") current.failed += 1;
    if (runStatus === "blocked") current.blocked += 1;

    current.trades += toNumber(row.trades_executed);
    current.stocks += toNumber(row.stocks_processed);
    if (!current.last_run_at) {
      current.last_run_at = row.created_at || null;
    }

    runStatsByUser.set(row.user_id, current);
  }

  const symbolTradeCountAll = new Map<string, number>();
  for (const trade of trades) {
    const symbol = String(trade.symbol || "").toUpperCase();
    if (symbol) {
      symbolTradeCountAll.set(symbol, toNumber(symbolTradeCountAll.get(symbol)) + 1);
    }
  }

  const totalTradeCountAll = [...symbolTradeCountAll.values()].reduce((sum, c) => sum + c, 0);
  const sortedByCount = [...symbolTradeCountAll.entries()].sort((a, b) => b[1] - a[1]);
  const top5Concentration = sortedByCount.slice(0, 5).map(([symbol, count]) => ({
    symbol,
    count,
    pct: totalTradeCountAll > 0 ? (count / totalTradeCountAll) * 100 : 0,
    pnl: toNumber(symbolPnl.get(symbol)),
  }));

  if (sortedByCount.length > 5) {
    const otherCount = sortedByCount.slice(5).reduce((sum, [, c]) => sum + c, 0);
    top5Concentration.push({
      symbol: "Other",
      count: otherCount,
      pct: totalTradeCountAll > 0 ? (otherCount / totalTradeCountAll) * 100 : 0,
      pnl: 0,
    });
  }

  const symbolConcentration = top5Concentration;
  const overviewCtsBuckets = computeCtsBuckets(trades as any[]);

  const executionFunnel = {
    placed: brokerOrders.length,
    filled: 0,
    rejected: 0,
    cancelled: 0,
    pending: 0,
  };

  for (const order of brokerOrders) {
    const s = String(order.status || "").toLowerCase();
    if (s === "filled") executionFunnel.filled += 1;
    else if (s === "rejected") executionFunnel.rejected += 1;
    else if (s === "cancelled" || s === "canceled") executionFunnel.cancelled += 1;
    else executionFunnel.pending += 1;
  }

  const userRows = users.map((user) => {
    const plan = planByUser.get(user.user_id) || { plan_code: null, status: null };
    const pos = positionsByUser.get(user.user_id) || { open_positions: 0, unrealized_pnl: 0 };
    const realized = toNumber(realizedByUser.get(user.user_id));
    const decisionsUser = decisionStatsByUser.get(user.user_id) || {
      total: 0,
      buy: 0,
      hold: 0,
      sell: 0,
      confidence_sum: 0,
      confidence_count: 0,
      cts_sum: 0,
      cts_count: 0,
    };
    const runsUser = runStatsByUser.get(user.user_id) || {
      total: 0,
      success: 0,
      failed: 0,
      blocked: 0,
      trades: 0,
      stocks: 0,
      last_run_at: null,
    };

    const avgConfidence =
      decisionsUser.confidence_count > 0
        ? decisionsUser.confidence_sum / decisionsUser.confidence_count
        : null;

    const avgCts =
      decisionsUser.cts_count > 0
        ? decisionsUser.cts_sum / decisionsUser.cts_count
        : null;

    const engineSuccessRate =
      runsUser.total > 0 ? (runsUser.success / runsUser.total) * 100 : null;

    return {
      user_id: user.user_id,
      full_name: user.full_name,
      email: user.email,
      created_at: user.created_at,
      plan_code: plan.plan_code,
      subscription_status: plan.status,
      open_positions: pos.open_positions,
      unrealized_pnl: pos.unrealized_pnl,
      realized_pnl: realized,
      net_pnl: pos.unrealized_pnl + realized,
      ai_decisions_total: decisionsUser.total,
      ai_buy: decisionsUser.buy,
      ai_hold: decisionsUser.hold,
      ai_sell: decisionsUser.sell,
      ai_avg_confidence: avgConfidence,
      ai_avg_cts: avgCts,
      engine_runs_total: runsUser.total,
      engine_success_rate: engineSuccessRate,
      engine_failed_runs: runsUser.failed,
      engine_blocked_runs: runsUser.blocked,
      engine_trades_executed: runsUser.trades,
      engine_stocks_processed: runsUser.stocks,
      last_run_at: runsUser.last_run_at,
    };
  });

  const summary = userRows.reduce(
    (acc, row) => {
      acc.total_users += 1;
      if (row.open_positions > 0) acc.users_with_positions += 1;

      const net = toNumber(row.net_pnl);
      if (net > 0) acc.users_in_profit += 1;
      if (net < 0) acc.users_in_loss += 1;

      acc.total_open_positions += row.open_positions;
      acc.total_unrealized_pnl += toNumber(row.unrealized_pnl);
      acc.total_realized_pnl += toNumber(row.realized_pnl);
      acc.total_ai_decisions += row.ai_decisions_total;
      acc.buy_decisions += row.ai_buy;
      acc.hold_decisions += row.ai_hold;
      acc.sell_decisions += row.ai_sell;

      if (Number.isFinite(Number(row.ai_avg_confidence))) {
        acc.confidence_sum += toNumber(row.ai_avg_confidence);
        acc.confidence_count += 1;
      }
      if (Number.isFinite(Number(row.ai_avg_cts))) {
        acc.cts_sum += toNumber(row.ai_avg_cts);
        acc.cts_count += 1;
      }
      if (Number.isFinite(Number(row.engine_success_rate))) {
        acc.engine_rate_sum += toNumber(row.engine_success_rate);
        acc.engine_rate_count += 1;
      }

      acc.engine_failed_runs += toNumber((row as any).engine_failed_runs);
      acc.engine_blocked_runs += toNumber((row as any).engine_blocked_runs);

      return acc;
    },
    {
      total_users: 0,
      users_with_positions: 0,
      users_in_profit: 0,
      users_in_loss: 0,
      total_open_positions: 0,
      total_unrealized_pnl: 0,
      total_realized_pnl: 0,
      total_ai_decisions: 0,
      buy_decisions: 0,
      hold_decisions: 0,
      sell_decisions: 0,
      confidence_sum: 0,
      confidence_count: 0,
      cts_sum: 0,
      cts_count: 0,
      engine_rate_sum: 0,
      engine_rate_count: 0,
      engine_failed_runs: 0,
      engine_blocked_runs: 0,
    }
  );

  const topLossSymbols = [...symbolPnl.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, 7)
    .map(([symbol, pnl]) => ({ symbol, pnl }));

  const holdToSellRatio =
    summary.sell_decisions > 0
      ? Number((summary.hold_decisions / summary.sell_decisions).toFixed(2))
      : null;

  const planCounts = new Map<string, number>();
  const positionBuckets = {
    no_positions: 0,
    one_to_three: 0,
    four_plus: 0,
  };

  for (const user of userRows) {
    const plan = String(user.plan_code || "none");
    planCounts.set(plan, toNumber(planCounts.get(plan)) + 1);

    if (user.open_positions === 0) positionBuckets.no_positions += 1;
    else if (user.open_positions <= 3) positionBuckets.one_to_three += 1;
    else positionBuckets.four_plus += 1;
  }

  const topPlansByUsers = [...planCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([plan_code, users_count]) => ({ plan_code, users_count }));

  return {
    generated_at: new Date().toISOString(),
    applied_range: range,
    summary: {
      total_users: summary.total_users,
      users_with_positions: summary.users_with_positions,
      users_in_profit: summary.users_in_profit,
      users_in_loss: summary.users_in_loss,
      total_open_positions: summary.total_open_positions,
      total_unrealized_pnl: summary.total_unrealized_pnl,
      total_realized_pnl: summary.total_realized_pnl,
      total_ai_decisions: summary.total_ai_decisions,
      buy_decisions: summary.buy_decisions,
      hold_decisions: summary.hold_decisions,
      sell_decisions: summary.sell_decisions,
      avg_ai_confidence:
        summary.confidence_count > 0
          ? summary.confidence_sum / summary.confidence_count
          : 0,
      avg_cts: summary.cts_count > 0 ? summary.cts_sum / summary.cts_count : 0,
      engine_success_rate:
        summary.engine_rate_count > 0
          ? summary.engine_rate_sum / summary.engine_rate_count
          : 0,
      engine_failed_runs: summary.engine_failed_runs,
      engine_blocked_runs: summary.engine_blocked_runs,
    },
    users: userRows,
    diagnostics: {
      top_loss_symbols: topLossSymbols,
      low_confidence_sell_decisions: lowConfidenceSellDecisions,
      decisions_last_7d: decisionsLast7d,
      hold_to_sell_ratio: holdToSellRatio,
      top_plans_by_users: topPlansByUsers,
      users_by_position_bucket: positionBuckets,
      symbol_concentration: symbolConcentration,
      cts_buckets: overviewCtsBuckets,
      execution_funnel: executionFunnel,
    },
  };
}
