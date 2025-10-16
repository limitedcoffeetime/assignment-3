# Fixed Murder Mystery Game Architecture

## Problem Identified

The game had an infinite loop issue because the orchestrator LLM was trying to REQUEST and RECEIVE responses synchronously through tool calls, leading to endless conversations.

## Solution: Discrete Turn-Based Architecture

The game now works as a **discrete, turn-based system** where each phase is clearly separated:

```
[INIT] → Orchestrator acts → STOP
   ↓
[User + Agents respond] → Collected externally
   ↓
[PROCESS] → Orchestrator acts → STOP
   ↓
[User + Agents respond] → Collected externally
   ↓
... repeat until game over
```

## How It Works Now

### 1. **Orchestrator LLM (OrchestratorLLM.ts)**

- **Role**: God-level orchestrator with full game state
- **Knows**: All roles, all actions, all outcomes
- **Uses Tools To**:
  - `assignRoles`: Randomly assign murderer and innocents
  - `resolveNightActions`: Determine kills, blocks, and facts witnessed
  - `resolveVoting`: Count votes and check win conditions
  - `sendMessageToPlayer`: Add information to agent contexts
  - `broadcast`: Send info to all alive players

**Key Behavior**: After calling tools for a phase, it STOPS. It does NOT request input via tools - it just informs and waits.

### 2. **Individual LLM Agents (SimpleLLMAgent.ts)**

- **Role**: Individual players with isolated contexts
- **Each Agent Has**:
  - Separate conversation history
  - Their role (murderer or innocent)
  - Only information sent to them via `sendMessageToPlayer`
  - Natural language personality

**Key Feature**: Each agent is a completely separate LLM call with zero shared state.

### 3. **Game Instance Manager (NewMurderGameChat.ts)**

This is the coordinator that makes everything work:

**When User Responds**:
1. Receives user input
2. **Immediately collects responses from ALL LLM agents in parallel**
3. Batches all responses together
4. Sends batch to orchestrator as a single message
5. Orchestrator processes batch, calls tools, updates context
6. Orchestrator stops, waits for next round

**Flow Example**:
```typescript
// User types their intro
User: "Hi, I'm Player1, excited to play!"

// System immediately asks ALL agents
Alice.respondTo("Game Master: Introduce yourself")
  → "Hello, I'm Alice, analytical detective"
Bob.respondTo("Game Master: Introduce yourself")
  → "Hey! I'm Bob, happy to meet everyone"
Charlie.respondTo("Game Master: Introduce yourself")
  → "I'm Charlie. Watching carefully."

// System sends BATCH to orchestrator
Orchestrator.processPlayerResponse(`
  You says: "Hi, I'm Player1, excited to play!"

  Alice says: "Hello, I'm Alice, analytical detective"

  Bob says: "Hey! I'm Bob, happy to meet everyone"

  Charlie says: "I'm Charlie. Watching carefully."
`)

// Orchestrator processes, broadcasts intros to everyone, STOPS
```

## Context Isolation is Maintained

### Each Agent Only Knows:
- Their role (told privately via `sendMessageToPlayer`)
- Facts they witnessed (same location during night)
- Statements from others (may be lies)
- Role reveals from hangings only

### Orchestrator Uses `agentContexts` Map:
```typescript
agentContexts.set('Alice', [
  "You are the MURDERER",
  "Night 1: You saw Bob at your location",
  "Day 1: Bob said 'I visited Alice'"
])

agentContexts.set('Bob', [
  "You are INNOCENT",
  "Night 1: You saw Alice at your location",
  "Day 1: Alice said 'I stayed home alone'"
])
```

When asking agents questions, we pass their context:
```typescript
const context = orchestrator.getAgentContext('Alice');
const question = `Your context: ${context.join(' | ')}

Game Master: What's your night action?`;

const response = await alice.respondTo(question);
```

## Why This Works

✅ **No Infinite Loops**: Orchestrator calls tools then STOPS. Doesn't try to converse.

✅ **True Multi-Agent**: Each LLM agent is a separate Gemini call with isolated state.

✅ **Discrete Phases**: Clear turn boundaries prevent confusion.

✅ **Batched Input**: All responses collected before orchestrator processes.

✅ **Context Isolation**: Agents only know what they should know.

✅ **Scalable**: Easy to add more agents - just add to array.

## Game Flow Phases

### Phase 1: INIT
- Orchestrator calls `assignRoles`
- Orchestrator calls `sendMessageToPlayer` for each player with their role
- **STOPS**

### Phase 2: DAY_0_INTRO
- System collects intros from all 4 players
- Sends batch to orchestrator
- Orchestrator broadcasts intros to all
- **STOPS**

### Phase 3: NIGHT
- System collects night actions from all alive players
- Sends batch to orchestrator
- Orchestrator parses actions, calls `resolveNightActions`
- Orchestrator sends witnessed facts to each player via `sendMessageToPlayer`
- **STOPS**

### Phase 4: DAY_DISCUSSION
- System collects statements from all alive players
- Sends batch to orchestrator
- Orchestrator broadcasts statements
- **STOPS**

### Phase 5: DAY_VOTING
- System collects votes from all alive players
- Sends batch to orchestrator
- Orchestrator calls `resolveVoting`
- Orchestrator broadcasts results (with role reveal if hanged)
- If game over: END
- Else: **STOPS** and back to Phase 3

## Key Files

- `lib/murder-game/OrchestratorLLM.ts` - God orchestrator with function calling
- `lib/murder-game/SimpleLLMAgent.ts` - Individual LLM agents
- `lib/murder-game/NewMurderGameChat.ts` - Coordinator that batches responses
- `lib/murder-game/tools.ts` - Deterministic game logic functions
- `lib/murder-game/types.ts` - Type definitions

## Testing

Start the dev server and navigate to the Murder Game:
```bash
npm run dev
```

1. Click "Murder Game" button
2. Type "start game"
3. The orchestrator will assign roles and ask for intros
4. Type your intro
5. System collects all agent intros and processes
6. Game continues with discrete turn-based phases

## What Was Fixed

1. **System Prompt**: Made it crystal clear to STOP after acting, not request input
2. **Batched Collection**: `NewMurderGameChat` now collects ALL responses before sending to orchestrator
3. **Agent Integration**: SimpleLLMAgent properly responds with natural language based on context
4. **Context Tracking**: OrchestratorLLM maintains separate context for each agent
5. **Tool Usage**: Tools only for INFORMING and PROCESSING, not REQUESTING

The game now properly maintains the discrete turn-based flow you described!
