/**
 * ChatUserInputHandler - Handles user input through a chat interface
 * Prompts are sent as messages, and responses come back through the chat
 */

import { UserInputHandler } from './UserAgent';
import { Role, Fact, AllegedInfo, NightAction } from './types';

type PendingPrompt = {
  type: 'introduction' | 'night_action' | 'statement' | 'vote';
  prompt: string;
  resolve: (value: any) => void;
  context?: any;
};

export class ChatUserInputHandler implements UserInputHandler {
  private pendingPrompt: PendingPrompt | null = null;

  /**
   * Get the current prompt to display to the user (if any)
   */
  getCurrentPrompt(): string | null {
    return this.pendingPrompt?.prompt || null;
  }

  /**
   * Check if we're waiting for user input
   */
  isWaitingForInput(): boolean {
    return this.pendingPrompt !== null;
  }

  /**
   * Submit user's response to the current prompt
   */
  submitResponse(response: string): void {
    if (!this.pendingPrompt) {
      throw new Error('No pending prompt to respond to');
    }

    const { type, resolve, context } = this.pendingPrompt;

    // Parse response based on type
    switch (type) {
      case 'introduction':
        resolve(response);
        break;

      case 'night_action':
        resolve(this.parseNightAction(response, context));
        break;

      case 'statement':
        resolve(response);
        break;

      case 'vote':
        resolve(this.parseVote(response));
        break;
    }

    this.pendingPrompt = null;
  }

  // UserInputHandler interface implementation

  async getIntroduction(): Promise<string> {
    return new Promise((resolve) => {
      this.pendingPrompt = {
        type: 'introduction',
        prompt: `🎭 **Day 0: Introductions**

Introduce yourself to the other players in 2-3 sentences. Be creative!

Type your introduction:`,
        resolve,
      };
    });
  }

  async getNightAction(
    nightNumber: number,
    alivePlayers: string[],
    role: Role,
    facts: Fact[],
    allegedInfo: AllegedInfo[],
    mustKill?: boolean
  ): Promise<NightAction> {
    return new Promise((resolve) => {
      let prompt = `🌙 **Night ${nightNumber}**\n\n`;

      prompt += `**Your Role:** ${role.toUpperCase()}\n\n`;

      // Don't show facts/alleged info to human - they can remember themselves

      prompt += `**Choose your action:**\n`;

      if (role === 'murderer') {
        if (mustKill) {
          prompt += `⚠️ **You MUST attempt a kill tonight!**\n\n`;
        }
        prompt += `1. Stay home (with or without intent to kill)\n`;
        prompt += `2. Visit [player] (with or without intent to kill)\n\n`;
        prompt += `**Available players:** ${alivePlayers.join(', ')}\n\n`;
        prompt += `**Format:**\n`;
        prompt += `• "stay" or "stay kill" or "stay nokill"\n`;
        prompt += `• "visit [player]" or "visit [player] kill" or "visit [player] nokill"\n\n`;
        prompt += `Type your action:`;
      } else {
        prompt += `1. Stay home\n`;
        prompt += `2. Visit [player]\n\n`;
        prompt += `**Available players:** ${alivePlayers.join(', ')}\n\n`;
        prompt += `**Format:**\n`;
        prompt += `• "stay"\n`;
        prompt += `• "visit [player]"\n\n`;
        prompt += `Type your action:`;
      }

      this.pendingPrompt = {
        type: 'night_action',
        prompt,
        resolve,
        context: { role, alivePlayers, mustKill },
      };
    });
  }

  async getStatement(
    dayNumber: number,
    recentDeaths: string[],
    facts: Fact[],
    allegedInfo: AllegedInfo[],
    murdererKillBlocked?: boolean
  ): Promise<string> {
    return new Promise((resolve) => {
      let prompt = `☀️ **Day ${dayNumber}: Discussion**\n\n`;

      if (recentDeaths.length > 0) {
        prompt += `💀 **Last night:** ${recentDeaths.join(', ')} died.\n\n`;
      } else {
        prompt += `✅ **Last night:** No one died.\n\n`;
      }

      if (murdererKillBlocked) {
        prompt += `🔪 **[PRIVATE]** Your kill was BLOCKED due to witnesses!\n\n`;
      }

      // Don't show facts/alleged info to human - they can remember themselves

      prompt += `**Your turn to speak:**\n`;
      prompt += `Share whatever you wish (facts, suspicions, lies, etc.)\n\n`;
      prompt += `Type your statement:`;

      this.pendingPrompt = {
        type: 'statement',
        prompt,
        resolve,
      };
    });
  }

  async getVote(
    dayNumber: number,
    alivePlayers: string[],
    facts: Fact[],
    allegedInfo: AllegedInfo[]
  ): Promise<string | 'abstain'> {
    return new Promise((resolve) => {
      let prompt = `🗳️ **Day ${dayNumber}: Voting**\n\n`;

      // Don't show facts/alleged info to human - they can remember themselves

      prompt += `**Vote to hang a player or abstain:**\n`;
      prompt += `**Available:** ${alivePlayers.join(', ')}\n\n`;
      prompt += `**Format:**\n`;
      prompt += `• "vote [player]"\n`;
      prompt += `• "abstain"\n\n`;
      prompt += `Type your vote:`;

      this.pendingPrompt = {
        type: 'vote',
        prompt,
        resolve,
      };
    });
  }

  // Helper methods

  private parseNightAction(response: string, context: any): NightAction {
    const lower = response.toLowerCase().trim();
    const { role, alivePlayers } = context;

    let action: 'stay_home' | 'visit' = 'stay_home';
    let target: string | undefined;
    let intentToKill: boolean | undefined;

    if (lower.startsWith('stay')) {
      action = 'stay_home';
      if (role === 'murderer') {
        if (lower.includes('kill') && !lower.includes('nokill')) {
          intentToKill = true;
        } else {
          intentToKill = false;
        }
      }
    } else if (lower.startsWith('visit')) {
      action = 'visit';

      // Extract player name
      const visitMatch = lower.match(/visit\s+(\S+)/);
      if (visitMatch) {
        const targetName = visitMatch[1];
        // Find matching player (case-insensitive)
        target = alivePlayers.find((p: string) =>
          p.toLowerCase() === targetName.toLowerCase()
        );
      }

      if (role === 'murderer') {
        if (lower.includes('kill') && !lower.includes('nokill')) {
          intentToKill = true;
        } else {
          intentToKill = false;
        }
      }
    }

    return {
      playerId: 'user', // Will be overridden by UserAgent
      action,
      targetPlayerId: target,
      intentToKill,
    };
  }

  private parseVote(response: string): string | 'abstain' {
    const lower = response.toLowerCase().trim();

    if (lower === 'abstain' || lower.startsWith('abstain')) {
      return 'abstain';
    }

    // Extract player name from "vote [player]"
    const voteMatch = lower.match(/vote\s+(\S+)/);
    if (voteMatch) {
      return voteMatch[1];
    }

    // If just a name, treat as vote
    return response.trim();
  }
}
