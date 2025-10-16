/**
 * GameMasterOrchestrator - The central orchestrator that manages the murder mystery game
 * This LLM has full game state and carefully distributes information to maintain context isolation
 */

import { PlayerAgent } from './PlayerAgent';
import { UserAgent } from './UserAgent';
import {
  assignRoles,
  resolveNightActions,
  resolveVoting,
  checkMurdererKillConstraint,
} from './tools';
import {
  GameState,
  GamePhase,
  Role,
  Fact,
  AllegedInfo,
  NightAction,
  Vote,
  PlayerState,
} from './types';

export interface GameMasterConfig {
  llmAgents: PlayerAgent[];
  userAgent: UserAgent;
  onPublicMessage?: (message: string) => void;  // Public messages shown to user
}

type Agent = PlayerAgent | UserAgent;

export class GameMasterOrchestrator {
  private gameState: GameState;
  private agents: Map<string, Agent>;
  private llmAgents: PlayerAgent[];
  private userAgent: UserAgent;
  private onPublicMessage?: (message: string) => void;

  constructor(config: GameMasterConfig) {
    this.llmAgents = config.llmAgents;
    this.userAgent = config.userAgent;
    this.onPublicMessage = config.onPublicMessage;

    // Create agents map for easy lookup
    this.agents = new Map();
    this.llmAgents.forEach(agent => this.agents.set(agent.playerId, agent));
    this.agents.set(this.userAgent.playerId, this.userAgent);

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

    // Initialize player states
    this.agents.forEach((agent, playerId) => {
      this.gameState.playerStates.set(playerId, {
        playerId,
        role: null,
        isAlive: true,
        facts: [],
        allegedInfo: [],
      });
    });
  }

  /**
   * Start the game - assign roles and begin Day 0
   */
  public async startGame(): Promise<void> {

    // Assign roles using deterministic tool
    const playerIds = Array.from(this.agents.keys());
    const { roles } = assignRoles(playerIds);
    this.gameState.roles = roles;

    // Privately notify each agent of their role
    for (const [playerId, role] of Array.from(roles.entries())) {
      const agent = this.agents.get(playerId)!;
      agent.setRole(role);

      const playerState = this.gameState.playerStates.get(playerId)!;
      playerState.role = role;

    }

    this.gameState.phase = 'DAY_0_INTRO';

    await this.runIntroductions();
  }

  /**
   * Run Day 0 introductions
   */
  private async runIntroductions(): Promise<void> {
    const introductions = new Map<string, string>();

    // Collect introductions from all players in parallel
    const introPromises = Array.from(this.agents.entries()).map(
      async ([playerId, agent]) => {
        const intro = await agent.makeIntroduction();
        introductions.set(playerId, intro);
      }
    );

    await Promise.all(introPromises);

    // PUBLIC: Show all introductions to user
    this.sendPublicMessage('\n**Introductions:**\n');
    for (const [playerId, intro] of Array.from(introductions.entries())) {
      if (playerId !== this.userAgent.playerId) {
        this.sendPublicMessage(`**${playerId}:** "${intro}"\n`);
      }
    }
    this.sendPublicMessage('\n');

    // Distribute introductions to all players (except their own)
    for (const [receiverId, receiver] of Array.from(this.agents.entries())) {
      for (const [speakerId, introduction] of Array.from(introductions.entries())) {
        if (receiverId !== speakerId) {
          const info: AllegedInfo = {
            speaker: speakerId,
            day: 0,
            content: introduction,
          };
          receiver.addAllegedInfo(info);
          this.gameState.playerStates.get(receiverId)!.allegedInfo.push(info);
        }
      }
    }

    // Move to Night 1
    await this.runNightPhase();
  }

  /**
   * Send a public message to the user
   */
  private sendPublicMessage(message: string): void {
    if (this.onPublicMessage) {
      this.onPublicMessage(message);
    }
  }

  /**
   * Run a night phase
   */
  private async runNightPhase(): Promise<void> {
    this.gameState.nightNumber++;
    this.gameState.phase = 'NIGHT';


    const alivePlayers = this.getAlivePlayers();
    const actions: NightAction[] = [];

    // Collect actions from all alive players
    for (const playerId of alivePlayers) {
      const agent = this.agents.get(playerId)!;
      const role = this.gameState.roles.get(playerId)!;


      // Check murderer constraint if applicable
      if (role === 'murderer') {
        const isValid = checkMurdererKillConstraint(
          this.gameState.lastNoKillNight,
          this.gameState.nightNumber,
          true  // We'll validate after they choose
        );
        // Note: validation will happen after action is collected
      }

      const action = await agent.chooseNightAction(
        this.gameState.nightNumber,
        alivePlayers,
        this.gameState.lastNoKillNight
      );

      actions.push(action);

      const actionDesc = action.action === 'stay_home'
        ? 'staying home'
        : `visiting ${action.targetPlayerId}`;
      const killIntent = action.intentToKill !== undefined
        ? ` (intent to kill: ${action.intentToKill ? 'YES' : 'NO'})`
        : '';
    }

    // Resolve night actions using deterministic tool
    const nightResult = resolveNightActions(
      actions,
      this.gameState.roles,
      this.gameState.nightNumber
    );

    // Update lastNoKillNight tracking
    const murdererAction = actions.find(
      a => this.gameState.roles.get(a.playerId) === 'murderer'
    );
    if (murdererAction && !murdererAction.intentToKill) {
      this.gameState.lastNoKillNight = this.gameState.nightNumber;
    } else if (murdererAction && murdererAction.intentToKill) {
      this.gameState.lastNoKillNight = null;
    }

    // Process deaths
    const deaths: string[] = [];
    for (const death of nightResult.deaths) {
      const victim = this.agents.get(death.victimId)!;
      victim.isAlive = false;

      const victimState = this.gameState.playerStates.get(death.victimId)!;
      victimState.isAlive = false;

      const victimRole = this.gameState.roles.get(death.victimId)!;
      this.gameState.deadPlayers.push({
        playerId: death.victimId,
        diedNight: this.gameState.nightNumber,
        role: victimRole,
      });

      deaths.push(death.victimId);

    }

    // Record murder attempt
    this.gameState.murderHistory.push({
      night: this.gameState.nightNumber,
      victim: deaths[0],
      blocked: nightResult.blocked,
      successful: deaths.length > 0,
    });

    // PRIVATE: Show user what happened at their location
    const userFacts = nightResult.newFacts.get(this.userAgent.playerId);
    if (userFacts && userFacts.length > 0) {
      this.sendPublicMessage('\n**What happened:**\n');
      userFacts.forEach(fact => {
        this.sendPublicMessage(`${fact.content}\n`);
      });
      this.sendPublicMessage('\n');
    }

    // Distribute facts to each player
    for (const [playerId, facts] of Array.from(nightResult.newFacts.entries())) {
      const agent = this.agents.get(playerId)!;
      facts.forEach(fact => {
        agent.addFact(fact);
        this.gameState.playerStates.get(playerId)!.facts.push(fact);
      });
    }

    // Check if game is over (all innocents dead)
    const aliveInnocents = this.getAlivePlayers().filter(
      id => this.gameState.roles.get(id) === 'innocent'
    );
    if (aliveInnocents.length === 0) {
      this.gameState.gameOver = true;
      this.gameState.winner = 'murderer';
      return;
    }

    // Move to day phase
    await this.runDayPhase(deaths, nightResult.murdererNotification !== null && nightResult.blocked);
  }

  /**
   * Run a day phase (discussion + voting)
   */
  private async runDayPhase(recentDeaths: string[], murdererKillBlocked: boolean): Promise<void> {
    this.gameState.dayNumber++;
    this.gameState.phase = 'DAY_DISCUSSION';


    if (recentDeaths.length > 0) {
    } else {
    }

    // Each alive player makes a statement
    const alivePlayers = this.getAlivePlayers();
    const statements = new Map<string, string>();

    for (const playerId of alivePlayers) {
      const agent = this.agents.get(playerId)!;
      const isMurderer = this.gameState.roles.get(playerId) === 'murderer';


      const statement = await agent.makeStatement(
        this.gameState.dayNumber,
        recentDeaths,
        isMurderer && murdererKillBlocked
      );

      statements.set(playerId, statement);
    }

    // PUBLIC: Show other players' statements to user
    this.sendPublicMessage('\n**Statements:**\n');
    for (const [playerId, statement] of Array.from(statements.entries())) {
      if (playerId !== this.userAgent.playerId) {
        this.sendPublicMessage(`**${playerId}:** "${statement}"\n`);
      }
    }
    this.sendPublicMessage('\n');

    // Distribute statements as alleged info
    for (const [speakerId, statement] of Array.from(statements.entries())) {
      for (const receiverId of alivePlayers) {
        if (receiverId !== speakerId) {
          const info: AllegedInfo = {
            speaker: speakerId,
            day: this.gameState.dayNumber,
            content: statement,
          };

          const receiver = this.agents.get(receiverId)!;
          receiver.addAllegedInfo(info);
          this.gameState.playerStates.get(receiverId)!.allegedInfo.push(info);
        }
      }
    }

    // Move to voting
    await this.runVotingPhase();
  }

  /**
   * Run voting phase
   */
  private async runVotingPhase(): Promise<void> {
    this.gameState.phase = 'DAY_VOTING';


    const alivePlayers = this.getAlivePlayers();
    const votes: Vote[] = [];

    // Collect votes from all alive players
    for (const playerId of alivePlayers) {
      const agent = this.agents.get(playerId)!;


      const vote = await agent.vote(this.gameState.dayNumber, alivePlayers);
      votes.push({ voterId: playerId, targetId: vote });

    }

    // Resolve voting using deterministic tool
    const votingResult = resolveVoting(votes, alivePlayers, this.gameState.roles);

    // PUBLIC: Show vote results
    this.sendPublicMessage('\n**Vote Results:**\n');
    votingResult.voteTally.forEach((count, playerId) => {
      this.sendPublicMessage(`${playerId}: ${count} vote(s)\n`);
    });

    if (votingResult.result === 'hanged') {
      const hangedPlayer = votingResult.hangedPlayer!;
      const hangedRole = votingResult.hangedRole!;

      this.sendPublicMessage(`\n⚖️ **${hangedPlayer} was HANGED. They were: ${hangedRole.toUpperCase()}**\n\n`);

      // Update agent state
      const agent = this.agents.get(hangedPlayer)!;
      agent.isAlive = false;

      const playerState = this.gameState.playerStates.get(hangedPlayer)!;
      playerState.isAlive = false;

      // Add role reveal fact to all alive players
      const remainingAlive = alivePlayers.filter(id => id !== hangedPlayer);
      for (const playerId of remainingAlive) {
        const fact: Fact = {
          type: 'role_reveal',
          day: this.gameState.dayNumber,
          content: `${hangedPlayer} was hanged and revealed to be: ${hangedRole}`,
        };

        const agent = this.agents.get(playerId)!;
        agent.addFact(fact);
        this.gameState.playerStates.get(playerId)!.facts.push(fact);
      }

      if (votingResult.gameOver) {
        this.gameState.gameOver = true;
        this.gameState.winner = votingResult.winner;

        if (votingResult.winner === 'innocents') {
          this.sendPublicMessage('🎉 **GAME OVER! The INNOCENTS win!**\n');
        } else {
          this.sendPublicMessage('🎉 **GAME OVER! The MURDERER wins!**\n');
        }
        return;
      }
    } else {
      this.sendPublicMessage('\n❌ No consensus reached. No one was hanged.\n\n');
    }

    // Continue to next night
    await this.runNightPhase();
  }

  /**
   * Get list of alive player IDs
   */
  private getAlivePlayers(): string[] {
    return Array.from(this.agents.keys()).filter(
      playerId => this.agents.get(playerId)!.isAlive
    );
  }

  /**
   * Get current game state (for debugging/UI)
   */
  public getGameState(): GameState {
    return this.gameState;
  }

  /**
   * Check if game is over
   */
  public isGameOver(): boolean {
    return this.gameState.gameOver;
  }

  /**
   * Get winner (if game is over)
   */
  public getWinner(): 'innocents' | 'murderer' | undefined {
    return this.gameState.winner;
  }
}
