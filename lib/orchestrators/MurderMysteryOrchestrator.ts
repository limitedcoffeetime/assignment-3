import { GameOrchestrator, AgentResponse } from './GameOrchestrator';

/**
 * MurderMysteryOrchestrator - Game-specific orchestrator for murder mystery game
 *
 * All the game LOGIC lives here (role assignment, night resolution, voting, win conditions)
 * All the LLM/agent communication is handled by the base GameOrchestrator class
 */

type Role = 'murderer' | 'innocent';
type Phase = 'night' | 'day_discussion' | 'day_voting';

interface GameState {
  phase: Phase;
  dayNumber: number;
  roles: Map<string, Role>; // Secret role assignments
  alive: string[];
  dead: string[];
  murdererHadIntentLastNight: boolean; // Track if murderer requested intent last night
}

interface NightAction {
  agentName: string;
  action: 'stay' | 'visit';
  targetHome: string; // Always a home location (e.g., "alice_home")
  intent?: boolean; // Murderer only: intent to kill
}

// Helper function to convert player name to home location
function toHomeName(playerName: string): string {
  return `${playerName.toLowerCase()}_home`;
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
      phase: 'night',
      dayNumber: 1, // Start at day 1 (night_1 will be first night)
      roles: new Map(),
      alive: [],
      dead: [],
      murdererHadIntentLastNight: true // Start true so first night is optional
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
          ? `You are ${name}, the MURDERER. Your goal is to eliminate all innocents without being caught. You can and should lie strategically. You must have "intent to kill" at least once every two nights - if you don't have intent one night, you'll be forced to have it the next night. Use all information available to you.

GAME RULES YOU MUST KNOW:
- LOCATIONS: When you "visit" someone, you go to THEIR HOME (a location). They might not be there if they visited elsewhere. Locations are HOMES, not players.
- KILLING: You can only kill when EXACTLY 2 people are at a location (you + 1 victim) AND you have intent to kill. If > 2 people are present, you cannot kill.
- You can CHOOSE whether to have intent to kill each night (but must have it at least once every two nights).
- If you violate this, (i.e you attempt to indicate no intent two nights in a row), then your action will just be forcibly interpreted as having intent to kill.
- If you indicate a action that doesn't make sense, or doesn't specify a valid action, it will default to staying at your own home with intent to kill.
- There is only ONE murderer (you). All other players are innocents who cannot knowingly lie.

REASONING STYLE: When providing reasoning, be CONCISE. Focus only on your key decision factors.`
          : `You are ${name}, an INNOCENT. Your goal is to identify and vote out the murderer. Share factual information and look for contradictions in what others say. Use all information available to you.

GAME RULES YOU MUST KNOW:
- LOCATIONS: When you "visit" someone, you go to THEIR HOME (a location). They might not be there if they visited elsewhere. Locations are HOMES, not players.
- If you choose an action that doesn't make sense, it will default to staying at your own home.
- KILLING: The murderer can only kill when EXACTLY 2 people are at a location (murderer + victim). If > 2 people are present, the murderer does not even attempt to kill.
- The murderer can CHOOSE whether to kill each night. A night with no deaths does NOT mean there's no murderer.
- There is only ONE murderer. All other players (including you) are innocents who cannot knowingly lie.
- DO NOT theorize about multiple murderers or collusion - there is exactly one murderer acting alone.
- Innocents always tell the truth about what they saw. If statements conflict, someone is lying (the murderer) or locations explain the discrepancy.

REASONING STYLE: When providing reasoning, be CONCISE. Focus only on your key decision factors.`;

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
   * Check if murderer MUST have intent this night (because they didn't last night)
   */
  murdererMustHaveIntent(): boolean {
    return !this.gameState.murdererHadIntentLastNight;
  }

  /**
   * GAME LOGIC: Night resolution
   *
   * Input: Array of night actions from all players
   * Output: Who died (if anyone) and what each player saw
   */
  resolveNight(actions: NightAction[]): {
    deaths: string[];
    observations: Map<string, { home: string; otherPlayers: string[] }>; // agentName -> {home, who they saw}
    murdererBlocked: boolean;
  } {
    // Build location map: home_location -> [players at that home]
    const locations = new Map<string, string[]>();

    actions.forEach(({ agentName, targetHome }) => {
      // Every action now has a targetHome (either their own home or the home they're visiting)
      if (!locations.has(targetHome)) locations.set(targetHome, []);
      locations.get(targetHome)!.push(agentName);
    });

    // Determine kills
    const deaths: string[] = [];
    let murdererBlocked = false;

    const murdererAction = actions.find(a => this.getRole(a.agentName) === 'murderer');

    // Track if murderer had intent this night
    this.gameState.murdererHadIntentLastNight = murdererAction?.intent || false;

    if (murdererAction && murdererAction.intent) {
      // Murderer has intent to kill
      const murdererHome = murdererAction.targetHome;
      const peopleAtLocation = locations.get(murdererHome) || [];

      if (peopleAtLocation.length === 2) {
        // Exactly 2 people: murderer + victim
        const victim = peopleAtLocation.find(name => name !== murdererAction.agentName);
        if (victim) {
          deaths.push(victim);
        }
      } else if (peopleAtLocation.length >= 3) {
        // 3+ people: kill blocked
        murdererBlocked = true;
      }
    }

    // Build observations (home location + who each player saw)
    const observations = new Map<string, { home: string; otherPlayers: string[] }>();

    actions.forEach(({ agentName, targetHome }) => {
      const peopleAtLocation = locations.get(targetHome) || [];

      // Player sees everyone at their location EXCEPT themselves
      observations.set(agentName, {
        home: targetHome,
        otherPlayers: peopleAtLocation.filter(name => name !== agentName)
      });
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
    const mustHaveIntent = isMurderer && this.murdererMustHaveIntent();
    const otherPlayers = this.gameState.alive.filter(n => n !== agentName);
    const allPlayers = this.gameState.alive; // Include agent's own name for staying home

    const prompt = isMurderer
      ? mustHaveIntent
        ? `The player is ${agentName}. They MUST have "intent to kill" this night (they didn't have intent last night). They can either "stay at their home" (use "${agentName}") or "visit another player's HOME" (${otherPlayers.join(', ')}). If they say something that doesn't make sense or doesn't specify a valid action, default to staying at their own home with intent to kill (use "${agentName}").`
        : `The player is ${agentName}. They can either "stay at their home" (use "${agentName}") or "visit another player's HOME" (${otherPlayers.join(', ')}). They must also specify if they have "intent to kill" (yes/no).`
      : `The player is ${agentName}. They can either "stay at their home" (use "${agentName}") or "visit another player's HOME" (${otherPlayers.join(', ')}).`;

    const schema = {
      type: 'OBJECT',
      properties: {
        action: { type: 'STRING', enum: ['stay', 'visit'] },
        targetPlayer: { type: 'STRING', description: `Name of player whose home to visit. Use "${agentName}" if staying at own home, or another player's name (${allPlayers.join(', ')}) if visiting.`, enum: allPlayers },
        intent: { type: 'BOOLEAN', description: 'Murderer only: intent to kill' }
      },
      required: ['action', 'targetPlayer']
    };

    const result = await this.interpretInput<{ action: 'stay' | 'visit'; targetPlayer: string; intent?: boolean }>(rawInput, prompt, schema);

    // Convert player name to home location
    const targetHome = toHomeName(result.interpreted.targetPlayer);

    // Force intent if murderer must have it
    const finalIntent = isMurderer ? (mustHaveIntent ? true : (result.interpreted.intent || false)) : false;

    return {
      agentName,
      action: result.interpreted.action,
      targetHome,
      intent: finalIntent
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
