import { supabaseAdmin } from '@/app/lib/supabaseAdmin';

type EntryOrderRow = {
  side: 'buy' | 'sell' | string;
  filled_avg_price: number | string | null;
  filled_qty: number | string | null;
  qty: number | string | null;
};

/**
 * Recompute net_debit from filled entry orders and persist it on option_paper_trades.
 *
 * Per-contract debit (per-share):
 *   (sum(buy_notional) - sum(sell_notional)) / total_buy_qty
 */
export async function syncOptionTradeNetDebitFromEntryFills(tradeId: string): Promise<number | null> {
  const { data, error } = await supabaseAdmin
    .from('option_trade_orders')
    .select('side, filled_avg_price, filled_qty, qty')
    .eq('trade_id', tradeId)
    .eq('order_role', 'entry');

  if (error) {
    console.warn(`[options-net-debit] load entry fills failed tradeId=${tradeId}: ${error.message}`);
    return null;
  }

  const rows = (data ?? []) as EntryOrderRow[];
  if (rows.length === 0) return null;

  let buyNotional = 0;
  let sellNotional = 0;
  let buyQty = 0;

  for (const row of rows) {
    const price = Number(row.filled_avg_price);
    if (!Number.isFinite(price) || price <= 0) continue;

    const filledQty = Number(row.filled_qty);
    const fallbackQty = Number(row.qty);
    const qty = Number.isFinite(filledQty) && filledQty > 0
      ? filledQty
      : Number.isFinite(fallbackQty) && fallbackQty > 0
        ? fallbackQty
        : 0;

    if (qty <= 0) continue;

    if (row.side === 'sell') {
      sellNotional += price * qty;
    } else {
      buyNotional += price * qty;
      buyQty += qty;
    }
  }

  if (buyQty <= 0) return null;

  const netDebit = (buyNotional - sellNotional) / buyQty;
  if (!Number.isFinite(netDebit) || netDebit < 0) return null;

  const { error: updateError } = await supabaseAdmin
    .from('option_paper_trades')
    .update({ net_debit: netDebit })
    .eq('id', tradeId);

  if (updateError) {
    console.warn(`[options-net-debit] update failed tradeId=${tradeId}: ${updateError.message}`);
    return null;
  }

  return netDebit;
}
