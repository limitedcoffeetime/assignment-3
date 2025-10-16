# Infinite Loop Bug - Root Cause Analysis

## The Problem

When you started the game, it burnt through 1M tokens in 2 minutes due to an infinite loop.

## Root Cause

In `NewMurderGameChat.handleMessageToPlayer()` (line 95):

```typescript
// LLM agent receives message from orchestrator
const response = await agent.respondTo(message);

// BUG: Immediately send response back to orchestrator
await this.orchestrator!.processPlayerResponse(playerId, response);
// This can trigger MORE sendMessageToPlayer calls, creating infinite recursion
```

**The Loop:**
1. Orchestrator sends message to Alice via `sendMessageToPlayer`
2. Alice's agent responds
3. Response is sent back to orchestrator via `processPlayerResponse`
4. Orchestrator's LLM decides to send another message to Alice
5. GOTO step 1 → INFINITE LOOP

## Why This Happened

The architecture tried to mix two incompatible patterns:

**Pattern 1 (Intended):** Orchestrator collects ALL player responses FIRST, then processes them together
**Pattern 2 (Accidentally Implemented):** Orchestrator sends message → agent responds → orchestrator processes → repeat

Pattern 2 creates a conversation loop with NO termination condition.

## The Fix

The orchestrator should NOT use `sendMessageToPlayer` to PROMPT agents for responses. Instead:

1. Orchestrator asks "what does everyone want to do?" in its internal reasoning
2. System PAUSES and waits for ALL player inputs (human + 3 LLM agents)
3. Once all 4 responses collected, orchestrator processes them together
4. Orchestrator uses `sendMessageToPlayer` ONLY to notify players of outcomes

**Correct Flow:**
```
[Game Start]
→ Orchestrator: "I need introductions from all players"
→ System prompts all 4 players in parallel
→ Collect all 4 responses
→ Send batch to orchestrator: "Alice said X, Bob said Y, Charlie said Z, You said W"
→ Orchestrator processes, calls tools, decides outcomes
→ Orchestrator uses sendMessageToPlayer to notify each player of what they learned
→ [Repeat for next phase]
```

## Implementation Strategy

Need to redesign `NewMurderGameChat` to have explicit phases:

1. **COLLECTING phase** - waiting for all player inputs
2. **PROCESSING phase** - orchestrator processes inputs with tools
3. **DISTRIBUTING phase** - orchestrator sends results to players

This prevents the orchestrator from triggering agent responses mid-processing.

##Alternative Simpler Fix

Make `sendMessageToPlayer` a PASSIVE tool that just records what to send, don't actually trigger agent responses inside the tool execution. Only trigger agent responses when the orchestrator explicitly requests input for a new phase.
