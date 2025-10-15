/**
 * GPT LLM Provider (Placeholder)
 *
 * This is a placeholder for the GPT-5 API integration.
 * TODO: Implement with actual GPT API (using new Responses API, not ChatCompletions)
 */

import { BaseLLMProvider } from './LLMProvider';
import { LLMOptions } from '../types';

export class GPTProvider extends BaseLLMProvider {
  name = 'gpt';

  constructor(
    private model: string = 'gpt-5-preview',
    private apiKey?: string
  ) {
    super();
  }

  async generateText(prompt: string, options?: LLMOptions): Promise<string> {
    // TODO: Implement GPT API call using the new Responses API
    // This is where you would:
    // 1. Construct request with prompt and system message
    // 2. Call the GPT Responses API
    // 3. Parse and return the response text

    throw new Error('GPTProvider not yet implemented - please add API integration');
  }

  async generateStructured<T = any>(
    prompt: string,
    schema: any,
    options?: LLMOptions
  ): Promise<T> {
    // TODO: Implement GPT structured output
    // Use structured output mode with the schema

    throw new Error('GPTProvider structured output not yet implemented');
  }

  /**
   * TODO: Add vision-specific method for PDF transcription
   */
  async analyzeImage(
    imageData: Buffer | string,
    prompt: string,
    options?: LLMOptions
  ): Promise<string> {
    // TODO: Implement vision API call for GPT-5
    // This will be used by the PDF transcription agent

    throw new Error('GPTProvider vision not yet implemented');
  }
}

/**
 * Factory functions
 */
export function createGPT5(): GPTProvider {
  return new GPTProvider('gpt-5-preview');
}

export function createGPT5Vision(): GPTProvider {
  return new GPTProvider('gpt-5-vision-preview');
}
