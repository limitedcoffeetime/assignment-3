/**
 * SimpleLLMAgent - An LLM agent that responds to natural language prompts
 *
 * This agent:
 * - Has a personality and role
 * - Responds naturally to any prompt from the orchestrator
 * - Maintains conversation history with the orchestrator
 * - Does NOT parse or structure responses - just natural conversation
 */

import { geminiGenerate } from '../gemini';
import { Role } from './types';

export interface SimpleLLMAgentConfig {
  playerId: string;
  personalityPrompt: string;
}

export class SimpleLLMAgent {
  public readonly playerId: string;
  private personalityPrompt: string;
  private role: Role | null = null;

  // Conversation history - messages from orchestrator
  private conversationHistory: Array<{ role: 'system' | 'user' | 'assistant', content: string }> = [];

  constructor(config: SimpleLLMAgentConfig) {
    this.playerId = config.playerId;
    this.personalityPrompt = config.personalityPrompt;

    // Initialize with personality
    this.conversationHistory.push({
      role: 'system',
      content: `You are ${this.playerId}. ${this.personalityPrompt}

You are playing a murder mystery game with other players. You will receive messages from the Game Master telling you about the game state and asking you questions.

Respond naturally and in character. Do not use structured formats like "ACTION:" or "VOTE:" - just speak normally as your character would.

Examples:
- When asked what you want to do at night: "I think I'll visit Bob's house tonight to see what he's up to."
- When asked who to vote for: "I'm voting for Alice. She's been acting suspicious."
- When making a statement: "I stayed home last night and saw Charlie visiting me. Where were you, Alice?"

Stay in character and be strategic based on your role.`
    });
  }

  /**
   * Set the agent's role (called by orchestrator privately)
   */
  public setRole(role: Role): void {
    this.role = role;

    const roleDescription = role === 'murderer'
      ? `Your secret role: MURDERER. Your goal is to eliminate all innocents without being caught. You can lie and deceive. Remember: if 3+ people are at the same location, you cannot kill. You must attempt to kill at least every other night.`
      : `Your role: INNOCENT. Your goal is to identify and hang the murderer before you die. Share information, look for inconsistencies, and work with other innocents.`;

    this.conversationHistory.push({
      role: 'system',
      content: roleDescription
    });
  }

  /**
   * Respond to a message from the orchestrator
   */
  public async respondTo(message: string): Promise<string> {
    // Add orchestrator's message
    this.conversationHistory.push({
      role: 'user',
      content: message
    });

    // Get response from LLM
    const systemMessages = this.conversationHistory
      .filter(msg => msg.role === 'system')
      .map(msg => msg.content)
      .join('\n\n');

    const conversationMessages = this.conversationHistory
      .filter(msg => msg.role !== 'system')
      .map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));

    const { text } = await geminiGenerate({
      contents: conversationMessages,
      systemPrompt: systemMessages,
    });

    const response = text.trim();

    // Add response to history
    this.conversationHistory.push({
      role: 'assistant',
      content: response
    });

    return response;
  }

  /**
   * Get conversation history (for debugging)
   */
  public getHistory(): Array<{ role: string, content: string }> {
    return this.conversationHistory;
  }
}
