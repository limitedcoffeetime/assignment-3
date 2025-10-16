# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is Assignment 3 for 6.S061: a frame-sensitive multi-agent conversational system. The application demonstrates how different AI agents (with distinct personas/frames) can be orchestrated to respond appropriately based on conversational context. Built with Next.js 15 App Router, React 19, TypeScript, Tailwind CSS, and the Google Gemini API.

The system includes:
- **Example Mode**: Emotional agents (Joy, Sad, Angry) that respond based on user's emotional state
- **Murder Mystery Game Mode**: Multi-agent social deduction game with AI player agents and a Game Master orchestrator

## Commands

### Development
```bash
npm run dev          # Start dev server at http://localhost:3000
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Lint with Next.js ESLint
```

### Environment Setup
1. Copy `.env` template (if starting fresh, create one with `GEMINI_API_KEY` and `GEMINI_MODEL`)
2. Set `GEMINI_API_KEY=your_api_key_here` (from Google AI Studio)
3. Set `GEMINI_MODEL=gemini-2.5-flash`
4. Restart dev server after changing `.env`

**Important**: `.env` is gitignored. For Vercel deployment, set environment variables in Vercel Project Settings.

## Architecture

### Core Patterns

**Agent-Orchestrator Pattern**: The system uses a two-stage architecture:
1. **Orchestrator** (`lib/orchestrators/*`): Analyzes conversation context and selects which agent(s) should respond
2. **Agents** (`lib/agents/*`): Each agent has a distinct persona defined by system prompts that shape tone, style, and goals

### Key Abstractions

**Agents** ([lib/agents/Agent.ts](lib/agents/Agent.ts)):
- Base class: `ExampleAgent` with `respond(contents)` method
- Each agent uses `geminiGenerate()` with a persona-specific `systemPrompt`
- Examples: `JoyAgent`, `SadAgent`, `AngryAgent`
- System prompts follow SPEAKING framework (Setting, Participants, Ends, Act sequence, Key, Instrumentalities, Norms, Genre)

**Orchestrators** ([lib/orchestrators/Orchestrator.ts](lib/orchestrators/Orchestrator.ts)):
- Implements `orchestrate(contents)` method that:
  1. Uses Gemini with structured JSON output to select agent based on context
  2. Calls selected agent's `respond()` method
  3. Returns `{ assistantMessage, frameSet, agent, reasons }`
- `frameSet` captures frame analysis (persona, rationale)
- Example: `Orchestrator` class manages `joy`, `sad` agents

**Gemini Integration** ([lib/gemini.ts](lib/gemini.ts)):
- `geminiGenerate({ contents, systemPrompt, config })`: Core API wrapper
- `contents`: Array of Gemini message format `[{ role: 'user'|'model', parts: [{ text }] }]`
- `config`: Optional Gemini config (e.g., `responseMimeType`, `responseSchema` for JSON mode)
- Uses `GEMINI_API_KEY` and hardcoded `gemini-2.5-flash` model

### Frontend Architecture

**Next.js App Router Structure**:
- [app/page.tsx](app/page.tsx): Main UI with mode toggle (Example vs Murder Game)
- [app/api/chat/route.ts](app/api/chat/route.ts): POST endpoint for Example mode (uses `Orchestrator`)
- [app/api/murder-game/route.ts](app/api/murder-game/route.ts): POST endpoint for Murder Game mode
- [components/MultiAgentView.tsx](components/MultiAgentView.tsx): 5-column layout for Murder Game (Human, Alice, Bob, Charlie, Debug)

**Message Flow** (Example mode):
1. User types message → [page.tsx](app/page.tsx) sends POST to `/api/chat`
2. `/api/chat` converts messages to Gemini format, calls `orchestrator.orchestrate()`
3. Orchestrator picks agent → agent generates response
4. Response + metadata returned to frontend, displayed in chat

**Murder Game Flow**:
1. User message → POST to `/api/murder-game`
2. Route calls `getGameInstance().handleMessage(message)`
3. Game instance coordinates Game Master orchestrator and player agents
4. Response parsed by [MultiAgentView.tsx](components/MultiAgentView.tsx) into 5 columns
5. Note: `lib/murder-game` directory referenced in [route.ts](app/api/murder-game/route.ts) but deleted in git history (see git status)

### TypeScript Configuration

- Path alias: `@/*` maps to root directory
- Module resolution: `bundler` (Next.js default)
- Target: ES2017
- Strict mode enabled

## Implementation Guidelines

### Creating New Agents
1. Create class in `lib/agents/` extending pattern from [Agent.ts](lib/agents/Agent.ts)
2. Define `name` and `respond(contents)` method
3. Craft `systemPrompt` using SPEAKING framework (see [ExampleJoyAgent.ts](lib/agents/ExampleJoyAgent.ts))
4. Call `geminiGenerate({ contents, systemPrompt })`

### Creating New Orchestrators
1. Create class in `lib/orchestrators/` following [Orchestrator.ts](lib/orchestrators/Orchestrator.ts) pattern
2. Instantiate agents in constructor
3. Define `SELECTION_SCHEMA` for JSON structured output
4. Implement `orchestrate(contents)`:
   - Create orchestrator prompt describing agent selection logic
   - Use `geminiGenerate()` with `responseMimeType: 'application/json'` and `responseSchema`
   - Parse JSON response to get selected agent
   - Call agent's `respond()` method
   - Return `{ assistantMessage, frameSet, agent, reasons }`

### Gemini API Patterns

**Basic Usage**:
```typescript
const { text } = await geminiGenerate({
  contents,
  systemPrompt: "You are..."
});
```

**Structured JSON Output**:
```typescript
const schema = {
  type: 'OBJECT',
  properties: {
    agent: { type: 'STRING' },
    reasons: { type: 'STRING' }
  },
  required: ['agent']
};

const result = await geminiGenerate({
  contents,
  systemPrompt: "...",
  config: {
    responseMimeType: 'application/json',
    responseSchema: schema
  }
});
const parsed = JSON.parse(result.text);
```

**Message Format**:
```typescript
const contents = [
  { role: 'user', parts: [{ text: 'Hello' }] },
  { role: 'model', parts: [{ text: 'Hi there!' }] }
];
```

### UI Components

Uses Shadcn UI components ([components/ui/](components/ui/)):
- `Button`, `Input`, `Card` imported from `@/components/ui/*`
- Tailwind CSS for styling
- Components are client-side (`'use client'` directive)

## Project Context

**Course**: MIT 6.S061
**Assignment**: A3 - Multi-agent Interaction
**Goal**: Implement frame agents and orchestrators that adapt conversation based on context
**Deployment**: Vercel (environment variables set in project settings)

## Game Rules

The [GAME_RULES.md](GAME_RULES.md) file contains complete rules for a murder mystery social deduction game. Key mechanics:
- 4 players + 1 Game Master
- Roles: 1 Murderer, rest Innocents
- Phases: Day 0 (Intro) → Night (simultaneous actions) → Day (discussion + voting)
- Night actions: Stay home or visit another player
- Killing rules: 2 people at location + murderer with intent → kill; 3+ people → safe
- Win conditions: Innocents win if murderer hanged; murderer wins if all innocents dead or 1v1
