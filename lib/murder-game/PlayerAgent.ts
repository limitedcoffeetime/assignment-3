/**
 * PlayerAgent - An LLM-powered agent that plays the murder mystery game
 */

import { geminiGenerate } from '../gemini';
import { Role, Fact, AllegedInfo, NightAction, Message } from './types';

export interface PlayerAgentConfig {
  playerId: string;
  personalityPrompt?: string;  // Optional personality for the agent
}

export class PlayerAgent {
  public readonly playerId: string;
  public role: Role | null = null;
  public isAlive: boolean = true;
  public facts: Fact[] = [];
  public allegedInfo: AllegedInfo[] = [];

  private conversationHistory: Message[] = [];
  private personalityPrompt: string;

  constructor(config: PlayerAgentConfig) {
    this.playerId = config.playerId;
    this.personalityPrompt = config.personalityPrompt ||
      'You are a clever and observant player trying to survive and win the game.';
  }

  /**
   * Initialize the agent with their role (called privately by orchestrator)
   */
  public setRole(role: Role): void {
    this.role = role;

    const roleDescription = role === 'murderer'
      ? `You are the MURDERER. Your goal is to eliminate all innocents without being caught. You can:
         - Visit other players' homes with or without intent to kill
         - Stay home with or without intent to kill
         - You cannot kill if 3+ people are at the same location (witnesses)
         - You must attempt to kill at least every other night
         - You can lie during discussions to avoid suspicion`
      : `You are INNOCENT. Your goal is to identify and hang the murderer before you die. You can:
         - Visit other players' homes to gather information
         - Stay home to see who visits you
         - Share information (or suspicions) during day discussions
         - Vote to hang suspected players`;

    this.addSystemMessage(
      `${this.personalityPrompt}\n\n${roleDescription}\n\nYour player ID: ${this.playerId}`
    );
  }

  /**
   * Add a new fact that this player witnessed directly
   */
  public addFact(fact: Fact): void {
    this.facts.push(fact);
  }

  /**
   * Add information that this player heard from someone else (may be a lie)
   */
  public addAllegedInfo(info: AllegedInfo): void {
    this.allegedInfo.push(info);
  }

  /**
   * Generate an introduction for Day 0
   */
  public async makeIntroduction(): Promise<string> {
    const prompt = `The game is beginning. Introduce yourself to the other players in 2-3 sentences.

Be creative and establish a personality. This is just a social introduction - you don't have any game information to share yet.

Respond with ONLY your introduction, nothing else.`;

    this.addUserMessage(prompt);
    const response = await this.callLLM();
    this.addAssistantMessage(response);

    return response;
  }

  /**
   * Choose a night action (stay home or visit someone)
   */
  public async chooseNightAction(
    nightNumber: number,
    alivePlayers: string[],
    lastNoKillNight: number | null
  ): Promise<NightAction> {
    const otherPlayers = alivePlayers.filter(id => id !== this.playerId);

    let prompt = `It is Night ${nightNumber}. You must choose your action.\n\n`;

    // Add context about what this player knows
    prompt += this.buildKnowledgeContext();

    if (this.role === 'murderer') {
      const mustKill = lastNoKillNight !== null && nightNumber - lastNoKillNight === 1;

      prompt += `\nYou are the MURDERER. Choose your action:\n\n`;
      prompt += `1. Stay at your own home\n`;
      prompt += `2. Visit another player's home\n\n`;
      prompt += `For EACH option, you must decide: INTENT TO KILL (yes/no)\n`;

      if (mustKill) {
        prompt += `\n⚠️ IMPORTANT: You did NOT attempt a kill last night. You MUST attempt a kill tonight (intent to kill = yes).\n`;
      } else {
        prompt += `\nNote: You can choose "no intent to kill" to build trust, but you cannot do this two nights in a row.\n`;
      }

      prompt += `\nReminder: If 3+ people are at the same location, your kill will be BLOCKED.\n`;
      prompt += `\nAvailable players to visit: ${otherPlayers.join(', ')}\n\n`;
      prompt += `Respond in this EXACT format:\n`;
      prompt += `ACTION: stay_home OR visit\n`;
      prompt += `TARGET: [player_id] (only if visiting)\n`;
      prompt += `INTENT_TO_KILL: yes OR no\n`;
      prompt += `REASONING: [brief explanation for yourself]`;
    } else {
      prompt += `\nYou are INNOCENT. Choose your action:\n\n`;
      prompt += `1. Stay at your own home (you might see who visits you)\n`;
      prompt += `2. Visit another player's home (you'll see who else is there)\n\n`;
      prompt += `Available players to visit: ${otherPlayers.join(', ')}\n\n`;
      prompt += `Respond in this EXACT format:\n`;
      prompt += `ACTION: stay_home OR visit\n`;
      prompt += `TARGET: [player_id] (only if visiting)\n`;
      prompt += `REASONING: [brief explanation for yourself]`;
    }

    this.addUserMessage(prompt);
    const response = await this.callLLM();
    this.addAssistantMessage(response);

    return this.parseNightAction(response);
  }

  /**
   * Make a statement during day discussion
   */
  public async makeStatement(
    dayNumber: number,
    recentDeaths: string[],
    murdererKillBlocked: boolean = false
  ): Promise<string> {
    let prompt = `It is Day ${dayNumber}. `;

    if (recentDeaths.length > 0) {
      prompt += `Last night, the following player(s) died: ${recentDeaths.join(', ')}.\n\n`;
    } else {
      prompt += `No one died last night.\n\n`;
    }

    if (this.role === 'murderer' && murdererKillBlocked) {
      prompt += `🔪 PRIVATE INFO (only you know): Your kill attempt was BLOCKED last night due to witnesses.\n\n`;
    }

    prompt += this.buildKnowledgeContext();

    prompt += `\nShare whatever information you wish with the group. You can:\n`;
    prompt += `- Share where you went last night and who you saw\n`;
    prompt += `- Share suspicions about other players\n`;
    prompt += `- Ask questions or respond to others' claims\n`;

    if (this.role === 'murderer') {
      prompt += `- LIE to avoid suspicion (you're the murderer!)\n`;
    }

    prompt += `\nKeep your statement concise (2-4 sentences).\n\n`;
    prompt += `Respond with ONLY your statement, nothing else.`;

    this.addUserMessage(prompt);
    const response = await this.callLLM();
    this.addAssistantMessage(response);

    return response;
  }

  /**
   * Vote for a player to hang or abstain
   */
  public async vote(dayNumber: number, alivePlayers: string[]): Promise<string | 'abstain'> {
    const otherPlayers = alivePlayers.filter(id => id !== this.playerId);

    let prompt = `It is time to VOTE on Day ${dayNumber}.\n\n`;

    prompt += this.buildKnowledgeContext();

    prompt += `\nYou must vote to HANG one player, or ABSTAIN.\n\n`;
    prompt += `Available players to vote for: ${otherPlayers.join(', ')}\n`;
    prompt += `Or you can vote: abstain\n\n`;
    prompt += `Consider:\n`;
    prompt += `- What facts do you know for certain?\n`;
    prompt += `- What claims have others made?\n`;
    prompt += `- Who seems suspicious based on their statements?\n`;

    if (this.role === 'murderer') {
      prompt += `- How can you deflect suspicion away from yourself?\n`;
    }

    prompt += `\nRespond in this EXACT format:\n`;
    prompt += `VOTE: [player_id] OR abstain\n`;
    prompt += `REASONING: [brief explanation for yourself]`;

    this.addUserMessage(prompt);
    const response = await this.callLLM();
    this.addAssistantMessage(response);

    return this.parseVote(response);
  }

  /**
   * Build a summary of what this player knows
   */
  private buildKnowledgeContext(): string {
    let context = `\n=== YOUR KNOWLEDGE ===\n`;

    if (this.facts.length > 0) {
      context += `\nFACTS (things you witnessed directly):\n`;
      this.facts.forEach((fact, i) => {
        context += `${i + 1}. ${fact.content}\n`;
      });
    }

    if (this.allegedInfo.length > 0) {
      context += `\nALLEGED INFO (things others claimed - may be lies):\n`;
      this.allegedInfo.forEach((info, i) => {
        context += `${i + 1}. ${info.speaker} said: "${info.content}"\n`;
      });
    }

    if (this.facts.length === 0 && this.allegedInfo.length === 0) {
      context += `You have no information yet.\n`;
    }

    context += `===================\n`;

    return context;
  }

  /**
   * Parse night action from LLM response
   */
  private parseNightAction(response: string): NightAction {
    const lines = response.split('\n').map(l => l.trim());

    let action: 'stay_home' | 'visit' = 'stay_home';
    let target: string | undefined;
    let intentToKill = false;

    lines.forEach(line => {
      if (line.startsWith('ACTION:')) {
        const actionStr = line.replace('ACTION:', '').trim().toLowerCase();
        action = actionStr === 'visit' ? 'visit' : 'stay_home';
      } else if (line.startsWith('TARGET:')) {
        target = line.replace('TARGET:', '').trim();
      } else if (line.startsWith('INTENT_TO_KILL:')) {
        const intentStr = line.replace('INTENT_TO_KILL:', '').trim().toLowerCase();
        intentToKill = intentStr === 'yes';
      }
    });

    return {
      playerId: this.playerId,
      action,
      targetPlayerId: target,
      intentToKill: this.role === 'murderer' ? intentToKill : undefined,
    };
  }

  /**
   * Parse vote from LLM response
   */
  private parseVote(response: string): string | 'abstain' {
    const lines = response.split('\n').map(l => l.trim());

    for (const line of lines) {
      if (line.startsWith('VOTE:')) {
        const vote = line.replace('VOTE:', '').trim().toLowerCase();
        return vote === 'abstain' ? 'abstain' : vote;
      }
    }

    return 'abstain';  // Default to abstain if parsing fails
  }

  /**
   * Call the LLM with current conversation history
   */
  private async callLLM(): Promise<string> {
    // Separate system messages from conversation
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

    return text.trim();
  }

  private addSystemMessage(content: string): void {
    this.conversationHistory.push({ role: 'system', content });
  }

  private addUserMessage(content: string): void {
    this.conversationHistory.push({ role: 'user', content });
  }

  private addAssistantMessage(content: string): void {
    this.conversationHistory.push({ role: 'assistant', content });
  }
}
