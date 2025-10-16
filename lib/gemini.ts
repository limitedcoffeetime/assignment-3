import { GoogleGenAI } from '@google/genai';

export function hasGemini(overrideKey?: string): boolean {
  return Boolean(overrideKey || process.env.GEMINI_API_KEY);
}

export async function geminiGenerate({
  contents,
  systemPrompt = '',
  config = {}
}: {
  contents: any[];
  systemPrompt?: string;
  config?: any;
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

  const response = await ai.models.generateContent(request);
  const text = typeof response?.text === 'string' ? response.text : '';
  return { text, raw: response };
}
