// lib/quotes.ts

export async function getQuotes(symbols: string[]) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL}/api/quotes?symbols=${symbols.join(',')}`
  );

  const data = await res.json();

  const map: Record<string, any> = {};

  data.forEach((q: any) => {
    if (q.symbol) {
      map[q.symbol] = {
        price: q.price,
        change: q.change,
        percentChange: q.percentChange
      };
    }
  });

  return map;
}