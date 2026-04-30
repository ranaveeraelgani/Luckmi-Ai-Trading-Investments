/**
 * Shared OpenAI review invocation for both user AI review and admin system review.
 * Returns null if the API key is absent or parsing fails.
 */

import OpenAI from "openai";
import { extractJsonFromText } from "./reportHelpers";

export async function callOpenAiReview<T>(
  prompt: string,
  maxTokens: number
): Promise<T | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });

  const content = completion.choices?.[0]?.message?.content || "";
  return extractJsonFromText<T>(content);
}
