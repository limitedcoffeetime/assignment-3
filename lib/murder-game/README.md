# Murder Mystery Multi-Agent Game

A murder mystery game implementation using multi-agent architecture with strict context isolation. The game features 3 LLM agents, 1 human player, and 1 orchestrator agent that manages game flow.

## Architecture Overview

### Key Design Principle: Context Isolation

The entire system is built around **keeping each agent's knowledge isolated**. The orchestrator is the ONLY agent with full game state and uses deterministic tool calls to handle game logic without leaking information.

### Components

1. **PlayerAgent** - LLM-powered agents that play the game
2. **UserAgent** - Human player interface
3. **GameMasterOrchestrator** - Non-playing orchestrator that manages game flow
4. **Deterministic Tools** - Pure functions for game logic (role assignment, night resolution, voting)

## Game Rules

### Roles
- **Murderer (1)**: Eliminates innocents without being caught
- **Innocent (3)**: Identify and hang the murderer before dying

### Game Flow

```
INIT → Day 0 (Intros) → Night 1 → Day 1 (Discussion + Voting) → Night 2 → ...
```

#### Day 0: Introductions
- All players introduce themselves (no game info yet)
- Introductions shared with all other players

#### Night Phase
- All alive players choose: stay home OR visit another player
- **Murderer only**: decide intent to kill (yes/no)
  - Must attempt kill at least every other night
  - If 3+ people at location: kill blocked
  - If 2 people and murderer has intent: victim dies
- All players at same location learn who else was there (Facts)

#### Day Phase: Discussion
- Dead players revealed (role NOT revealed for night deaths)
- Each alive player makes a statement
- Players can share facts, suspicions, or lies
- Statements distributed as "alleged info" (may be lies)

#### Day Phase: Voting
- Each player votes to hang someone or abstain
- **Threshold**: 50% + 1 of non-abstaining votes, minimum 2 votes
- If hanged: role IS revealed
- Check end conditions

### End Conditions

1. **Innocents Win**: Murderer is hanged
2. **Murderer Wins**:
   - All innocents dead
   - 1v1 situation (1 murderer vs 1 innocent)

### Information Types

- **Facts**: Things a player witnessed directly (100% true)
  - Who was at same location during night
  - Role reveals from hangings

- **Alleged Info**: Things other players said (may be lies)
  - Statements during day discussions
  - Other players' introductions

## Usage

### Basic Setup

```typescript
import {
  PlayerAgent,
  UserAgent,
  GameMasterOrchestrator
} from './murder-game';

// Create LLM agents
const agent1 = new PlayerAgent({
  playerId: 'Alice',
  personalityPrompt: 'You are analytical and logical.'
});

const agent2 = new PlayerAgent({
  playerId: 'Bob',
  personalityPrompt: 'You are friendly and trusting.'
});

const agent3 = new PlayerAgent({
  playerId: 'Charlie',
  personalityPrompt: 'You are suspicious and cautious.'
});

// Create user agent with input handler
const userAgent = new UserAgent('Player', inputHandler);

// Create orchestrator
const orchestrator = new GameMasterOrchestrator({
  llmAgents: [agent1, agent2, agent3],
  userAgent
});

// Start game
await orchestrator.startGame();
```

### Implementing User Input Handler

```typescript
class MyInputHandler implements UserInputHandler {
  async getIntroduction(): Promise<string> {
    // Get intro from user (web form, stdin, etc.)
    return userInput;
  }

  async getNightAction(
    nightNumber: number,
    alivePlayers: string[],
    role: Role,
    facts: Fact[],
    allegedInfo: AllegedInfo[],
    mustKill?: boolean
  ): Promise<NightAction> {
    // Show user their facts and alleged info
    // Get their night action choice
    return {
      playerId: 'user_id',
      action: 'stay_home' | 'visit',
      targetPlayerId: 'target_id', // if visiting
      intentToKill: true | false    // if murderer
    };
  }

  async getStatement(
    dayNumber: number,
    recentDeaths: string[],
    facts: Fact[],
    allegedInfo: AllegedInfo[],
    murdererKillBlocked?: boolean
  ): Promise<string> {
    // Show user context and get their statement
    return userStatement;
  }

  async getVote(
    dayNumber: number,
    alivePlayers: string[],
    facts: Fact[],
    allegedInfo: AllegedInfo[]
  ): Promise<string | 'abstain'> {
    // Get user's vote
    return targetPlayerId | 'abstain';
  }
}
```

## Scaling to More Players

The system is designed to scale easily:

```typescript
// Add more LLM agents
const agents = [];
for (let i = 0; i < 10; i++) {
  agents.push(new PlayerAgent({
    playerId: `Player${i}`,
    personalityPrompt: `Custom personality ${i}`
  }));
}

const orchestrator = new GameMasterOrchestrator({
  llmAgents: agents,
  userAgent
});
```

**Note**: With more players, you may want to adjust:
- Voting threshold (see `resolveVoting` in [tools.ts](tools.ts))
- Number of murderers (modify `assignRoles` in [tools.ts](tools.ts))

## File Structure

```
lib/murder-game/
├── types.ts                    # TypeScript type definitions
├── tools.ts                    # Deterministic game logic functions
├── PlayerAgent.ts              # LLM agent implementation
├── UserAgent.ts                # Human player interface
├── GameMasterOrchestrator.ts   # Main orchestrator
├── index.ts                    # Exports
├── example.ts                  # Example usage
└── README.md                   # This file
```

## Key Features

✅ **Context Isolation** - Each agent only knows what they should know
✅ **Deterministic Tools** - Game logic is predictable and fair
✅ **Scalable Design** - Easy to add more players
✅ **Clean Interfaces** - Well-defined contracts between components
✅ **Type Safety** - Full TypeScript support

## Future Enhancements

Possible extensions:
- Multiple murderers for larger games
- Special roles (detective, doctor, etc.)
- Time limits for decisions
- Spectator mode
- Game replay/analysis
- Web UI integration
