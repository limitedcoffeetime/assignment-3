/**
 * Gemini LLM Provider
 *
 * Implements the LLM provider interface for Google's Gemini models.
 * Already integrated with the existing gemini.ts helper.
 */

import { BaseLLMProvider } from './LLMProvider';
import { LLMOptions } from '../types';
import { geminiGenerate } from '../gemini';

export class GeminiProvider extends BaseLLMProvider {
  name = 'gemini';

  constructor(
    private model: string = 'gemini-2.5-flash',
    private apiKey?: string
  ) {
    super();
  }

  async generateText(prompt: string, options?: LLMOptions): Promise<string> {
    const contents = [{ role: 'user', parts: [{ text: prompt }] }];

    const config: any = {
      temperature: options?.temperature,
      maxOutputTokens: options?.maxTokens,
    };

    const result = await geminiGenerate({
      contents,
      systemPrompt: options?.systemPrompt || '',
      config,
    });

    return result.text;
  }

  async generateStructured<T = any>(
    prompt: string,
    schema: any,
    options?: LLMOptions
  ): Promise<T> {
    const contents = [{ role: 'user', parts: [{ text: prompt }] }];

    const config: any = {
      temperature: options?.temperature,
      maxOutputTokens: options?.maxTokens,
      responseMimeType: 'application/json',
      responseSchema: schema,
    };

    const result = await geminiGenerate({
      contents,
      systemPrompt: options?.systemPrompt || '',
      config,
    });

    return JSON.parse(result.text) as T;
  }
}

/**
 * Factory function for creating Gemini providers
 */
export function createGeminiFlash(): GeminiProvider {
  return new GeminiProvider('gemini-2.5-flash');
}

export function createGeminiPro(): GeminiProvider {
  return new GeminiProvider('gemini-2.5-pro');
}

export function createGeminiProThinking(): GeminiProvider {
  // TODO: Update model name when thinking mode is available
  return new GeminiProvider('gemini-2.5-pro-thinking');
}
