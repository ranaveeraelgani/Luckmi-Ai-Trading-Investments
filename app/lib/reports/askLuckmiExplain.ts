export type AiReview = {
  overview: string;
  strengths: string[];
  risks: string[];
  symbolInsights: { symbol: string; insight: string }[];
  nextFocus: string[];
  meta?: {
    generatedAt?: string;
    sampleSizes?: {
      trades?: number;
      aiDecisions?: number;
      brokerOrders?: number;
      positions?: number;
      brokerPositions?: number;
    };
  };
};

/**
 * Sends a user question about an existing AI review to Luckmi chat.
 * Returns the plain-text explanation string.
 * Throws on network or API errors.
 */
export async function askLuckmiExplain(
  aiReview: AiReview,
  question: string
): Promise<string> {
  const resolvedQuestion =
    question.trim() ||
    "Explain the most important risk in simple terms and what I should change first.";

  const prompt = `You are Luckmi AI Trading Assistant.
You are explaining an existing trading review, not giving fresh trade signals.
Do not provide financial advice and do not promise profits.
Use plain English and keep it concise.

User question: ${resolvedQuestion}

Current review context:
${JSON.stringify(
  {
    overview: aiReview.overview,
    strengths: aiReview.strengths,
    risks: aiReview.risks,
    symbolInsights: aiReview.symbolInsights,
    nextFocus: aiReview.nextFocus,
  },
  null,
  2
)}

Answer in 4-8 sentences with:
1) direct answer,
2) what it means,
3) what user should focus on next.
`;

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error || "Failed to get explanation");
  }

  return String(data?.content || "No explanation available.");
}
