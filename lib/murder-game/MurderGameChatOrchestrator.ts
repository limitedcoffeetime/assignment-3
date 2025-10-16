/**
 * MurderGameChatOrchestrator - Manages the murder mystery game through chat interface
 * Handles state persistence and integrates with the chat API
 */

import { PlayerAgent } from './PlayerAgent';
import { UserAgent } from './UserAgent';
import { GameMasterOrchestrator } from './GameMasterOrchestrator';
import { ChatUserInputHandler } from './ChatUserInputHandler';

type GameStatus = 'NOT_STARTED' | 'WAITING_FOR_USER' | 'PROCESSING' | 'GAME_OVER';

export class MurderGameChatOrchestrator {
  private gameOrchestrator: GameMasterOrchestrator | null = null;
  private chatInputHandler: ChatUserInputHandler;
  private status: GameStatus = 'NOT_STARTED';
  private gameTask: Promise<void> | null = null;
  private messageBuffer: string[] = [];

  constructor() {
    this.chatInputHandler = new ChatUserInputHandler();
  }

  /**
   * Start a new game
   */
  startGame(): void {
    if (this.status !== 'NOT_STARTED') {
      throw new Error('Game already started');
    }

    // Create player agents with distinct personalities
    const alice = new PlayerAgent({
      playerId: 'Alice',
      personalityPrompt: 'You are Alice, an analytical detective. You speak logically and observe details carefully. You question suspicious behavior and look for patterns.',
    });

    const bob = new PlayerAgent({
      playerId: 'Bob',
      personalityPrompt: 'You are Bob, a friendly and trusting person. You tend to see the best in others and give people the benefit of the doubt. You are social and likable.',
    });

    const charlie = new PlayerAgent({
      playerId: 'Charlie',
      personalityPrompt: 'You are Charlie, a cautious and suspicious person. You question everything and trust no one easily. You analyze statements critically and look for inconsistencies.',
    });

    // Create user agent
    const userAgent = new UserAgent('You', this.chatInputHandler);

    // Create game orchestrator
    this.gameOrchestrator = new GameMasterOrchestrator({
      llmAgents: [alice, bob, charlie],
      userAgent,
      onPublicMessage: (message) => {
        this.messageBuffer.push(message);
      },
    });

    // Start game in background
    this.status = 'PROCESSING';
    this.gameTask = this.runGame();

    this.messageBuffer.push('🎮 **Murder Mystery Game Started!**\n');
    this.messageBuffer.push('Players: You, Alice, Bob, Charlie\n');
    this.messageBuffer.push('One of you is the murderer. Find them before it\'s too late!\n\n');
    this.messageBuffer.push('Starting game...\n');
  }

  /**
   * Process user message and return response
   */
  async handleMessage(userMessage: string): Promise<string> {
    // Check if user wants to start a game
    if (this.status === 'NOT_STARTED') {
      const lower = userMessage.toLowerCase();
      if (lower.includes('start') || lower.includes('begin') || lower.includes('play')) {
        this.startGame();

        // Wait a bit for game to get to first prompt
        await this.waitForPrompt();

        return this.getResponse();
      }

      return 'Welcome to Murder Mystery! Type "start game" to begin.';
    }

    // Check if we're waiting for user input
    if (this.status === 'WAITING_FOR_USER') {
      // Submit user's response
      this.chatInputHandler.submitResponse(userMessage);
      this.status = 'PROCESSING';

      // Wait for next prompt or game over
      await this.waitForPrompt();

      return this.getResponse();
    }

    // Game might be over
    if (this.status === 'GAME_OVER') {
      return 'Game is over! Type "start game" to play again.';
    }

    return 'Processing... please wait.';
  }

  /**
   * Run the game in background
   */
  private async runGame(): Promise<void> {
    try {
      // Suppress all console.log during game (to prevent leaking orchestrator info)
      const originalLog = console.log;
      console.log = () => {}; // Silent

      await this.gameOrchestrator!.startGame();

      // Restore console.log
      console.log = originalLog;

      this.status = 'GAME_OVER';

      // Add game over message
      if (this.gameOrchestrator!.isGameOver()) {
        const winner = this.gameOrchestrator!.getWinner();
        this.messageBuffer.push(`\n🎉 **GAME OVER!** The ${winner?.toUpperCase()} win!\n`);
      }
    } catch (error) {
      console.error('Game error:', error);
      this.status = 'GAME_OVER';
      this.messageBuffer.push(`\n❌ Game error: ${error}\n`);
    }
  }

  /**
   * Wait for the game to reach a point where it needs user input
   */
  private async waitForPrompt(): Promise<void> {
    const startTime = Date.now();
    const timeout = 30000; // 30 second timeout

    while (Date.now() - startTime < timeout) {
      if (this.chatInputHandler.isWaitingForInput()) {
        this.status = 'WAITING_FOR_USER';
        return;
      }

      if (this.status === 'GAME_OVER') {
        return;
      }

      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error('Timeout waiting for game prompt');
  }

  /**
   * Get accumulated messages and current prompt
   */
  private getResponse(): string {
    let response = '';

    // Add all buffered messages
    if (this.messageBuffer.length > 0) {
      response += this.messageBuffer.join('');
      this.messageBuffer = [];
    }

    // Add current prompt if waiting for input
    if (this.status === 'WAITING_FOR_USER') {
      const prompt = this.chatInputHandler.getCurrentPrompt();
      if (prompt) {
        response += '\n' + prompt;
      }
    }

    return response.trim();
  }

  /**
   * Get current game status
   */
  getStatus(): GameStatus {
    return this.status;
  }

  /**
   * Reset the game
   */
  reset(): void {
    this.gameOrchestrator = null;
    this.status = 'NOT_STARTED';
    this.gameTask = null;
    this.messageBuffer = [];
    this.chatInputHandler = new ChatUserInputHandler();
  }
}
