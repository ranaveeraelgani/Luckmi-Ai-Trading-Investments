export async function insertAiDecision(
  supabase: any,
  stock: any,
  decision: any
) {
  if (!decision) return;

  await supabase.from('ai_decisions').insert({
    auto_stock_id: stock.id,
    user_id: stock.user_id,
    symbol: stock.symbol,
    action: decision.action,
    reason: decision.reason,
    confidence: decision.confidence,
    cts_score: decision.ctsScore,
    cts_breakdown: decision.ctsBreakdown || null,
    price: decision.price || null,
    pnl_percent: decision.pnlPercent || null,
    created_at: new Date(),
  });
}