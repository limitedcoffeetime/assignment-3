# Architecture Issues & The Path Forward

## What Happened

You burnt through 1M tokens in 2 minutes due to an infinite loop in the LLM orchestrator design.

## Root Cause

The architecture tried to have the **orchestrator LLM directly communicate with agent LLMs** in real-time, which created:

```
Orchestrator: "Alice, what's your night action?"
→ sendMessageToPlayer(Alice, "What's your night action?")
→ Alice responds: "I'll visit Bob"
→ processPlayerResponse(Alice, "I'll visit Bob")
→ Orchestrator: "Okay, and Bob, what about you?"
→ sendMessageToPlayer(Bob, "What's your night action?")
→ Bob responds...
→ INFINITE CONVERSATION LOOP
```

Each message triggers more messages with no clear termination.

## The Fundamental Design Flaw

**The orchestrator was given tools to send messages to players**, expecting it to use them wisely. But LLMs don't have good "stopping" behavior when given conversational tools - they keep the conversation going.

This is like giving an LLM a "send_email" tool and expecting it to only send ONE email. It might send dozens because it's optimizing for helpfulness.

## What We Should Have Done

### Option 1: Deterministic Orchestrator (Original Design - Actually Good!)

The ORIGINAL `GameMasterOrchestrator.ts` was actually the right approach:

```typescript
// Deterministic orchestrator collects structured responses
for (player in alivePlayers) {
  action = await agent.chooseNightAction(...)  // Structured response
}
resolveNightActions(actions)  // Deterministic tool
// Distribute results
```

**Pros:**
- No infinite loops
- Predictable token usage
- Clear phase boundaries
- Works!

**Cons:**
- Less "pure" multi-agent (orchestrator is code, not LLM)
- Agents need structured response formats

### Option 2: Phase-Based LLM Orchestrator (What We Should Do If We Want LLM Orchestrator)

Don't let the orchestrator directly trigger agent responses. Instead:

```typescript
// Phase 1: Orchestrator decides what to ask
orchestrator.think() → "I need night actions from everyone"

// Phase 2: System explicitly prompts all agents
for (agent in agents) {
  responses.push(await promptAgent(agent, context))
}

// Phase 3: Give batch of responses to orchestrator
orchestrator.process(responses) → calls tools, makes decisions

// Phase 4: Orchestrator decides what to tell each player
orchestrator.distribute() → uses sendMessageToPlayer

// Repeat with clear boundaries
```

**Pros:**
- True LLM orchestrator
- No infinite loops (phases are explicit)
- Natural language throughout

**Cons:**
- More complex implementation
- Higher token usage (but bounded)

### Option 3: Simplified Single-LLM (Easiest Fix)

Just have ONE LLM play all roles:

```typescript
// Single LLM with full game state
llm.process("Night 1. Roles: [Alice=murderer, Bob=innocent, ...]. What happens?")
→ LLM decides everyone's actions internally
→ Returns structured result
```

**Pros:**
- Simple
- No coordination issues
- Low token usage

**Cons:**
- Not multi-agent
- LLM has to role-play multiple characters (can work, but less interesting)

## Recommendation

**For your assignment:** Go back to the original deterministic orchestrator (`GameMasterOrchestrator.ts`). It's actually well-designed and avoids all these issues. The "orchestrator as LLM" was an over-complication.

**If you really want LLM orchestrator:** Implement Option 2 (Phase-Based) with explicit state machine:
- THINKING phase (orchestrator reasons)
- COLLECTING phase (system gets all responses)
- PROCESSING phase (orchestrator uses tools)
- DISTRIBUTING phase (orchestrator sends results)

## Quick Fix Applied

I've made `handleMessageToPlayer` passive (doesn't trigger responses) to stop the bleeding. But the system is now incomplete - agents won't respond to orchestrator messages.

To make it work, you'd need to implement proper phase boundaries.

## Token Usage Going Forward

With the deterministic orchestrator:
- ~100-500 tokens per player per turn
- 4 players × 10 turns = ~20K tokens per game

With LLM orchestrator (if done right):
- ~1K-2K tokens per orchestrator decision
- ~500 tokens per agent response
- Could be 50-100K tokens per game

The deterministic approach is more efficient.
