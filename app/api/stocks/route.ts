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
  const mapped = data.map(stock => ({
  ...stock,
  currentPosition: stock.positions?.[0] || null
}));
  return Response.json(mapped);
}