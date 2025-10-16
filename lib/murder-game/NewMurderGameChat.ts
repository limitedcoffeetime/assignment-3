/**
 * NewMurderGameChat - Manages the murder mystery game with LLM orchestrator
 *
 * This replaces the old MurderGameChatOrchestrator with the new LLM-based system
 */

import { OrchestratorLLM, DebugEvent } from './OrchestratorLLM';
import { SimpleLLMAgent } from './SimpleLLMAgent';

type GameStatus = 'NOT_STARTED' | 'WAITING_FOR_USER' | 'WAITING_FOR_AGENT' | 'PROCESSING' | 'GAME_OVER';

export class NewMurderGameChat {
  private orchestrator: OrchestratorLLM | null = null;
  private agents: Map<string, SimpleLLMAgent> = new Map();
  private status: GameStatus = 'NOT_STARTED';
  private messageBuffer: string[] = [];
  private debugEvents: DebugEvent[] = [];

  // Who we're waiting for
  private waitingForPlayer: string | null = null;

  private readonly humanPlayerId = 'Player';  // Changed from 'You' to 'Player'
  private readonly agentIds = ['Alice', 'Bob', 'Charlie'];

  // Track messages for each agent separately for UI display
  private agentMessages: Map<string, string[]> = new Map();

  constructor() {
    // Initialize agent message tracking
    this.agentIds.forEach(id => this.agentMessages.set(id, []));
  }

  /**
   * Start a new game
   */
  async startGame(): Promise<string> {
    if (this.status !== 'NOT_STARTED') {
      throw new Error('Game already started');
    }

    // Create LLM agents
    this.agents.set('Alice', new SimpleLLMAgent({
      playerId: 'Alice',
      personalityPrompt: 'You are analytical and logical, like a detective. You question suspicious behavior and look for patterns.',
    }));

    this.agents.set('Bob', new SimpleLLMAgent({
      playerId: 'Bob',
      personalityPrompt: 'You are friendly and trusting. You tend to see the best in others and give people the benefit of the doubt.',
    }));

    this.agents.set('Charlie', new SimpleLLMAgent({
      playerId: 'Charlie',
      personalityPrompt: 'You are cautious and suspicious. You question everything and trust no one easily.',
    }));

    // Create orchestrator
    this.orchestrator = new OrchestratorLLM({
      playerIds: [this.humanPlayerId, ...this.agentIds],
      humanPlayerId: this.humanPlayerId,
      onMessageToPlayer: (playerId, message) => {
        this.handleMessageToPlayer(playerId, message);
      },
      onDebugEvent: (event) => {
        this.debugEvents.push(event);
      },
    });

    this.status = 'PROCESSING';
    this.messageBuffer.push('🎮 **Murder Mystery Game Started!**\n\n');
    this.messageBuffer.push('Players: You, Alice, Bob, Charlie\n\n');

    // Start the game - orchestrator assigns roles and tells everyone
    await this.orchestrator.startGame();

    // Now waiting for introductions from all players
    this.status = 'WAITING_FOR_USER';
    this.messageBuffer.push('\n**Introduce yourself in one sentence:**\n');

    return this.flushMessages();
  }

  /**
   * Handle message sent to a specific player
   * Messages to human go to shared buffer, messages to agents go to their specific tracking
   */
  private async handleMessageToPlayer(playerId: string, message: string): Promise<void> {
    if (playerId === this.humanPlayerId) {
      // For human, add to message buffer without formatting
      this.messageBuffer.push(`\n${message}\n`);

      // If message looks like it's asking for input, set status
      if (message.includes('?') || message.toLowerCase().includes('introduce') ||
          message.toLowerCase().includes('your action') || message.toLowerCase().includes('vote')) {
        this.status = 'WAITING_FOR_USER';
        this.waitingForPlayer = this.humanPlayerId;
      }
    } else if (this.agentMessages.has(playerId)) {
      // For agents, track messages separately for their UI columns
      this.agentMessages.get(playerId)!.push(`**[Game Master → ${playerId}]:** ${message}\n`);
    }
  }

  /**
   * Handle user message (alias for API compatibility)
   */
  async handleMessage(userMessage: string): Promise<string> {
    return this.handleUserMessage(userMessage);
  }

  /**
   * Handle user message
   */
  async handleUserMessage(userMessage: string): Promise<string> {
    if (this.status === 'NOT_STARTED') {
      // Check if user wants to start
      if (userMessage.toLowerCase().includes('start')) {
        return await this.startGame();
      }
      return 'Type "start game" to begin!';
    }

    if (this.status === 'GAME_OVER') {
      return 'Game is over! Refresh to play again.';
    }

    if (this.status !== 'WAITING_FOR_USER') {
      return 'Please wait, the game is processing...';
    }

    // User is responding - now collect ALL agent responses in parallel
    this.status = 'PROCESSING';

    // Don't add user message to buffer here - orchestrator will echo it back in broadcast

    // Get the latest context from orchestrator to know what question was asked
    const gameState = this.orchestrator!.getGameState();
    const phase = gameState.phase;

    // Collect responses from LLM agents based on current phase
    const agentResponsePromises = this.agentIds.map(async (agentId) => {
      const agent = this.agents.get(agentId);
      if (!agent) return null;

      const agentState = gameState.playerStates.get(agentId);
      if (!agentState || !agentState.isAlive) return null;

      try {
        // Get agent's context and ask them the appropriate question
        const agentContext = this.orchestrator!.getAgentContext(agentId);
        const contextStr = agentContext.length > 0 ? agentContext.join(' | ') : 'No context yet.';

        let question = '';
        if (phase === 'DAY_0_INTRO') {
          question = `Game Master says: Introduce yourself in one sentence.\n\nYour context: ${contextStr}`;
        } else if (phase === 'NIGHT') {
          question = `Game Master says: It's night time. What do you want to do? You can stay at your own home, or visit another player's home.\n\nYour context: ${contextStr}\n\nAlive players: ${this.agentIds.filter(id => gameState.playerStates.get(id)?.isAlive).join(', ')}\n\nExample: "I'll stay home" or "I'll visit Alice's home"`;
        } else if (phase === 'DAY_DISCUSSION') {
          question = `Game Master says: Make a statement about what happened and your suspicions.\n\nYour context: ${contextStr}`;
        } else if (phase === 'DAY_VOTING') {
          question = `Game Master says: Vote for who you want to hang, or abstain.\n\nYour context: ${contextStr}\n\nAlive players: ${this.agentIds.filter(id => gameState.playerStates.get(id)?.isAlive).join(', ')}`;
        }

        if (!question) return null;

        const response = await agent.respondTo(question);

        // Add to agent's own message tracking (for their UI column)
        if (this.agentMessages.has(agentId)) {
          this.agentMessages.get(agentId)!.push(`**${agentId}:** "${response}"\n`);
        }

        return { agentId, response };
      } catch (error) {
        console.error(`Error getting response from ${agentId}:`, error);
        return null;
      }
    });

    // Wait for all agent responses
    const agentResponses = (await Promise.all(agentResponsePromises)).filter(r => r !== null);

    // Send ALL responses to orchestrator in batch
    const allResponses = [
      `${this.humanPlayerId} says: "${userMessage}"`,
      ...agentResponses.map(r => `${r!.agentId} says: "${r!.response}"`)
    ].join('\n\n');

    await this.orchestrator!.processPlayerResponse('BATCH', allResponses);

    // Check if game is over
    if (this.orchestrator!.isGameOver()) {
      this.status = 'GAME_OVER';
      this.messageBuffer.push('\n🎉 **GAME OVER!**\n');
    } else {
      // Still waiting for user's next input
      this.status = 'WAITING_FOR_USER';

      // Add appropriate prompt based on current phase
      const updatedGameState = this.orchestrator!.getGameState();
      const currentPhase = updatedGameState.phase;

      if (currentPhase === 'NIGHT') {
        this.messageBuffer.push(`\n**Night ${updatedGameState.nightNumber}**: What do you want to do? (e.g., "visit Alice's home" or "stay home")\n`);
      } else if (currentPhase === 'DAY_DISCUSSION') {
        this.messageBuffer.push('\n**Day Discussion**: Make a statement about what happened or your suspicions.\n');
      } else if (currentPhase === 'DAY_VOTING') {
        const alive = this.agentIds.filter(id => updatedGameState.playerStates.get(id)?.isAlive);
        this.messageBuffer.push(`\n**Voting Time**: Vote for who to hang (${alive.join(', ')}) or say "abstain".\n`);
      }
    }

    return this.flushMessages();
  }

  /**
   * Flush message buffer and return accumulated messages
   */
  private flushMessages(): string {
    let allMessages = this.messageBuffer.join('');

    // Add agent messages to the output
    this.agentMessages.forEach((messages, agentId) => {
      if (messages.length > 0) {
        allMessages += messages.join('');
      }
    });

    // Clear buffers
    this.messageBuffer = [];
    this.agentMessages.forEach((_, agentId) => this.agentMessages.set(agentId, []));

    return allMessages;
  }

  /**
   * Get current status
   */
  getStatus(): GameStatus {
    return this.status;
  }

  /**
   * Get debug events
   */
  getDebugEvents(): DebugEvent[] {
    return this.debugEvents;
  }

  /**
   * Get recent debug events and clear them
   */
  getAndClearDebugEvents(): DebugEvent[] {
    const events = [...this.debugEvents];
    this.debugEvents = [];
    return events;
  }

  /**
   * Get game state (for debugging)
   */
  getGameState(): any {
    return this.orchestrator?.getGameState();
  }

  /**
   * Reset the game
   */
  reset(): void {
    this.orchestrator = null;
    this.agents.clear();
    this.status = 'NOT_STARTED';
    this.messageBuffer = [];
    this.debugEvents = [];
    this.waitingForPlayer = null;
  }
}
