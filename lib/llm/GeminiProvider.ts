/**
 * Gemini Provider
 *
 * Simplified provider for all Gemini API interactions.
 * Supports text generation, structured output, multimodal, and thinking mode.
 */

import { GoogleGenAI, Type } from '@google/genai';
import type { GenerateContentParameters } from '@google/genai';

export interface GeminiOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  thinkingBudget?: number; // For Gemini 2.5 Pro (min 128, or -1 for dynamic)
}

export class GeminiProvider {
  private ai: GoogleGenAI;

  constructor(
    private model: string = 'gemini-2.5-flash',
    apiKey?: string
  ) {
    this.ai = new GoogleGenAI({ apiKey: apiKey || process.env.GEMINI_API_KEY });
  }

  /**
   * Generate text from a prompt (optionally with multimodal content)
   */
  async generateText(
    prompt: string | any[],
    options?: GeminiOptions
  ): Promise<string> {
    const contents = typeof prompt === 'string' ? prompt : prompt;

    const config: any = {
      temperature: options?.temperature,
      maxOutputTokens: options?.maxTokens,
    };

    if (options?.systemPrompt) {
      config.systemInstruction = options.systemPrompt;
    }

    if (options?.thinkingBudget !== undefined) {
      config.thinkingConfig = { thinkingBudget: options.thinkingBudget };
    }

    const response = await this.ai.models.generateContent({
      model: this.model,
      contents,
      config,
    });

    return response.text || '';
  }

  /**
   * Generate structured JSON output with schema validation
   */
  async generateStructured<T = any>(
    prompt: string | any[],
    schema: any,
    options?: GeminiOptions
  ): Promise<T> {
    const contents = typeof prompt === 'string' ? prompt : prompt;

    const config: any = {
      temperature: options?.temperature,
      maxOutputTokens: options?.maxTokens,
      responseMimeType: 'application/json',
      responseSchema: schema,
    };

    if (options?.systemPrompt) {
      config.systemInstruction = options.systemPrompt;
    }

    const response = await this.ai.models.generateContent({
      model: this.model,
      contents,
      config,
    });

    return JSON.parse(response.text || '{}') as T;
  }

  /**
   * Create a multimodal part from a file buffer
   */
  static createFilePart(buffer: Buffer, mimeType: string) {
    return {
      inlineData: {
        data: buffer.toString('base64'),
        mimeType,
      },
    };
  }

  /**
   * Helper to create common schema types
   */
  static get Type() {
    return Type;
  }
}

/**
 * Factory functions
 */
export function createGeminiFlash(): GeminiProvider {
  return new GeminiProvider('gemini-2.5-flash');
}

export function createGeminiPro(): GeminiProvider {
  return new GeminiProvider('gemini-2.5-pro');
}
