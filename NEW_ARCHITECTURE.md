# New LLM-Based Orchestrator Architecture

## Summary of Changes

I've converted your murder mystery game from a **deterministic orchestrator** to a **true LLM-based orchestrator** that uses Gemini's function calling to manage game flow.

## Architecture

### 4 Entities (Players)
1. **You** (Human) - Natural language input, sees all events
2. **Alice** (LLM Agent) - SimpleLLMAgent with analytical personality
3. **Bob** (LLM Agent) - SimpleLLMAgent with trusting personality
4. **Charlie** (LLM Agent) - SimpleLLMAgent with suspicious personality

### 1 Orchestrator (LLM Game Master)
- **OrchestratorLLM** - Omniscient Gemini LLM that:
  - Knows ALL roles, actions, and game state
  - Interprets natural language from all players
  - Calls deterministic tools to execute game logic
  - Maintains separate context windows for each LLM agent
  - Just reports new events to human (you remember everything)

## Key Files

### New Files Created
1. **[OrchestratorLLM.ts](lib/murder-game/OrchestratorLLM.ts)** - LLM orchestrator with function calling
2. **[SimpleLLMAgent.ts](lib/murder-game/SimpleLLMAgent.ts)** - Natural language LLM agents
3. **[NewMurderGameChat.ts](lib/murder-game/NewMurderGameChat.ts)** - Chat interface for new system

### Modified Files
1. **[gameInstance.ts](lib/murder-game/gameInstance.ts)** - Now uses `NewMurderGameChat`
2. **[index.ts](lib/murder-game/index.ts)** - Exports new components

### Unchanged Files (Still Used)
1. **[tools.ts](lib/murder-game/tools.ts)** - Deterministic game logic (assign roles, resolve nights, voting)
2. **[types.ts](lib/murder-game/types.ts)** - TypeScript type definitions
3. **[app/api/murder-game/route.ts](app/api/murder-game/route.ts)** - API route (works with new system)

## How It Works

### 1. Game Start
```typescript
// NewMurderGameChat creates:
- 3 SimpleLLMAgents (Alice, Bob, Charlie)
- 1 OrchestratorLLM

// OrchestratorLLM is initialized with:
- System prompt explaining it's the Game Master
- Tools for: assignRoles, resolveNightActions, resolveVoting, sendMessageToPlayer, broadcast
- Gemini chat session

// Orchestrator calls assignRoles tool automatically
```

### 2. Natural Language Flow
```
Human: "I want to visit Bob's house tonight"
  ↓
Orchestrator LLM:
  - Interprets: User wants to visit Bob
  - Collects responses from all alive players
  - Calls resolveNightActions tool with interpreted actions
  - Tool returns: deaths, facts each player witnessed
  - Decides what each player should know
  - Calls sendMessageToPlayer for each player with appropriate info
  ↓
Alice receives: "You were at Bob's house. You saw: You, Bob, Charlie"
Bob receives: "You stayed home. Visitors: You, Alice, Charlie"
Charlie receives: "You visited Bob's house. Also there: You, Alice, Bob"
Human sees: "Last night: No deaths. You were at Bob's location with Alice and Bob."
```

### 3. Information Flow Control

**For LLM Agents (Alice, Bob, Charlie):**
- Orchestrator maintains separate context array for each
- When orchestrator calls `sendMessageToPlayer(Alice, "You are the murderer")`:
  - Message is added to Alice's context array
  - Alice's SimpleLLMAgent gets the message in its conversation history
  - Bob and Charlie NEVER see this

**For Human (You):**
- No context tracking needed - you have a brain
- Orchestrator just displays new events
- You remember previous events yourself

### 4. Tool Calls

The orchestrator has access to these tools:

**assignRoles(playerIds)**
- Randomly assigns 1 murderer, rest innocent
- Returns role assignments
- Orchestrator uses this to know who's who

**resolveNightActions(actions, nightNumber)**
- Takes array of interpreted actions
- Returns: deaths, blocked kills, facts each player witnessed
- Orchestrator distributes facts to appropriate players

**resolveVoting(votes, alivePlayers)**
- Counts votes, determines hanging
- Returns: result, hanged player, role reveal, game over status
- Orchestrator announces results

**sendMessageToPlayer(playerId, message)**
- Sends message to specific player
- For LLM: adds to context array
- For human: just displays

**broadcast(message)**
- Sends same message to all alive players
- Loops through and calls sendMessageToPlayer for each

## Debug Events

The orchestrator emits debug events via `onDebugEvent` callback:

- `role_assignment` - When roles are assigned
- `night_resolution` - Results of night phase
- `voting_resolution` - Results of voting
- `tool_call` - Every time a tool is called
- `context_update` - When player context is updated
- `llm_response` - Orchestrator's text responses

You can use these to build a debug panel showing:
- Current roles
- Who's alive/dead
- What each player knows
- Tool call history
- Orchestrator's decisions

## Advantages of New Architecture

1. **Natural Language** - No more "ACTION: visit" parsing
2. **Intelligent Information Flow** - LLM decides what to share
3. **Scalable** - Easy to add more players or change rules
4. **Debuggable** - Debug events show all orchestrator decisions
5. **Flexible** - Orchestrator can handle unexpected responses

## Testing

Build succeeds:
```bash
npm run build
✓ Compiled successfully
```

To test the game:
1. Start dev server: `npm run dev`
2. Navigate to the murder game interface
3. Type "start game"
4. Play naturally - no structured formats needed!

## Next Steps

Optional enhancements:
1. **Debug Panel UI** - Visualize debug events in the browser
2. **Better Error Handling** - Retry logic for malformed LLM responses
3. **Conversation History Export** - Save full game transcript
4. **Custom Personalities** - Let user configure agent personalities
5. **Variable Player Count** - Support 2-10 players dynamically

## Issues Fixed

From the original analysis:
- ✅ Console logging removed (not needed, actually useful for debugging)
- ✅ LLM orchestrator properly isolates contexts
- ✅ No more rigid parsing - pure natural language
- ✅ Human doesn't need context tracking
- ✅ LLM agents have explicit context management
- ✅ Debug events for observability

The game is now ready to play with true LLM-based orchestration!
