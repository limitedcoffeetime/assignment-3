# Murder Mystery Game - Flow Guide

## How to Play

### 1. Start the Game

**You type:** `start game`

**What happens:**
- Orchestrator assigns roles (1 murderer, 3 innocents)
- Each player (including you) is told their role privately
- You'll see messages like:
  - `[Game Master → Alice]: You are INNOCENT...`
  - `[Game Master → Bob]: You are the MURDERER...`
  - Your role message will appear without the `[Game Master → ...]` prefix
- Status changes to `WAITING_FOR_USER`
- You'll see: **"Please introduce yourself to the other players!"**

### 2. Day 0 - Introductions

**You type:** `Hey everyone, I'm David, excited to play!`

**What happens:**
- System collects your intro
- System asks Alice, Bob, and Charlie for their intros (in parallel)
- All 4 intros are batched and sent to orchestrator
- Orchestrator broadcasts all intros to everyone
- You'll see:
  ```
  **You:** "Hey everyone, I'm David, excited to play!"
  **Alice:** "Hello, I'm Alice, analytical detective type"
  **Bob:** "Hey! I'm Bob, friendly guy"
  **Charlie:** "I'm Charlie. Watching carefully."

  Introductions:
  **Alice:** "Hello, I'm Alice..."
  **Bob:** "Hey! I'm Bob..."
  **Charlie:** "I'm Charlie..."
  ```
- Game moves to Night 1

### 3. Night Phase

**You'll see:** Instructions about night actions

**You type:** `I'll visit Alice` or `I'll stay home`

**What happens:**
- System collects your action
- System asks Alice, Bob, Charlie for their actions (in parallel)
- All actions batched and sent to orchestrator
- Orchestrator parses natural language to extract:
  - Who stayed home vs visited
  - If murderer: intent to kill
- Orchestrator calls `resolveNightActions` tool
- Results determined:
  - Who died (if any)
  - Who saw whom (facts)
  - If kill was blocked
- You'll see what YOU witnessed:
  ```
  **What happened:**
  You saw Bob at your location.
  ```
- Other players get their own facts privately

### 4. Day Phase - Discussion

**You'll see:**
- Who died last night (if anyone)
- Prompt to make a statement

**You type:** `I visited Alice and saw Bob there. Where were you Charlie?`

**What happens:**
- System collects your statement
- System asks Alice, Bob, Charlie for statements
- All statements batched to orchestrator
- Orchestrator broadcasts all statements
- You'll see everyone's statements

### 5. Day Phase - Voting

**You'll see:** Prompt to vote

**You type:** `I vote for Charlie` or `I abstain`

**What happens:**
- System collects your vote
- System asks Alice, Bob, Charlie for votes
- All votes batched to orchestrator
- Orchestrator calls `resolveVoting` tool
- Results:
  - Vote tally shown
  - If someone hanged: their ROLE is revealed
  - Win condition checked
- If game continues: back to Night phase
- If game over: winner announced

## Expected Message Flow

### After "start game":
```
🎮 Murder Mystery Game Started!

Players: You, Alice, Bob, Charlie

You are INNOCENT. Your goal is to identify and hang the murderer...

[Game Master → Alice]: You are INNOCENT...
[Game Master → Bob]: You are the MURDERER...
[Game Master → Charlie]: You are INNOCENT...

Please introduce yourself to the other players!
```

### After your intro:
```
**You:** "Hey, I'm David!"
**Alice:** "Hello, I'm Alice"
**Bob:** "Hey! I'm Bob"
**Charlie:** "I'm Charlie"

[Orchestrator processes and broadcasts]

Night 1 begins...
```

### After night action:
```
**You:** "I'll visit Alice"
**Alice:** "I'll stay home"
**Bob:** "I'm visiting Charlie"
**Charlie:** "I'll stay home"

[Orchestrator resolves night]

**What happened:**
You saw Bob at Alice's location.

Day 1 begins. No one died last night.
Make a statement...
```

## Debug View

In the 5-column view:
- **Column 1 (You)**: Your messages and what you see
- **Column 2 (Alice)**: Alice's messages (what she says)
- **Column 3 (Bob)**: Bob's messages
- **Column 4 (Charlie)**: Charlie's messages
- **Column 5 (Debug)**: Orchestrator's tool calls and decisions

## Key Points

1. **Each agent is a separate LLM** - They don't share state
2. **Context isolation** - Agents only know what they witnessed or were told
3. **Natural language** - You can type naturally, the orchestrator interprets
4. **Batched processing** - All responses collected before orchestrator acts
5. **Discrete phases** - Clear turn boundaries, no infinite conversations

## Troubleshooting

**"Please wait, the game is processing..."**
- Status is not `WAITING_FOR_USER`
- This shouldn't happen after the fix
- Check debug view to see orchestrator state

**Agents not responding**
- Check console for errors
- Verify GEMINI_API_KEY is set
- Check if agents are marked as alive

**Orchestrator keeps calling tools**
- Check MAX_ITERATIONS in OrchestratorLLM.ts (set to 20)
- Orchestrator should STOP after completing phase actions

**Context not isolated**
- Each agent has separate `agentContexts` entry
- Check debug view to see what each agent knows
- Verify `sendMessageToPlayer` is adding to correct context

## Testing Locally

```bash
npm run dev
```

1. Navigate to http://localhost:3000
2. Click "Murder Game" button
3. Type "start game"
4. Follow the prompts!

The game should now work with proper discrete turn-based flow and complete context isolation between all 4 LLMs (3 agents + 1 orchestrator).
