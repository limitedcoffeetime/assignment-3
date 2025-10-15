/**
 * LLM Provider Interface
 *
 * This defines a generic interface for all LLM providers, making the system
 * model-agnostic and allowing easy swapping of providers.
 */

import { LLMProvider, LLMOptions, LLMResponse } from '../types';

export abstract class BaseLLMProvider implements LLMProvider {
  abstract name: string;

  /**
   * Generate text from a prompt
   */
  abstract generateText(prompt: string, options?: LLMOptions): Promise<string>;

  /**
   * Generate structured output conforming to a schema
   */
  abstract generateStructured<T = any>(
    prompt: string,
    schema: any,
    options?: LLMOptions
  ): Promise<T>;

  /**
   * Helper method to merge default options with user options
   */
  protected mergeOptions(defaults: LLMOptions, overrides?: LLMOptions): LLMOptions {
    return { ...defaults, ...overrides };
  }
}
