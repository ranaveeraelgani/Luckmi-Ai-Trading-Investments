// lib/db/positions.ts

import { symbol } from 'zod';
import { supabaseAdmin } from '../supabaseAdmin';
import { stat } from 'fs';

export async function loadPositions(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('positions')
    .select('*')
    .eq('user_id', userId);

  if (error) throw error;

  return data || [];
}

// lib/db/positions.ts

export async function upsertPosition(supabase: any, stock: any) {
  const pos = stock.currentPosition;

  if (!pos) return;

  await supabase
    .from('positions')
    .upsert({
      auto_stock_id: stock.id,
      user_id: stock.user_id,
      symbol: stock.symbol,
      status: stock.status,
      entry_price: pos.entryPrice,
      shares: pos.shares,
      peak_price: pos.peakPrice,
      peak_pnl_percent: pos.peakPnLPercent,
      entry_time: pos.entryTime,
      updated_at: new Date(),
    }, {
      onConflict: 'auto_stock_id'
    });
}

export async function deletePosition(supabase: any, stockId: string) {
  await supabase
    .from('positions')
    .delete()
    .eq('auto_stock_id', stockId);
}