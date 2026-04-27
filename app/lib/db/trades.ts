// lib/db/trades.ts

import { supabaseAdmin } from '../supabaseAdmin';

export async function insertTrades(trades: any[]) {
  if (!trades.length) return;

  const { error } = await supabaseAdmin
    .from('trades')
    .insert(trades);

  if (error) {
    console.error('Insert trades error:', error);
    throw error;
  }
}