import { runTradingEngine } from '@/app/lib/engine/runTradingEngine';
import { getQuotes } from '@/app/lib/quotes/quotes';
import { createClient } from '@/utils/supabase';

const supabase = createClient();

export default async function handler(req: any, res: any) {
  try {
    // 🔐 optional security
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 1️⃣ Get all active auto stocks from DB
    const { data: stocks, error } = await supabase
      .from('auto_stocks')
      .select('*')
      .neq('status', 'completed');

    if (error) throw error;

    if (!stocks || stocks.length === 0) {
      return res.status(200).json({ message: 'No stocks to process' });
    }

    // 2️⃣ Get quotes
    const symbols = stocks.map(s => s.symbol);
    const quotes = await getQuotes(symbols);
    // 3️⃣ Run engine
    const updatedStocks = await runTradingEngine(stocks, quotes);

    // 4️⃣ Save back to DB
    for (const stock of updatedStocks) {
      await supabase
        .from('auto_stocks')
        .update(stock)
        .eq('id', stock.id);
    }

    return res.status(200).json({
      success: true,
      processed: updatedStocks.length
    });

  } catch (err) {
    console.error('Engine error:', err);
    return res.status(500).json({ error: 'Engine failed' });
  }
}