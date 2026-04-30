import { supabaseAdmin } from '@/app/lib/supabaseAdmin';

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('auto_stocks')
    .select(`
      *,
      positions (*),
      trades (*),
      ai_decisions (*)
    `);

  if (error) {
    console.error(error);
    return new Response("Error", { status: 500 });
  }

  const mapped = (data || []).map((stock: any) => {
    const position = stock.positions?.[0] || null;
    const dbDecision = stock.last_ai_decision || null;

    return {
      ...stock,
      // Keep legacy camelCase fields for the stock page.
      compoundProfits: stock.compound_profits,
      rinseRepeat: stock.rinse_repeat,
      maxRepeats: stock.max_repeats,
      repeatCounter: stock.repeat_counter,
      lastSellTime: stock.last_sell_time,
      lastEvaluatedPrice: stock.last_evaluated_price,
      currentPosition: position
        ? {
            ...position,
            entryPrice: Number(position.entry_price) || 0,
            entryTime: position.entry_time,
            peakPrice: Number(position.peak_price) || Number(position.entry_price) || 0,
            peakPnLPercent: Number(position.peak_pnl_percent) || 0,
          }
        : null,
      lastAiDecision: dbDecision
        ? {
            ...dbDecision,
            ctsScore: dbDecision.ctsScore ?? dbDecision.cts_score ?? null,
            ctsBreakdown: dbDecision.ctsBreakdown ?? dbDecision.cts_breakdown ?? null,
            noTradeReasons: dbDecision.noTradeReasons ?? dbDecision.no_trade_reasons ?? [],
            timestamp:
              dbDecision.timestamp || stock.updated_at || stock.created_at || new Date().toISOString(),
          }
        : null,
    };
  });

  return Response.json(mapped);
}