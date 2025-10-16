import { GameOrchestrator, AgentResponse } from './GameOrchestrator';

/**
 * MurderMysteryOrchestrator - Game-specific orchestrator for murder mystery game
 *
 * All the game LOGIC lives here (role assignment, night resolution, voting, win conditions)
 * All the LLM/agent communication is handled by the base GameOrchestrator class
 */

type Role = 'murderer' | 'innocent';
type Phase = 'day_0' | 'night' | 'day_discussion' | 'day_voting';

interface GameState {
  phase: Phase;
  dayNumber: number;
  roles: Map<string, Role>; // Secret role assignments
  alive: string[];
  dead: string[];
  nightsSinceKill: number; // For murderer constraint
}

interface NightAction {
  agentName: string;
  action: 'stay' | 'visit';
  target?: string; // If visiting, who
  intent?: boolean; // Murderer only: intent to kill
}

interface VoteAction {
  agentName: string;
  vote: string | 'abstain';
}

export class MurderMysteryOrchestrator extends GameOrchestrator {
  gameState: GameState;

  constructor() {
    super('You are the Game Master for a murder mystery game. You interpret player inputs and ensure game rules are followed.');
    this.gameState = {
      phase: 'day_0',
      dayNumber: 0,
      roles: new Map(),
      alive: [],
      dead: [],
      nightsSinceKill: 0
    };
  }

  /**
   * Initialize game with players
   */
  setupGame(playerNames: string[], humanPlayerName?: string) {
    // Register all agents
    playerNames.forEach(name => {
      const isHuman = name === humanPlayerName;
      this.registerAgent(
        name,
        isHuman ? 'human' : 'llm',
        '' // System prompt will be set after role assignment
      );
    });

    this.gameState.alive = [...playerNames];

    // Randomly assign roles
    this.assignRoles(playerNames);

    // Update agent system prompts based on roles
    this.updateAgentPrompts();
  }

  /**
   * GAME LOGIC: Randomly assign 1 murderer, rest innocents
   */
  private assignRoles(playerNames: string[]) {
    const shuffled = [...playerNames].sort(() => Math.random() - 0.5);
    const murdererIndex = Math.floor(Math.random() * shuffled.length);

    shuffled.forEach((name, i) => {
      this.gameState.roles.set(name, i === murdererIndex ? 'murderer' : 'innocent');
    });
  }

  /**
   * Update agent system prompts based on their roles
   */
  private updateAgentPrompts() {
    this.agents.forEach((agent, name) => {
      if (agent.type === 'llm') {
        const role = this.gameState.roles.get(name);
        const prompt = role === 'murderer'
          ? `You are ${name}, the MURDERER. Your goal is to eliminate all innocents without being caught. You can and should lie strategically. You must attempt to kill at least once every two nights. Use all information available to you.`
          : `You are ${name}, an INNOCENT. Your goal is to identify and vote out the murderer. Share factual information and look for contradictions in what others say. Use all information available to you.`;

        agent.instance!.systemPrompt = prompt;
      }
    });
  }

  /**
   * Get a player's secret role (for private messaging)
   */
  getRole(agentName: string): Role {
    return this.gameState.roles.get(agentName)!;
  }

  /**
   * GAME LOGIC: Night resolution
   *
   * Input: Array of night actions from all players
   * Output: Who died (if anyone) and what each player saw
   */
  resolveNight(actions: NightAction[]): {
    deaths: string[];
    observations: Map<string, string[]>; // agentName -> list of who they saw
    murdererBlocked: boolean;
  } {
    // Build location map
    const locations = new Map<string, string[]>();

    actions.forEach(({ agentName, action, target }) => {
      if (action === 'stay') {
        // Player stays at their own location
        if (!locations.has(agentName)) locations.set(agentName, []);
        locations.get(agentName)!.push(agentName);
      } else if (action === 'visit' && target) {
        // Player goes to target's location
        if (!locations.has(target)) locations.set(target, []);
        locations.get(target)!.push(agentName);
      }
    });

    // Determine kills
    const deaths: string[] = [];
    let murdererBlocked = false;

    const murdererAction = actions.find(a => this.getRole(a.agentName) === 'murderer');

    if (murdererAction && murdererAction.intent) {
      // Murderer has intent to kill
      const murdererLocation = murdererAction.action === 'stay'
        ? murdererAction.agentName
        : murdererAction.target!;

      const peopleAtLocation = locations.get(murdererLocation) || [];

      if (peopleAtLocation.length === 2) {
        // Exactly 2 people: murderer + victim
        const victim = peopleAtLocation.find(name => name !== murdererAction.agentName);
        if (victim) {
          deaths.push(victim);
          this.gameState.nightsSinceKill = 0;
        }
      } else if (peopleAtLocation.length >= 3) {
        // 3+ people: kill blocked
        murdererBlocked = true;
        this.gameState.nightsSinceKill++;
      } else {
        // Murderer alone
        this.gameState.nightsSinceKill++;
      }
    } else {
      // Murderer didn't attempt kill
      this.gameState.nightsSinceKill++;
    }

    // Build observations (who each player saw)
    const observations = new Map<string, string[]>();

    actions.forEach(({ agentName, action, target }) => {
      const location = action === 'stay' ? agentName : target!;
      const peopleAtLocation = locations.get(location) || [];

      // Player sees everyone at their location EXCEPT themselves
      observations.set(agentName, peopleAtLocation.filter(name => name !== agentName));
    });

    // Update game state
    deaths.forEach(name => {
      this.gameState.alive = this.gameState.alive.filter(n => n !== name);
      this.gameState.dead.push(name);
    });

    return { deaths, observations, murdererBlocked };
  }

  /**
   * GAME LOGIC: Vote resolution
   *
   * Input: Array of votes from all players
   * Output: Who was hanged (if anyone) and their role
   */
  resolveVoting(votes: VoteAction[]): {
    hanged: string | null;
    role: Role | null;
    voteCounts: Map<string, number>;
  } {
    const voteCounts = new Map<string, number>();
    let nonAbstaining = 0;

    votes.forEach(({ vote }) => {
      if (vote !== 'abstain') {
        nonAbstaining++;
        voteCounts.set(vote, (voteCounts.get(vote) || 0) + 1);
      }
    });

    // Find player with most votes
    let maxVotes = 0;
    let hanged: string | null = null;
    let isTie = false;

    voteCounts.forEach((count, name) => {
      if (count > maxVotes) {
        maxVotes = count;
        hanged = name;
        isTie = false;
      } else if (count === maxVotes) {
        isTie = true;
      }
    });

    // Check threshold: need >50% of non-abstaining votes, minimum 2
    const threshold = nonAbstaining > 0 ? Math.floor(nonAbstaining / 2) + 1 : 999;

    if (isTie || maxVotes < threshold || maxVotes < 2) {
      hanged = null;
    }

    let role: Role | null = null;
    if (hanged) {
      role = this.gameState.roles.get(hanged)!;
      this.gameState.alive = this.gameState.alive.filter(n => n !== hanged);
      this.gameState.dead.push(hanged);
    }

    return { hanged, role, voteCounts };
  }

  /**
   * GAME LOGIC: Check win conditions
   */
  checkWinCondition(): { winner: 'innocents' | 'murderer' | null; reason: string } {
    const aliveMurderer = this.gameState.alive.find(name => this.getRole(name) === 'murderer');

    // Murderer lost by failing to kill
    if (this.gameState.nightsSinceKill >= 2) {
      return { winner: 'innocents', reason: 'Murderer failed to attempt kill for 2 consecutive nights' };
    }

    // Murderer was hanged
    if (!aliveMurderer) {
      return { winner: 'innocents', reason: 'Murderer was hanged' };
    }

    // All innocents dead
    const aliveInnocents = this.gameState.alive.filter(name => this.getRole(name) === 'innocent');
    if (aliveInnocents.length === 0) {
      return { winner: 'murderer', reason: 'All innocents are dead' };
    }

    // 1v1 situation
    if (this.gameState.alive.length === 2) {
      return { winner: 'murderer', reason: '1v1 situation reached' };
    }

    return { winner: null, reason: '' };
  }

  /**
   * Use LLM to interpret a player's night action from raw input
   */
  async interpretNightAction(agentName: string, rawInput: string): Promise<NightAction> {
    const isMurderer = this.getRole(agentName) === 'murderer';
    const otherPlayers = this.gameState.alive.filter(n => n !== agentName);

    const prompt = isMurderer
      ? `The player can either "stay home" or "visit another player". If visiting, they must specify WHO. They must also specify if they have "intent to kill" (yes/no). Available players: ${otherPlayers.join(', ')}.`
      : `The player can either "stay home" or "visit another player". If visiting, they must specify WHO. Available players: ${otherPlayers.join(', ')}.`;

    const schema = {
      type: 'OBJECT',
      properties: {
        action: { type: 'STRING', enum: ['stay', 'visit'] },
        target: { type: 'STRING', description: 'Name of player to visit (null if staying)' },
        intent: { type: 'BOOLEAN', description: 'Murderer only: intent to kill' }
      },
      required: ['action']
    };

    const result = await this.interpretInput<NightAction>(rawInput, prompt, schema);

    return {
      agentName,
      action: result.interpreted.action,
      target: result.interpreted.target,
      intent: isMurderer ? result.interpreted.intent : false
    };
  }

  /**
   * Use LLM to interpret a player's vote from raw input
   */
  async interpretVote(agentName: string, rawInput: string): Promise<VoteAction> {
    const prompt = `The player is voting to hang someone, or abstaining. Available players: ${this.gameState.alive.filter(n => n !== agentName).join(', ')}, or "abstain".`;

    const schema = {
      type: 'OBJECT',
      properties: {
        vote: { type: 'STRING', description: 'Name of player to vote for, or "abstain"' }
      },
      required: ['vote']
    };

    const result = await this.interpretInput<{ vote: string }>(rawInput, prompt, schema);

    return {
      agentName,
      vote: result.interpreted.vote
    };
  }
}
