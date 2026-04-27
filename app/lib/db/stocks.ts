// lib/db/stocks.ts

import { supabaseAdmin } from '@/app/lib/supabaseAdmin';

export async function loadUserStocks(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('auto_stocks')
    .select('*')
    .eq('user_id', userId);

  if (error) throw error;

  return data || [];
}
// lib/db/stocks.ts

export async function saveUpdatedStocks(stocks: any[]) {
  for (const stock of stocks) {
    const { error } = await supabaseAdmin
      .from('auto_stocks')
      .update({
        status: stock.status,
        allocation: stock.allocation,
        current_position: stock.currentPosition,
        last_ai_decision: stock.lastAiDecision,
        trade_history: stock.tradeHistory,
        last_sell_time: stock.lastSellTime,
        repeat_counter: stock.repeat_counter
      })
      .eq('id', stock.id);

    if (error) console.error('Stock update error:', error);
  }
}