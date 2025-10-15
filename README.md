# LaTeX Problem Set Solver - Multi-Agent System

A sophisticated multi-agent system that automatically solves LaTeX problem sets using AI. Upload a PDF problem set and get back a fully solved, compiled PDF with detailed solutions.

## Overview

This system uses multiple specialized AI agents to:
1. **Transcribe** PDF problem sets to LaTeX (GPT-5 Vision)
2. **Parse** and chunk problems into hierarchical structure (Claude)
3. **Detect** dependencies between problems (Gemini)
4. **Solve** problems in parallel with dependency awareness (Gemini 2.5 Pro)
5. **Compile** solutions with automatic error fixing (LaTeX compilation loop)
6. **Synthesize** final document with all solutions

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed system design.

```
User uploads PDF
  ↓
Router Agent → Determines intent (solve/status/cancel)
  ↓
PDF Transcription → LaTeX
  ↓
Problem Chunking → Structured problems
  ↓
Dependency Graph → Topological levels
  ↓
Parallel Solving → Individual solutions (with compilation loops)
  ↓
Synthesis → Final PDF
```

## Key Features

- **Dependency-aware parallelization**: Solves independent problems simultaneously
- **Automatic LaTeX error fixing**: Compilation loop provides feedback to LLMs
- **Fixed LaTeX environment**: Consistent formatting across all solutions
- **Real-time status tracking**: Monitor progress through the pipeline
- **Serverless-ready**: Auto-detects environment for LaTeX compilation

## Project Structure

```
lib/
├── types/               # TypeScript type definitions
├── scheduler/           # Job state management and orchestration
├── latex/              # LaTeX compilation and environment
│   ├── compiler.ts     # Auto-detecting compiler (local/remote)
│   ├── compiler-remote.ts  # LaTeX.Online API integration
│   └── preamble.ts     # Fixed LaTeX environment
├── llm/                # LLM provider interfaces
│   ├── GeminiProvider.ts    # Implemented
│   ├── GPTProvider.ts       # TODO: Implement
│   └── ClaudeProvider.ts    # TODO: Implement
├── pset-agents/        # Specialized agents for pipeline stages
│   ├── RouterAgent.ts
│   ├── PDFTranscriptionAgent.ts
│   ├── ProblemChunkingAgent.ts
│   ├── DependencyGraphAgent.ts
│   ├── ProblemSolverAgent.ts
│   └── SynthesizerAgent.ts
└── orchestrators/      # Main pipeline coordinator
    └── ProblemSetOrchestrator.ts

app/
├── api/
│   ├── pset-solve/     # Main solving endpoint
│   ├── pset-status/    # Status queries
│   └── pset-cancel/    # Job cancellation
└── page.tsx            # Chat interface
```

## Setup

### Prerequisites

- Node.js 20.x
- Git
- API Keys:
  - Google Gemini API (required)
  - OpenAI API (for GPT-5 Vision - TODO)
  - Anthropic API (for Claude - TODO)

### Installation

```bash
# Clone repository
git clone <repo-url>
cd assignment-3

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env and add your API keys
```

### Environment Variables

```bash
# Required
GEMINI_API_KEY=your_gemini_key

# TODO: Add when implementing
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key

# Optional: Custom LaTeX service (for high traffic)
# LATEX_SERVICE_URL=https://your-latex-service.railway.app
```

### Development

```bash
# Start development server
npm run dev

# Open http://localhost:3000
```

## LaTeX Compilation

The system uses **LaTeX.Online** (https://latexonline.cc/) for PDF compilation:

- **Development**: Uses local `pdflatex` if available, else LaTeX.Online
- **Production (Vercel)**: Automatically uses LaTeX.Online API
- **Scaling**: Can switch to self-hosted service via `LATEX_SERVICE_URL`

See [DEPLOYMENT.md](DEPLOYMENT.md) for details.

## Implementation Status

### ✅ Complete

- Full type system and interfaces
- Scheduler with state management
- LaTeX compilation system (local + remote)
- Fixed LaTeX environment
- Router agent
- Dependency graph agent
- Problem solver agent (with compilation loop)
- Synthesizer agent
- Main orchestrator
- API routes

### ⚠️ TODO: LLM Integration

The following agents have scaffolding but need API implementation:

1. **GPTProvider** ([lib/llm/GPTProvider.ts](lib/llm/GPTProvider.ts))
   - Implement GPT-5 Vision API for PDF transcription
   - Note: Use new Responses API, not ChatCompletions

2. **ClaudeProvider** ([lib/llm/ClaudeProvider.ts](lib/llm/ClaudeProvider.ts))
   - Implement Claude Messages API for problem chunking

3. **GeminiProvider** ([lib/llm/GeminiProvider.ts](lib/llm/GeminiProvider.ts))
   - Add Gemini 2.5 Pro thinking mode support

See [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md) for detailed instructions.

## Deployment

### Deploy to Vercel

```bash
# Push to GitHub
git push origin main

# In Vercel dashboard:
# 1. Import GitHub repository
# 2. Add environment variables (API keys)
# 3. Deploy
```

LaTeX compilation will automatically work on Vercel using LaTeX.Online.

For advanced deployment options, see [DEPLOYMENT.md](DEPLOYMENT.md).

## Testing

### Test Local Setup
```bash
npm run dev
# Upload a PDF in the chat interface
```

### Test Remote LaTeX (Simulates Vercel)
```bash
VERCEL=1 npm run dev
```

## Key Design Decisions

1. **Fixed LaTeX Environment**: All solvers work within predetermined preamble to ensure consistency
2. **Dependency-Aware Scheduling**: Topological sort enables maximum parallelization
3. **Compilation Feedback Loop**: LLMs iteratively fix LaTeX syntax errors
4. **Model-Agnostic Architecture**: Easy to swap LLM providers
5. **Event-Based State Management**: Scheduler provides real-time observability

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - Complete system architecture
- [SYSTEM_DIAGRAM.md](SYSTEM_DIAGRAM.md) - Visual data flow diagrams
- [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md) - Step-by-step implementation guide
- [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment instructions

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Shadcn UI
- **AI Models**:
  - Gemini 2.5 Flash (routing, dependency detection)
  - Gemini 2.5 Pro Thinking (problem solving)
  - GPT-5 Vision (PDF transcription) - TODO
  - Claude Sonnet (problem chunking) - TODO
- **LaTeX**: LaTeX.Online API (auto-detecting local/remote)
- **Deployment**: Vercel

## License

MIT
