export const getNewsSentiment = async (symbol: string) => {
    if (!symbol) return 0;
    var news: any[];
    try {
      const res = await fetch(`/api/news?symbol=${symbol}`);
        if (res.ok) {
            const data = await res.json();
            //console.log(`Fetched news for ${symbol}:`, data);
            news = data.news || [];
            //console.log(`Fetched ${news.length} news items for ${symbol}`, news, data);
            return data;
        }
    } catch (err) {
        console.error('News error', err);
    }
}