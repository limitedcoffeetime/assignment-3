import { GoogleGenAI } from '@google/genai';

export function hasGemini(overrideKey?: string): boolean {
  return Boolean(overrideKey || process.env.GEMINI_API_KEY);
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function geminiGenerate({
  contents,
  systemPrompt = '',
  config = {},
  maxRetries = 4
}: {
  contents: any[];
  systemPrompt?: string;
  config?: any;
  maxRetries?: number;
}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');

  const ai = new GoogleGenAI({ apiKey: key });
  if (systemPrompt) {
    config.systemInstruction = systemPrompt;
  }

  const request = {
    model: 'gemini-2.5-flash',
    contents: contents,
    config: config
  };

  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent(request);
      const text = typeof response?.text === 'string' ? response.text : '';
      return { text, raw: response };
    } catch (error: any) {
      lastError = error;

      // Check if it's a retryable error (503 or 429)
      const isRetryable =
        error?.message?.includes('503') ||
        error?.message?.includes('overloaded') ||
        error?.message?.includes('429') ||
        error?.message?.includes('rate limit');

      // If not retryable or on last attempt, throw immediately
      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      // Exponential backoff with jitter: 1s, 2s, 4s, 8s + random(0-1000ms)
      const baseDelay = Math.pow(2, attempt) * 1000;
      const jitter = Math.random() * 1000; // Add randomness to avoid thundering herd
      const delayMs = baseDelay + jitter;
      console.log(`Gemini API error (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(delayMs)}ms...`);
      await sleep(delayMs);
    }
  }

  throw lastError;
}
