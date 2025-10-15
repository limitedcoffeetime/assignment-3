/**
 * Router Agent
 *
 * Determines user intent: solve a problem set, check status, or cancel a job.
 * Uses a cheap, fast model (Gemini Flash).
 */

import { Agent, RouterInput, RouterOutput, RouterIntent } from '../types';
import { createGeminiFlash, GeminiProvider } from '../llm/GeminiProvider';

const ROUTER_SCHEMA = {
  type: GeminiProvider.Type.OBJECT,
  properties: {
    intent: {
      type: GeminiProvider.Type.STRING,
      enum: ['solve', 'status', 'cancel', 'unknown'],
    },
    confidence: {
      type: GeminiProvider.Type.NUMBER,
    },
    reasoning: {
      type: GeminiProvider.Type.STRING,
    },
  },
  required: ['intent', 'confidence', 'reasoning'],
};

export class RouterAgent implements Agent {
  name = 'router';
  private llm = createGeminiFlash();

  async execute(input: RouterInput): Promise<RouterOutput> {
    const { message, hasPDF } = input;

    // Quick heuristics for obvious cases
    if (hasPDF && !message) {
      // PDF uploaded with no message - clearly wants to solve
      return {
        intent: 'solve',
        confidence: 1.0,
        reasoning: 'PDF uploaded without message - assuming solve intent',
      };
    }

    // Use LLM to determine intent
    const prompt = this.buildPrompt(message, hasPDF);

    try {
      const result = await this.llm.generateStructured<{
        intent: RouterIntent;
        confidence: number;
        reasoning: string;
      }>(prompt, ROUTER_SCHEMA, {
        temperature: 0.1, // Low temperature for consistent routing
      });

      return {
        intent: result.intent,
        confidence: result.confidence,
        reasoning: result.reasoning,
      };
    } catch (error: any) {
      console.error('Router agent error:', error);

      // Fallback: if has PDF, assume solve; otherwise unknown
      return {
        intent: hasPDF ? 'solve' : 'unknown',
        confidence: 0.3,
        reasoning: `Error in routing: ${error.message}. Using fallback logic.`,
      };
    }
  }

  private buildPrompt(message: string, hasPDF: boolean): string {
    return `You are a routing agent for a problem set solving system. Analyze the user's message and determine their intent.

User message: "${message}"
Has PDF attachment: ${hasPDF}

Your task is to classify the intent as one of:
- "solve": User wants to solve a problem set (usually accompanied by PDF upload)
- "status": User wants to check the status of their problem set solving jobs
- "cancel": User wants to cancel a job in progress
- "unknown": Intent is unclear

Provide:
1. The intent (one of the above)
2. A confidence score (0-1)
3. Brief reasoning for your classification

Common patterns:
- PDF upload + message like "solve this" or "help with this pset" → solve
- "what's the status?" or "how is my job doing?" → status
- "cancel the job" or "stop solving" → cancel
- Ambiguous or conversational messages → unknown

Be especially confident when:
- PDF is uploaded → likely solve
- Keywords like "status", "progress", "check" → likely status
- Keywords like "cancel", "stop", "abort" → likely cancel`;
  }
}
