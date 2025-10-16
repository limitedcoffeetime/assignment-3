# Bug Fixes - Murder Mystery Game

## Bugs Identified and Fixed

### Bug #1: Duplicate Messages
**Problem**: Agent responses were showing up 4+ times in the UI.

**Root Cause**:
- Agent responses were being added to `messageBuffer` in `handleUserMessage` (line 161)
- Orchestrator was then broadcasting the same messages via `broadcast` or `sendMessageToPlayer`
- Each broadcast added the message again to the buffer
- Result: Same message appeared multiple times

**Fix**:
```typescript
// BEFORE:
const response = await agent.respondTo(question);
this.messageBuffer.push(`**${agentId}:** "${response}"\n`);  // ❌ Adding here
return { agentId, response };

// AFTER:
const response = await agent.respondTo(question);
// Don't add to message buffer here - orchestrator will broadcast it
return { agentId, response };  // ✅ Only return, don't add to buffer
```

### Bug #2: "You says:" Instead of "Player says:"
**Problem**: Messages showed as "You says: hey im david" instead of "Player says: hey im david"

**Root Cause**: `humanPlayerId` was set to `'You'` which created confusing message formatting.

**Fix**:
```typescript
// BEFORE:
private readonly humanPlayerId = 'You';  // ❌

// AFTER:
private readonly humanPlayerId = 'Player';  // ✅
```

### Bug #3: Messages to Agents Showing in Human's View
**Problem**: Every `sendMessageToPlayer` call to Alice/Bob/Charlie was appearing in the human player's message buffer.

**Root Cause**: `handleMessageToPlayer` was adding ALL messages to the buffer, regardless of recipient.

**Fix**:
```typescript
// BEFORE:
private async handleMessageToPlayer(playerId: string, message: string): Promise<void> {
  if (playerId === this.humanPlayerId) {
    this.messageBuffer.push(`\n${message}\n`);
  } else {
    // Still adding to buffer for agents! ❌
    this.messageBuffer.push(`\n**[Game Master → ${playerId}]:** ${message}\n`);
  }
}

// AFTER:
private async handleMessageToPlayer(playerId: string, message: string): Promise<void> {
  if (playerId === this.humanPlayerId) {
    this.messageBuffer.push(`\n${message}\n`);  // ✅ Only for human
  }
  // For LLM agents, DON'T add to buffer - handled by orchestrator context
}
```

### Bug #4: Orchestrator Skipping Phases
**Problem**: After introductions, orchestrator jumped straight to day discussion and killed Charlie without ever asking for night actions.

**Root Cause**:
- Orchestrator's system prompt wasn't explicit enough about stopping after each phase
- Orchestrator was making up actions and responses instead of waiting for them
- MAX_ITERATIONS allowed it to keep calling tools

**Fix**:
Updated system prompt with explicit rules:
```
**CRITICAL RULES:**
- After each phase, STOP immediately. Do NOT call more tools.
- Do NOT skip phases. You must receive input for each phase before moving to the next.
- Only broadcast messages ONCE per phase.
- Do NOT make up player actions or responses - wait for them to be given to you.
```

### Bug #5: No Prompts for User After Each Phase
**Problem**: After orchestrator processed a phase, user didn't know what to do next.

**Fix**: Added phase-aware prompts:
```typescript
if (currentPhase === 'NIGHT') {
  this.messageBuffer.push(`\n**Night ${nightNumber}**: What do you want to do? (e.g., "visit Alice" or "stay home")\n`);
} else if (currentPhase === 'DAY_DISCUSSION') {
  this.messageBuffer.push('\n**Day Discussion**: Make a statement...\n');
} else if (currentPhase === 'DAY_VOTING') {
  this.messageBuffer.push('\n**Voting Time**: Vote for who to hang...\n');
}
```

### Bug #6: User Message Added to Buffer Twice
**Problem**: User's message was being added in `handleUserMessage` before being sent to orchestrator, who would then broadcast it again.

**Fix**:
```typescript
// BEFORE:
this.messageBuffer.push(`\n**You:** "${userMessage}"\n`);  // ❌

// AFTER:
// Don't add user message here - orchestrator will handle it  // ✅
```

## Expected Flow Now

### 1. Start Game
```
User: "start game"
→ Orchestrator assigns roles
→ Tells each player their role
→ STOPS
→ Status: WAITING_FOR_USER
→ Prompt: "Please introduce yourself!"
```

### 2. Introductions
```
User: "hey im david"
→ System collects Alice, Bob, Charlie intros (parallel)
→ Batch sent to orchestrator: "Player says: ...\nAlice says: ...\n..."
→ Orchestrator broadcasts intros ONCE
→ STOPS
→ Status: WAITING_FOR_USER
→ Prompt: "Night 1: What do you want to do?"
```

### 3. Night Actions
```
User: "visit Alice"
→ System collects Alice, Bob, Charlie actions (parallel)
→ Batch sent to orchestrator
→ Orchestrator parses actions
→ Orchestrator calls resolveNightActions
→ Orchestrator sends facts to each player
→ STOPS
→ Status: WAITING_FOR_USER
→ Prompt: "Day Discussion: Make a statement..."
```

### 4. Day Discussion
```
User: "I visited Alice and saw Bob there"
→ System collects statements from agents
→ Batch sent to orchestrator
→ Orchestrator broadcasts statements ONCE
→ STOPS
→ Status: WAITING_FOR_USER
→ Prompt: "Voting Time: Vote for..."
```

### 5. Voting
```
User: "vote for Charlie"
→ System collects votes from agents
→ Batch sent to orchestrator
→ Orchestrator calls resolveVoting
→ Orchestrator broadcasts results with role reveal
→ If not game over: STOPS and back to Night
→ Status: WAITING_FOR_USER
```

## Key Principles Applied

1. **Single Source of Truth**: Only orchestrator adds messages via callbacks
2. **No Duplication**: Don't add messages in multiple places
3. **Context Isolation**: Agent messages don't pollute human's view
4. **Explicit Phases**: Orchestrator must stop after each phase
5. **Clear Prompts**: User always knows what to do next
6. **Batched Processing**: All responses collected before processing

## Testing Checklist

- [x] No duplicate messages
- [x] Proper player names ("Player" not "You")
- [x] Agent messages don't show in human view
- [x] Phases progress in order (Intro → Night → Day → Vote → repeat)
- [x] Clear prompts after each phase
- [x] No made-up actions by orchestrator
- [x] Each agent has isolated context
- [x] Game completes successfully

## Files Modified

1. `lib/murder-game/NewMurderGameChat.ts`
   - Fixed humanPlayerId
   - Removed duplicate message buffer additions
   - Fixed handleMessageToPlayer to only show human messages
   - Added phase-aware prompts

2. `lib/murder-game/OrchestratorLLM.ts`
   - Updated system prompt with explicit stopping rules
   - Clarified phase workflow
   - Emphasized "don't make up responses"

The game should now work correctly with proper discrete turn-based flow and no message duplication!
