/**
 * OrchestratorLLM - The omniscient LLM that controls the murder mystery game
 *
 * This LLM:
 * - Has full game state (knows all roles, actions, locations)
 * - Collects natural language from all players
 * - Interprets intent and calls deterministic tools via function calling
 * - Maintains separate context windows for each LLM agent
 * - Reports new events to human player (human tracks own context)
 */

import { GoogleGenAI, Type } from '@google/genai';
import {
  assignRoles,
  resolveNightActions,
  resolveVoting,
} from './tools';
import {
  GameState,
  Role,
  NightAction,
  Vote,
} from './types';

export interface OrchestratorConfig {
  playerIds: string[];
  humanPlayerId: string;
  onMessageToPlayer: (playerId: string, message: string) => void;
  onDebugEvent?: (event: DebugEvent) => void;
}

export interface DebugEvent {
  type: 'role_assignment' | 'night_resolution' | 'voting_resolution' | 'decision' | 'context_update' | 'tool_call' | 'llm_response';
  data: any;
  timestamp: number;
}

export class OrchestratorLLM {
  private gameState: GameState;
  private playerIds: string[];
  private humanPlayerId: string;
  private onMessageToPlayer: (playerId: string, message: string) => void;
  private onDebugEvent?: (event: DebugEvent) => void;
  private ai: GoogleGenAI;
  private chat: any; // Gemini chat session

  // Individual context windows for each LLM agent (not for human)
  private agentContexts: Map<string, string[]> = new Map();

  // Track broadcasts to prevent duplicates
  private recentBroadcasts: Set<string> = new Set();

  // Tool declarations for function calling
  private tools: any[] = [
    {
      functionDeclarations: [
        {
          name: 'assignRoles',
          description: 'Randomly assign one murderer and rest innocents. Call this ONCE at game start only.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              playerIds: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Array of all player IDs',
              },
            },
            required: ['playerIds'],
          },
        },
        {
          name: 'resolveNightActions',
          description: 'Resolve night phase: determine deaths, locations, and facts each player witnesses.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              actions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    playerId: { type: Type.STRING },
                    action: { type: Type.STRING, description: 'Either "stay_home" or "visit"' },
                    targetPlayerId: { type: Type.STRING, description: 'Required if action is "visit"' },
                    intentToKill: { type: Type.BOOLEAN, description: 'Only for murderer, omit for innocents' },
                  },
                },
                description: 'Array of night actions from all alive players',
              },
              nightNumber: { type: Type.INTEGER },
            },
            required: ['actions', 'nightNumber'],
          },
        },
        {
          name: 'resolveVoting',
          description: 'Count votes and determine if someone is hanged.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              votes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    voterId: { type: Type.STRING },
                    targetId: { type: Type.STRING, description: 'Player ID or "abstain"' },
                  },
                },
              },
              alivePlayers: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['votes', 'alivePlayers'],
          },
        },
        {
          name: 'sendMessageToPlayer',
          description: 'Send a message to a specific player. For LLM agents, this adds to their context. For human, just displays it.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              playerId: { type: Type.STRING },
              message: { type: Type.STRING },
            },
            required: ['playerId', 'message'],
          },
        },
        {
          name: 'broadcast',
          description: 'Send the same message to all alive players.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              message: { type: Type.STRING },
            },
            required: ['message'],
          },
        },
      ],
    },
  ];

  constructor(config: OrchestratorConfig) {
    this.playerIds = config.playerIds;
    this.humanPlayerId = config.humanPlayerId;
    this.onMessageToPlayer = config.onMessageToPlayer;
    this.onDebugEvent = config.onDebugEvent;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not set');
    this.ai = new GoogleGenAI({ apiKey });

    // Initialize game state
    this.gameState = {
      phase: 'INIT',
      nightNumber: 0,
      dayNumber: 0,
      roles: new Map(),
      playerStates: new Map(),
      deadPlayers: [],
      murderHistory: [],
      lastNoKillNight: null,
      gameOver: false,
    };

    // Initialize agent contexts (not for human)
    this.playerIds.forEach(playerId => {
      if (playerId !== this.humanPlayerId) {
        this.agentContexts.set(playerId, []);
      }
    });
  }

  /**
   * Execute a tool call from the LLM
   */
  private executeTool(functionCall: any): any {
    const { name, args } = functionCall;

    console.log(`[Orchestrator] Tool call: ${name}`, args);
    this.emitDebug('tool_call', { name, args });

    switch (name) {
      case 'assignRoles': {
        const { roles } = assignRoles(args.playerIds);
        this.gameState.roles = roles;

        // Initialize player states
        this.playerIds.forEach(playerId => {
          this.gameState.playerStates.set(playerId, {
            playerId,
            role: roles.get(playerId)!,
            isAlive: true,
            facts: [],
            allegedInfo: [],
          });
        });

        this.emitDebug('role_assignment', {
          roles: Array.from(roles.entries()),
        });

        return {
          success: true,
          roles: Array.from(roles.entries()).map(([id, role]) => `${id}: ${role}`)
        };
      }

      case 'resolveNightActions': {
        const { actions, nightNumber } = args;
        const nightActions: NightAction[] = actions.map((a: any) => ({
          playerId: a.playerId,
          action: a.action,
          targetPlayerId: a.targetPlayerId,
          intentToKill: a.intentToKill,
        }));

        const result = resolveNightActions(
          nightActions,
          this.gameState.roles,
          nightNumber
        );

        // Update game state
        this.gameState.nightNumber = nightNumber;
        result.deaths.forEach(death => {
          const state = this.gameState.playerStates.get(death.victimId);
          if (state) state.isAlive = false;
        });

        this.emitDebug('night_resolution', result);

        return {
          deaths: result.deaths.map(d => d.victimId),
          blocked: result.blocked,
          facts: Array.from(result.newFacts.entries()).map(([playerId, facts]) => ({
            playerId,
            facts: facts.map(f => f.content),
          })),
        };
      }

      case 'resolveVoting': {
        const { votes, alivePlayers } = args;
        const votesList: Vote[] = votes.map((v: any) => ({
          voterId: v.voterId,
          targetId: v.targetId,
        }));

        const result = resolveVoting(votesList, alivePlayers, this.gameState.roles);

        // Update game state
        if (result.result === 'hanged' && result.hangedPlayer) {
          const state = this.gameState.playerStates.get(result.hangedPlayer);
          if (state) state.isAlive = false;

          if (result.gameOver) {
            this.gameState.gameOver = true;
            this.gameState.winner = result.winner;
          }
        }

        this.emitDebug('voting_resolution', result);

        return {
          result: result.result,
          hangedPlayer: result.hangedPlayer,
          hangedRole: result.hangedRole,
          voteTally: Array.from(result.voteTally.entries()),
          gameOver: result.gameOver,
          winner: result.winner,
        };
      }

      case 'sendMessageToPlayer': {
        const { playerId, message } = args;

        // For LLM agents, add to context
        if (playerId !== this.humanPlayerId) {
          const context = this.agentContexts.get(playerId);
          if (context) {
            context.push(message);
          }
        }

        // Send via callback ONLY to the intended recipient
        // This prevents messages to Alice/Bob/Charlie from showing in human's view
        this.onMessageToPlayer(playerId, message);

        this.emitDebug('context_update', { playerId, message });

        return { success: true };
      }

      case 'broadcast': {
        const { message } = args;

        // Check if we already broadcast this exact message recently
        if (this.recentBroadcasts.has(message)) {
          console.log('[Orchestrator] Skipping duplicate broadcast:', message.substring(0, 50));
          return { success: false, error: 'Duplicate broadcast prevented', recipientCount: 0 };
        }

        // Add to recent broadcasts
        this.recentBroadcasts.add(message);

        const alivePlayers = this.getAlivePlayers();

        // For LLM agents, add to their context
        alivePlayers.forEach(playerId => {
          if (playerId !== this.humanPlayerId) {
            const context = this.agentContexts.get(playerId);
            if (context) {
              context.push(message);
            }
          }
        });

        // Only send to HUMAN player for UI display (prevents 4x duplication)
        this.onMessageToPlayer(this.humanPlayerId, message);

        this.emitDebug('context_update', { type: 'broadcast', message, recipients: alivePlayers });

        return { success: true, recipientCount: alivePlayers.length };
      }

      default:
        return { error: 'Unknown tool' };
    }
  }

  /**
   * Process function calls and continue conversation until LLM stops calling tools
   */
  private async processWithFunctionCalling(userMessage: string): Promise<string> {
    let response = await this.chat.sendMessage({ message: userMessage });

    // Loop while LLM wants to call functions
    let iterationCount = 0;
    const MAX_ITERATIONS = 10; // Reduced to prevent too many tool calls

    while (response.functionCalls && response.functionCalls.length > 0 && iterationCount < MAX_ITERATIONS) {
      iterationCount++;
      console.log(`[Orchestrator] Iteration ${iterationCount}, tool calls:`, response.functionCalls.length);

      // Execute all function calls in this iteration
      const functionResponses = response.functionCalls.map((fc: any) => {
        const result = this.executeTool(fc);
        return {
          name: fc.name,
          response: result,
        };
      });

      console.log(`[Orchestrator] Sending ${functionResponses.length} function responses back to LLM`);

      // Send function results back to LLM
      response = await this.chat.sendMessage({
        message: '',
        functionResponses,
      });

      console.log(`[Orchestrator] LLM response has ${response.functionCalls?.length || 0} more function calls`);
    }

    if (iterationCount >= MAX_ITERATIONS) {
      console.error(`[Orchestrator] HIT MAX_ITERATIONS (${MAX_ITERATIONS})! Orchestrator kept calling tools.`);
    }

    const textResponse = response.text || '';
    this.emitDebug('llm_response', { text: textResponse, iterations: iterationCount });

    return textResponse;
  }

  /**
   * Get list of alive player IDs
   */
  private getAlivePlayers(): string[] {
    return this.playerIds.filter(playerId => {
      const state = this.gameState.playerStates.get(playerId);
      return state?.isAlive ?? true;
    });
  }

  /**
   * Emit debug event
   */
  private emitDebug(type: DebugEvent['type'], data: any): void {
    if (this.onDebugEvent) {
      this.onDebugEvent({
        type,
        data,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Start the game
   */
  public async startGame(): Promise<void> {
    const systemPrompt = `You are the Game Master for a murder mystery game.

**Your Role:**
- You are OMNISCIENT - you know all roles, actions, and outcomes
- You control information flow to maintain game integrity
- You interpret natural language from players and execute game logic using tools
- You maintain context isolation between players

**The Game:**
- 4 players total: ${this.playerIds.join(', ')}
- Human player is: ${this.humanPlayerId}
- 1 murderer (randomly assigned), 3 innocents
- Flow: Day 0 (intros) → Night (actions) → Day (discussion + voting) → repeat
- Murderer must kill every other night minimum
- Innocents win if murderer hanged; Murderer wins if all innocents dead

**Night Mechanics:**
- Each player can STAY HOME or VISIT another player's HOME
- Players at the same HOME see each other (facts)
- If murderer visits a home with intent to kill and only 1 other person is there: kill succeeds
- If 3+ people at same home: kill is blocked

**Your Tools:**
- assignRoles: Randomly assign roles (call ONCE at start)
- resolveNightActions: Process night actions, get deaths and facts
- resolveVoting: Count votes and determine hanging
- sendMessageToPlayer: Send message to specific player (adds to LLM context, shows to human)
- broadcast: Send same message to all alive players

**CRITICAL Information Flow Rules:**
- **Human (${this.humanPlayerId})**: Just report NEW events. Human remembers everything.
- **LLM players**: Use sendMessageToPlayer to add info to their context. They ONLY know what you tell them.

**Context Isolation:**
- Players only learn facts they WITNESSED (same location during night)
- Statements are ALLEGED (may be lies)
- Role reveals ONLY when hanged (NOT night deaths)
- Dead players get NO new information

**CRITICAL: Discrete Turn-Based Flow:**
- This is NOT a conversation - it's DISCRETE TURNS
- You do actions, then STOP and WAIT for all player responses
- Players respond externally (you'll receive them as batched messages)
- Process the batch, do actions, then STOP and WAIT again

**Tool Usage:**
- sendMessageToPlayer/broadcast: INFORM players of outcomes/context
- assignRoles, resolveNightActions, resolveVoting: Process game logic
- NEVER use tools to "ask" or "request" - just inform and wait

**Your Workflow (Discrete Phases):**
1. **INIT Phase**: Call assignRoles, then sendMessageToPlayer to tell each player their role → Say "Waiting for introductions" → STOP
2. **DAY 0 Phase**: You'll receive "Player X says: [intro]" for all 4 players → For EACH player, use sendMessageToPlayer to tell them what the OTHER 3 players said (exclude their own intro) → Say "Beginning Night 1" → STOP
3. **NIGHT Phase**: You'll receive "Player X says: [action]" for all alive → Parse their natural language actions, call resolveNightActions with structured data, sendMessageToPlayer with results to each player → Say "Beginning Day X" → STOP
4. **DAY DISCUSSION Phase**: You'll receive "Player X says: [statement]" for all alive → For EACH player, use sendMessageToPlayer to tell them what the OTHER players said (exclude their own statement) → Say "Time to vote" → STOP
5. **VOTE Phase**: You'll receive "Player X says: [vote]" for all alive → Parse natural language votes, call resolveVoting with structured data, broadcast results → STOP or end
6. Repeat phases 3-5 until game over

**Parsing Natural Language:**
- Players will say things like "I'll visit Alice's home" → parse to {action: "visit", targetPlayerId: "Alice"}
- Players will say "stay home" → parse to {action: "stay_home"}
- Murderers will say "with intent to kill" or similar → parse to {intentToKill: true}
- For votes: "vote for Alice" → parse to {targetId: "Alice"}, "abstain" → parse to {targetId: "abstain"}

**CRITICAL RULES:**
- After completing your tools for a phase, STOP. Do NOT continue calling tools.
- Do NOT skip phases. You must receive input for each phase before moving to the next.
- Broadcast messages ONCE. If you already broadcast something, do NOT broadcast it again.
- Do NOT make up player actions or responses - wait for them to be given to you.
- After calling broadcast or sendMessageToPlayer with results, you are DONE. Stop calling tools.`;

    // Create chat session
    this.chat = this.ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: systemPrompt,
        tools: this.tools,
      },
    });

    // Start the game - INIT phase
    await this.processWithFunctionCalling('INIT Phase: Call assignRoles with all playerIds, then use sendMessageToPlayer to privately tell each player their role. Then STOP - players will introduce themselves externally.');

    this.gameState.phase = 'DAY_0_INTRO';
  }

  /**
   * Process player response
   */
  public async processPlayerResponse(playerId: string, response: string): Promise<void> {
    // Clear recent broadcasts for new phase
    this.recentBroadcasts.clear();

    // Build context for this player if they're an LLM
    let contextInfo = '';
    if (playerId !== this.humanPlayerId) {
      const context = this.agentContexts.get(playerId);
      if (context && context.length > 0) {
        contextInfo = `\n\n[${playerId}'s Context: ${context.join(' | ')}]`;
      }
    }

    const message = `${playerId} says: "${response}"${contextInfo}`;

    console.log('[Orchestrator] Processing player response, message length:', message.length);
    await this.processWithFunctionCalling(message);
  }

  /**
   * Get current game state (for debugging)
   */
  public getGameState(): GameState {
    return this.gameState;
  }

  /**
   * Get agent context (for debugging)
   */
  public getAgentContext(playerId: string): string[] {
    return this.agentContexts.get(playerId) || [];
  }

  /**
   * Check if game is over
   */
  public isGameOver(): boolean {
    return this.gameState.gameOver;
  }
}
