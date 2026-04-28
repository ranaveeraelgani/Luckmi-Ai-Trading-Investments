const normalizeRecentCloses = (
  recentCloses?: number[] | string | null
): number[] => {
  if (Array.isArray(recentCloses)) {
    return recentCloses.filter(
      (close): close is number => typeof close === 'number' && Number.isFinite(close)
    );
  }

  if (typeof recentCloses === 'string') {
    return recentCloses
      .split(',')
      .map(value => Number(value.trim()))
      .filter(value => Number.isFinite(value));
  }

  return [];
};

const normalizeLastClose = (
  lastClose?: number | number[] | null
): number | null => {
  if (typeof lastClose === 'number' && Number.isFinite(lastClose)) {
    return lastClose;
  }

  if (Array.isArray(lastClose)) {
    const lastValue = lastClose[lastClose.length - 1];
    return typeof lastValue === 'number' && Number.isFinite(lastValue)
      ? lastValue
      : null;
  }

  return null;
};

export const getAiRecommendation = async (
  stockOverride?: string,
  ctsOverride?: number | null,
  customInstruction?: string,
  lastRSI?: number,
  lastMACD?: string,
  lastSignal?: string,
  ema200Last?: string,
  recentCloses?: number[] | string | null,
  lastClose?: number | number[] | null,
  dailyCTS?: number,
  intradayCTS?: number,
  alignment?: string,
  levels?: {
    support?: number | null;
    resistance?: number | null;
    reclaimLevel?: number | null;
    breakdownLevel?: number | null;
  }
) => {
  const stock = stockOverride;
  const ctsScore =
    ctsOverride !== undefined && ctsOverride !== null
      ? ctsOverride
      : 60;

  if (!stock || ctsScore === null) return;

  try {
    const chatApiUrl =
      typeof window === 'undefined'
        ? `${(process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/$/, '')}/api/chat`
        : '/api/chat';

    const safeLastRSI = lastRSI?.toFixed(2) ?? 'N/A';
    const safeLastMACD = lastMACD ?? 'N/A';
    const safeLastSignal = lastSignal ?? 'N/A';
    const safeEma200Last = ema200Last ?? 'N/A';
    const normalizedRecentCloses = normalizeRecentCloses(recentCloses);
    const normalizedLastClose = normalizeLastClose(lastClose);
    const emaValue = Number(ema200Last);
    const trend =
      normalizedLastClose !== null && Number.isFinite(emaValue)
        ? normalizedLastClose > emaValue
          ? 'Above EMA (Bullish)'
          : 'Below EMA (Bearish)'
        : 'N/A';
    // console.log(
    //   'Recent closes:',
    //   recentCloses,
    //   normalizedRecentCloses.map(close => close.toFixed(2)).join(', ')
    // );
    const safeRecentCloses = normalizedRecentCloses.length
      ? normalizedRecentCloses.map(close => close.toFixed(2)).join(', ')
      : 'N/A';

    const safeDailyCTS =
      dailyCTS !== undefined && dailyCTS !== null ? dailyCTS : 'N/A';
    const safeIntradayCTS =
      intradayCTS !== undefined && intradayCTS !== null ? intradayCTS : 'N/A';
    const safeAlignment = alignment || 'mixed';

    const support = levels?.support ?? 'N/A';
    const resistance = levels?.resistance ?? 'N/A';
    const reclaimLevel = levels?.reclaimLevel ?? 'N/A';
    const breakdownLevel = levels?.breakdownLevel ?? 'N/A';

    const prompt = `
You are a disciplined multi-timeframe trading analyst assisting a systematic trading engine.

The system calculates:
- Final CTS = weighted result used by the app
- Daily CTS = higher timeframe trend/regime anchor
- 15-minute CTS = execution/timing quality

Your role is to VALIDATE the setup, flag risks, and provide forward-looking insight.
Do not casually override the system. Your job is to explain whether the trade structure is strengthening, weakening, or conflicted.

CTS Zones (STRICT anchor for Final CTS):
- 78–100: Strong Buy
- 65–77: Buy
- 53–64: Hold
- 40–52: Avoid
- Below 40: Sell

CORE RULES:
1. Start by stating Final CTS, Daily CTS, and 15-minute CTS for ${stock}, plus whether they align.
2. Daily CTS is the main directional anchor.
3. 15-minute CTS is the timing layer.
4. If daily and 15-minute CTS align bullishly, that supports continuation.
5. If daily is strong but 15-minute is weak, highlight timing risk and avoid chasing.
6. If 15-minute is strong but daily is weak, describe it as a bounce or lower-conviction setup unless stronger confirmation exists.
7. Mention key price levels clearly: support, resistance, reclaim level, and breakdown risk.
8. In the last sentence, explain what price behavior matters next:
   - favorable entry zone
   - wait for reclaim
   - avoid chasing into resistance
   - sell/avoid if breakdown level fails

AI SCORE RULES:
- Generate a NEW score (do not copy Final CTS).
- Normally stay within ±10 of Final CTS.
- You MAY deviate beyond ±10 only if there is a strong, clearly identifiable reason:
  - higher timeframe structure breaking
  - lower timeframe breakdown or reclaim
  - strong exhaustion
  - unusually strong breakout confirmation
- Any deviation beyond ±10 must be justified clearly.
- If the setup is weak on the higher timeframe but has short-term strength, describe it as a bounce or wait setup, not a Sell, unless this is explicitly a position-management decision.

CONFIDENCE GUIDELINES:
- 80–100: Daily + 15m aligned, strong structure
- 60–79: Mostly aligned, some risk
- 40–59: Mixed/conflicted
- Below 40: Weak structure or poor timing

Current data:
Stock: ${stock}
Final CTS: ${ctsScore}/100
Daily CTS: ${safeDailyCTS}
15m CTS: ${safeIntradayCTS}
Alignment: ${safeAlignment}

200 EMA: ${safeEma200Last}
RSI: ${safeLastRSI}
MACD: ${safeLastMACD} (Signal: ${safeLastSignal})
Trend: ${trend}
Recent closes: ${safeRecentCloses}

Support: ${support}
Resistance: ${resistance}
Reclaim Level: ${reclaimLevel}
Breakdown Level: ${breakdownLevel}

${customInstruction ? `User instruction: ${customInstruction}` : ''}

OUTPUT FORMAT (strict):
ACTION: Buy / Hold / Avoid / Sell / Strong Buy
REASON: 5 sentences max. Sentence 1 MUST state Stock ${stock} Final CTS, Daily CTS, 15m CTS, and alignment for ${stock}. Sentence 2 should explain higher timeframe context. Sentence 3 should explain timing/execution quality. Sentence 4 should explain the main risk or confirmation area. Sentence 5 should explain what price behavior matters next.
AI Score: [number, usually within ±10 but different]
CONFIDENCE: [0-100]
RISK FLAGS: [comma-separated short phrases OR "None"]
`;

    const res = await fetch(chatApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
    });

    if (!res.ok) throw new Error(`API error: ${res.status}`);

    let text = '';
    try {
      const data = await res.json();
      text = data.content || data.message || data.text || JSON.stringify(data);
    } catch {
      text = await res.text();
    }

    const textClean = text.trim().replace(/\s+/g, ' ');

    const actionMatch = textClean.match(/ACTION:\s*(Buy|Hold|Sell|Avoid|Strong Buy)/i);
    const reasonMatch = textClean.match(/REASON:\s*(.+?)(?=AI Score:|CONFIDENCE:|RISK FLAGS:|$)/is);
    const aiScoreMatch = textClean.match(/AI Score:\s*(\d+)/i);
    const confMatch = textClean.match(/CONFIDENCE:\s*(\d+)/i);
    const riskFlagsMatch = textClean.match(/RISK FLAGS:\s*(.+?)$/i);

    if (actionMatch) {
      const action = actionMatch[1] as 'Buy' | 'Hold' | 'Avoid' | 'Sell' | 'Strong Buy';
      const reason = reasonMatch ? reasonMatch[1].trim() : 'No reasoning provided';
      const aiScore = aiScoreMatch ? parseInt(aiScoreMatch[1]) : null;
      const confidence = confMatch ? Number(confMatch[1]) : 50;
      const riskFlags = riskFlagsMatch ? riskFlagsMatch[1].trim() : 'None';

    return {
        action,
        reason,
        aiScore,
        confidence,
        riskFlags,
      };
    } else {
      return {
        action: 'Hold',
        reason: 'Could not parse AI recommendation',
        aiScore: null,
        confidence: 30,
        riskFlags: 'Unknown',
      };
    }
  } catch (err) {
    console.error('AI recommendation failed:', err);
    return {
      action: 'Hold',
      reason: 'Error connecting to AI service',
      aiScore: null,
      confidence: 30,
      riskFlags: 'System error',
    };
  }
};