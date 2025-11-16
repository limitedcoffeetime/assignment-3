## A3: Multi-Agent Murder Mystery Game

A multi-agent conversational system built with Next.js, React, TypeScript, and the Google Gemini API. Features an extensible event-based architecture for implementing social deduction games with isolated agent contexts.

### Game Modes

**Murder Mystery** (Primary Mode)
- 4-player social deduction game (Mafia vs Town)
- Isolated agent contexts - each agent maintains separate conversation history
- Event-based role system - easily extensible with new roles
- Phases: Night (actions) → Day (discussion + voting) → repeat
- Win conditions: Town hangs murderer OR murderer eliminates all town members

**Strategic Sharing** (Secondary Mode)
- Multi-step negotiation game with 4 agents
- Demonstrates alternative orchestration pattern

### Architecture

**Event System** ([lib/game/events.ts](lib/game/events.ts))
- Clean separation between role actions and game logic
- Event types: `MOVE`, `KILL_INTENT`, `INVESTIGATE`, `PROTECT`, `BLOCK`
- Roles emit events → Orchestrator resolves them deterministically

**Role System** ([lib/roles/](lib/roles/))
- Self-contained role definitions with system prompts
- Separates **alignment** (Town vs Mafia) from **role** (specific abilities)
- Each role specifies: prompts, action interpretation, event emission
- Implemented roles:
  - **Murderer** (Mafia) - Kills when alone with victim + intent
  - **Civilian** (Town) - Default town role, gathers information through movement
  - **Detective** (Town) - Investigates players to learn their roles (extensibility demo)

**Orchestrator** ([lib/orchestrators/MurderMysteryOrchestrator.ts](lib/orchestrators/MurderMysteryOrchestrator.ts))
- Manages game state machine and win conditions
- Controls information flow via `notifyAgent()` / `broadcastToAgents()`
- Event resolution is deterministic (NOT LLM-based)

**Isolated Agents** ([lib/agents/IsolatedAgent.ts](lib/agents/IsolatedAgent.ts))
- Each agent maintains separate `conversationHistory`
- Agents only see what orchestrator explicitly shows them
- Enables hidden information games

### Setup and Running

**Prerequisites:**
- Node.js 20.x
- Git
- Google AI Studio API key (see below)

**Quick Start:**
```bash
git clone <your-repo-url>
cd assignment-3
cp .env.example .env
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

**Environment Setup:**

1. Get Gemini API credits (use personal Google account, not @mit.edu)
2. Go to [Google AI Studio](https://aistudio.google.com/)
3. Create API key
4. Add to `.env`:
```bash
GEMINI_API_KEY=your_api_key_here
```

**Note:** The model is hardcoded to `gemini-2.5-flash` in [lib/gemini.ts](lib/gemini.ts:25)

Restart dev server after changing `.env`

### Testing Without UI

**Test Harness** ([test-game.ts](test-game.ts))
```bash
npx tsx test-game.ts
```

Features:
- ✅ Colored terminal output (red=murderer, green=innocent)
- ✅ Omniscient view of all secret roles
- ✅ Full game simulation (night/discussion/voting)
- ✅ Agent reasoning display (💭 symbol)
- ✅ Action interpretation display
- ✅ Game state tracking

**Detective Role Demo** ([test-detective.ts](test-detective.ts))
```bash
npx tsx test-detective.ts
```

Demonstrates how easily new roles can be added (~90 lines of code).

### Adding New Roles

**Step 1: Create Role File** (e.g., `lib/roles/Doctor.ts`)
```typescript
import { Role, RoleContext, toHomeName } from './Role';
import { GameEvent, createMoveEvent, createProtectEvent } from '../game/events';

export const DoctorRole: Role = {
  roleName: 'doctor',
  alignment: 'town',

  getSystemPrompt(context: RoleContext): string {
    return `You are ${context.agentName}, the DOCTOR. You can protect one player each night from death...`;
  },

  getNightPrompt(context: RoleContext): string {
    const others = context.alivePlayers.filter(p => p !== context.agentName);
    return `Who do you want to protect tonight? Choose: ${others.join(', ')}`;
  },

  async interpretNightAction(rawInput, context, interpretFn) {
    const result = await interpretFn<{ target: string }>(
      rawInput,
      `Choose a player to protect: ${context.alivePlayers.join(', ')}`,
      {
        type: 'OBJECT',
        properties: { target: { type: 'STRING', enum: context.alivePlayers } },
        required: ['target']
      }
    );

    return [
      createMoveEvent(context.agentName, toHomeName(context.agentName)), // Stay home
      createProtectEvent(context.agentName, result.target)
    ];
  }
};
```

**Step 2: Import in Orchestrator**
```typescript
// lib/orchestrators/MurderMysteryOrchestrator.ts
import { DoctorRole } from '../roles/Doctor';
```

**Step 3: Handle Events in Resolution** (if needed)
```typescript
// In resolveNight(), add:
const protectEvents = allEvents.filter(e => e.type === 'PROTECT') as ProtectEvent[];
const protectedPlayers = protectEvents.map(e => e.target);
// Prevent deaths of protected players...
```

That's it! No other changes needed.

### Project Structure

```
lib/
├── agents/
│   └── IsolatedAgent.ts        # Stateful agent with conversation history
├── orchestrators/
│   ├── GameOrchestrator.ts     # Base class with agent management
│   └── MurderMysteryOrchestrator.ts  # Game-specific logic
├── roles/
│   ├── Role.ts                 # Role interface
│   ├── Murderer.ts            # Murderer role (Mafia alignment)
│   ├── Civilian.ts            # Civilian role (Town alignment, default)
│   └── Detective.ts           # Detective role (Town alignment, extensibility demo)
├── game/
│   └── events.ts              # Event type definitions
└── gemini.ts                  # Gemini API wrapper

app/
├── api/
│   └── murder-mystery/route.ts  # Game API endpoint
└── page.tsx                    # Main UI with mode toggle

components/
├── MurderMysteryView.tsx      # Murder mystery UI
└── MultiAgentView.tsx         # Strategic sharing UI

test-game.ts                   # Testing harness (no UI needed)
test-detective.ts             # Detective role demo
```

### Key Design Principles

1. **Event-Driven:** Roles emit events, orchestrator resolves deterministically
2. **Isolated Contexts:** Each agent has separate conversation history
3. **Type-Safe:** Full TypeScript coverage
4. **Extensible:** Adding roles takes ~90 lines of code
5. **LLM for Intent, Code for Logic:** Use LLMs for selection/generation, deterministic code for game rules

### Development Commands

```bash
npm run dev      # Start dev server (http://localhost:3000)
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Lint with ESLint

npx tsx test-game.ts       # Run test harness
npx tsx test-detective.ts  # Test Detective role
```

### Deployment to Vercel

1. Create Vercel account and import GitHub repo
2. In Vercel Project Settings → Environment Variables:
   - Add `GEMINI_API_KEY`
3. Trigger deploy
4. Verify at your Vercel URL

**Security:**
- ✅ `.env` is in `.gitignore`
- ✅ Never commit API keys to Git
- ✅ Use Vercel Environment Variables for production

### Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS + Shadcn UI
- **AI:** Google Gemini API (gemini-2.5-flash)
- **Deployment:** Vercel

### Documentation

See [CLAUDE.md](CLAUDE.md) for detailed technical documentation including:
- Agent initialization patterns
- Orchestrator patterns
- Information flow architecture
- Gemini API usage patterns
- Quick reference comparison tables

### Game Rules

See [GAME_RULES.md](GAME_RULES.md) for complete Murder Mystery game rules.
