import { any } from "zod";

export const calculateNewsSentiment = (news: any[]) => {    
    
    //var news = await getNewsSentiment(symbol) as any[] || [];
    if (!news || news.length === 0) return 8; // neutral base

    let score = 8; // start with neutral base

    const positiveKeywords = [
        'beat', 'raise', 'upgrade', 'strong', 'buy', 'bullish',
        'record', 'growth', 'outperform', 'surge', 'rally', 'positive'
    ];

    const negativeKeywords = [
        'miss', 'cut', 'downgrade', 'weak', 'sell', 'bearish',
        'decline', 'drop', 'loss', 'disappoint', 'negative', 'warn'
    ];

    news.forEach(n => {
        const text = (n.headline + ' ' + (n.summary || '')).toLowerCase();

        // Count positive matches
        const posMatches = positiveKeywords.filter(w => text.includes(w)).length;
        score += posMatches * 4;   // +4 per strong positive keyword

        // Count negative matches
        const negMatches = negativeKeywords.filter(w => text.includes(w)).length;
        score -= negMatches * 5;   // -5 per negative keyword (stronger penalty)
    });

    // Cap the sentiment contribution
    score = Math.max(-10, Math.min(20, score));

    return score;
};