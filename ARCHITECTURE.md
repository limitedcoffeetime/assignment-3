# LaTeX Problem Set Solver - System Architecture

## Overview
A multi-agent system that takes PDF problem sets and produces LaTeX-compiled solutions using parallel processing with dependency-aware scheduling.

## High-Level Data Flow

```
User Input (Chat UI)
    ↓
Router Agent (determines intent)
    ↓
┌─────────────────┬─────────────────┬──────────────────┐
│   SOLVE PATH    │   STATUS PATH   │   CANCEL PATH    │
└─────────────────┴─────────────────┴──────────────────┘

### SOLVE PATH (Main Pipeline)
1. PDF Validation
2. VLM Transcription (GPT-5 vision) → Raw LaTeX
3. Problem Chunking (Claude) → Structured Problems
4. Dependency Graph Builder → Graph + Execution Plan
5. Scheduler → Parallel Job Execution
6. Problem Solvers (Gemini 2.5 Pro) → Individual Solutions
7. LaTeX Compilation Loop (per solution)
8. Synthesizer → Combined Document
9. Final Compilation → PDF Output

### STATUS PATH
1. Query Scheduler State
2. Format Status Response
3. Return to User

### CANCEL PATH
1. Query Scheduler for Active Jobs
2. Confirm Job to Cancel
3. Cancel Job
4. Return Confirmation
```

## Core Components

### 1. Scheduler & State Management
The **central nervous system** of the application.

**Responsibilities:**
- Track all jobs (pset solving processes)
- Maintain job state machine
- Track current pipeline stage for each job
- Store dependency graphs
- Manage parallel solver execution
- Handle cancellations
- Provide status queries

**State Structure:**
```typescript
Job {
  id: string
  status: JobStatus (queued, processing, completed, failed, cancelled)
  stage: PipelineStage (pdf_validation, transcription, chunking, graph_building, solving, synthesis, final_compilation)
  pdf?: Buffer
  rawLatex?: string
  problems?: Problem[]
  dependencyGraph?: DependencyGraph
  solverJobs?: SolverJob[]
  finalDocument?: string
  finalPdf?: Buffer
  createdAt: Date
  updatedAt: Date
  error?: string
}

SolverJob {
  id: string
  problemId: string
  status: SolverStatus (waiting, solving, compiling, completed, failed)
  dependencies: string[] // problemIds
  context?: string // from dependent problems
  solution?: string
  compilationAttempts: number
  error?: string
}
```

**Key Features:**
- In-memory state (can be upgraded to Redis/DB later)
- Event-based updates
- Thread-safe job mutations
- Efficient status queries without blocking execution

### 2. Agent Architecture

Each agent follows a consistent interface pattern:

```typescript
interface Agent {
  name: string
  execute(input: AgentInput): Promise<AgentOutput>
}
```

**Agents:**
1. **RouterAgent** (cheap model)
2. **PDFTranscriptionAgent** (GPT-5 VLM)
3. **ProblemChunkingAgent** (Claude)
4. **DependencyGraphAgent** (cheap model)
5. **ProblemSolverAgent** (Gemini 2.5 Pro with thinking)
6. **SynthesizerAgent** (deterministic template)

### 3. LaTeX Compilation System

**Fixed Environment Approach:**
- Single predetermined preamble with all imports
- Fixed document structure
- Solvers write ONLY problem solutions (no preamble/end document)
- Local LaTeX compiler (pdflatex, xelatex, or lualatex)
- Compilation via child process

**Preamble Template:**
```latex
\documentclass[11pt]{article}
\usepackage{amsmath, amssymb, amsthm}
\usepackage{geometry}
\usepackage{enumerate}
% ... all other packages
\geometry{margin=1in}

\newtheorem{theorem}{Theorem}
\newtheorem{lemma}{Lemma}
% ... helper commands

\begin{document}

% SOLUTIONS INSERTED HERE

\end{document}
```

**Compilation Loop:**
1. Extract solution from solver
2. Wrap in test document (preamble + solution + end)
3. Compile with pdflatex
4. If errors, extract error message
5. Pass back to solver with error context
6. Repeat until success (max 3-5 attempts)

### 4. Problem Structure

**Nested Problem Hierarchy:**
```typescript
Problem {
  id: string (e.g., "1", "1.a", "1.a.i")
  parentId?: string
  number: string (display number)
  text: string (LaTeX)
  level: number (0 = top, 1 = subproblem, 2 = sub-subproblem)
  children: Problem[]
  dependencies: string[] (explicit references to other problem IDs)
}
```

**Chunking Strategy:**
- Parse LaTeX for problem boundaries
- Detect enumerate/itemize environments
- Build hierarchical tree
- Assign unique IDs based on hierarchy

**Dependency Detection:**
- Look for explicit phrases:
  - "In the previous problem..."
  - "Using your answer from part (a)..."
  - "From problem X..."
- Mark as dependency in graph
- Do NOT infer mathematical relationships

### 5. Dependency Graph & Scheduling

**Graph Structure:**
```typescript
DependencyGraph {
  nodes: Map<problemId, Problem>
  edges: Map<problemId, problemId[]> // adjacency list
  levels: problemId[][] // topological layers
}
```

**Scheduling Algorithm:**
1. Topological sort of dependency graph
2. Group problems by dependency level
3. Execute each level in parallel
4. Wait for level completion before next level
5. Pass solutions from dependencies as context

**Parallelization:**
- Level 0 (no dependencies): All solve in parallel
- Level 1 (depends on Level 0): Wait, then all solve in parallel
- And so on...

### 6. LLM Interface Layer

**Generic Interface (model-agnostic):**
```typescript
interface LLMProvider {
  name: string
  generateText(prompt: string, options?: LLMOptions): Promise<string>
  generateStructured(prompt: string, schema: Schema): Promise<object>
}
```

**Implementations:**
- GPTProvider (placeholder for GPT-5 API)
- GeminiProvider (already have)
- ClaudeProvider (placeholder for Claude API)
- CheapModelProvider (for router/dependency agent)

**Note:** Actual API integration code will be added later. Focus is on interface design.

## Pipeline Execution Flow

### Phase 1: Routing
```
User uploads PDF + message
  → RouterAgent analyzes intent
  → Routes to: solve | status | cancel
```

### Phase 2: Solve Pipeline Initialization
```
PDF uploaded
  → Validate PDF exists and is readable
  → Create Job in Scheduler (status: queued, stage: pdf_validation)
  → Start pipeline
```

### Phase 3: Transcription
```
Job stage: transcription
  → Pass PDF to GPT-5 VLM
  → Prompt: "Transcribe this problem set to LaTeX"
  → Store rawLatex in Job
  → Update stage: chunking
```

### Phase 4: Chunking
```
Job stage: chunking
  → Pass rawLatex to Claude
  → Prompt: "Parse and chunk into structured problems"
  → Return structured Problem tree
  → Store problems[] in Job
  → Update stage: graph_building
```

### Phase 5: Dependency Graph
```
Job stage: graph_building
  → Pass problems to DependencyGraphAgent
  → Agent detects explicit dependencies
  → Builds graph with topological levels
  → Store dependencyGraph in Job
  → Update stage: solving
```

### Phase 6: Parallel Solving
```
Job stage: solving
  → Create SolverJob for each problem
  → For each topological level:
    → Spawn parallel solvers for all problems in level
    → Each solver:
      → Get problem text
      → Get dependency context (if any)
      → Call Gemini 2.5 Pro with thinking
      → Receive LaTeX solution
      → Enter compilation loop:
        → Compile solution in test environment
        → If errors, send errors back to model
        → Repeat until success or max attempts
      → Store solution in SolverJob
    → Wait for all in level to complete
    → Move to next level
  → All solvers complete
  → Update stage: synthesis
```

### Phase 7: Synthesis
```
Job stage: synthesis
  → Collect all solutions in problem order
  → Build final document:
    - Fixed preamble
    - For each problem in order:
      - Add section/subsection headers
      - Add solution LaTeX
    - End document
  → Store finalDocument in Job
  → Update stage: final_compilation
```

### Phase 8: Final Compilation
```
Job stage: final_compilation
  → Compile finalDocument to PDF
  → Store finalPdf in Job
  → Update status: completed
  → Return PDF to user
```

## Status Query Flow

```
User asks for status
  → RouterAgent identifies "status" intent
  → Query Scheduler for all jobs or specific job
  → Format response:
    - Job ID
    - Current stage
    - Progress (e.g., "Solving 3/10 problems")
    - If solving: show dependency graph + solver statuses
    - Estimated time remaining (optional)
  → Return formatted status
```

## Cancel Flow

```
User requests cancellation
  → RouterAgent identifies "cancel" intent
  → Query Scheduler for active jobs
  → If multiple jobs, ask user which to cancel
  → User confirms job ID
  → Scheduler:
    - Mark job status: cancelled
    - Cancel all in-progress solver jobs
    - Clean up resources
  → Return confirmation
```

## Error Handling

### Transcription Errors
- If VLM fails, retry up to 2 times
- If still fails, mark job as failed with error message

### Chunking Errors
- If chunking produces invalid structure, retry with clarification
- If still fails, mark job as failed

### Solver Errors
- Each solver gets max 3-5 compilation attempts
- If exceeds, mark SolverJob as failed
- Continue with other problems
- Final document will note failed problems

### Synthesis Errors
- Should be rare (all solutions already compiled)
- If final compilation fails, return solutions individually

## Technology Choices

### LLM APIs
- **Router & Dependency Graph:** Gemini Flash (cheap, fast)
- **PDF Transcription:** GPT-5 (best vision capabilities) - placeholder
- **Problem Chunking:** Claude (best at structured output) - placeholder
- **Problem Solving:** Gemini 2.5 Pro with thinking mode (mathematical reasoning)

### LaTeX Compilation
- Use `node-latex` npm package or direct `pdflatex` via child_process
- Compile in temp directory
- Capture stdout/stderr for error parsing

### File Upload
- Next.js API route with multipart/form-data
- Store PDF in memory (Buffer) or temp file
- Pass to pipeline

### State Storage
- In-memory Map for prototype
- Can upgrade to Redis/PostgreSQL for persistence

## Directory Structure

```
lib/
  agents/
    RouterAgent.ts
    PDFTranscriptionAgent.ts
    ProblemChunkingAgent.ts
    DependencyGraphAgent.ts
    ProblemSolverAgent.ts
    SynthesizerAgent.ts
  llm/
    LLMProvider.ts (interface)
    GeminiProvider.ts
    GPTProvider.ts (placeholder)
    ClaudeProvider.ts (placeholder)
  scheduler/
    Scheduler.ts
    Job.ts
    SolverJob.ts
    types.ts
  latex/
    compiler.ts
    preamble.ts
    validator.ts
  orchestrators/
    ProblemSetOrchestrator.ts
  types/
    index.ts (all shared types)
app/
  api/
    solve/route.ts (file upload + solve)
    status/route.ts (job status)
    cancel/route.ts (cancel job)
  page.tsx (updated with file upload)
```

## Next Steps

1. Define all TypeScript types
2. Implement Scheduler with state management
3. Scaffold all agents (with TODO comments for LLM calls)
4. Implement LaTeX compiler interface
5. Build ProblemSetOrchestrator to wire everything together
6. Update chat UI to handle file uploads
7. Test with mock data before connecting real LLM APIs

## Design Principles

- **Modularity:** Each agent is independent and testable
- **Model Agnostic:** LLM provider interface allows easy swapping
- **Fail Gracefully:** Errors at one stage don't crash entire pipeline
- **Observable:** Scheduler provides real-time status
- **Parallel Where Possible:** Dependency-aware parallelization
- **Simple First:** In-memory state, direct compilation, no over-engineering
