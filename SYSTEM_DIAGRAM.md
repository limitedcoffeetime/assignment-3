# System Architecture Diagram

## High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                          │
│                                                                 │
│  [Chat Input] + [PDF Upload Button]                           │
│                                                                 │
│  "Solve this problem set" + upload pset.pdf                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    API: /api/pset-solve                         │
│                                                                 │
│  FormData { message: string, pdf: File }                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              PROBLEM SET ORCHESTRATOR                           │
│                                                                 │
│  orchestrate(message, pdf)                                     │
│    ├─> RouterAgent.execute()                                  │
│    │     └─> Intent: solve | status | cancel                  │
│    │                                                           │
│    ├─> IF solve: runSolvePipeline(jobId)                     │
│    ├─> IF status: handleStatus()                             │
│    └─> IF cancel: handleCancel()                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼ (solve path)
┌─────────────────────────────────────────────────────────────────┐
│                      SOLVE PIPELINE                             │
│                                                                 │
│  Stage 1: PDF VALIDATION                                       │
│    └─> Check PDF exists and is readable                       │
│                                                                 │
│  Stage 2: TRANSCRIPTION                                        │
│    └─> PDFTranscriptionAgent.execute(pdf)                     │
│         └─> GPT-5 Vision API                                  │
│              └─> Returns: rawLatex                            │
│                                                                 │
│  Stage 3: CHUNKING                                             │
│    └─> ProblemChunkingAgent.execute(rawLatex)                │
│         └─> Claude Sonnet API                                 │
│              └─> Returns: problems[] (hierarchical)           │
│                                                                 │
│  Stage 4: DEPENDENCY GRAPH                                     │
│    └─> DependencyGraphAgent.execute(problems)                │
│         └─> Gemini Flash API                                  │
│              └─> Returns: graph with topological levels      │
│                                                                 │
│  Stage 5: PARALLEL SOLVING                                     │
│    └─> For each level in graph:                              │
│         └─> For each problem in level (PARALLEL):            │
│              └─> ProblemSolverAgent.solveWithCompilationLoop()│
│                   ├─> Gemini 2.5 Pro Thinking API            │
│                   ├─> LaTeX Compiler (test solution)         │
│                   ├─> IF errors: retry with feedback         │
│                   └─> Returns: solution LaTeX                 │
│                                                                 │
│  Stage 6: SYNTHESIS                                            │
│    └─> SynthesizerAgent.execute(problems, solutions)         │
│         └─> Deterministic template merging                    │
│              └─> Returns: complete LaTeX document             │
│                                                                 │
│  Stage 7: FINAL COMPILATION                                    │
│    └─> compileLatex(document)                                │
│         └─> pdflatex (local system)                          │
│              └─> Returns: final PDF                           │
└─────────────────────────────────────────────────────────────────┘
```

## Component Interaction Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                         SCHEDULER                                │
│  (Central State Management)                                      │
│                                                                  │
│  Jobs: Map<jobId, Job>                                          │
│    ├─> Job State Machine                                       │
│    │    queued → processing → completed/failed/cancelled       │
│    │                                                            │
│    ├─> Pipeline Stages                                         │
│    │    pdf_validation → transcription → chunking →            │
│    │    graph_building → solving → synthesis →                 │
│    │    final_compilation                                      │
│    │                                                            │
│    └─> Solver Jobs: Map<problemId, SolverJob>                 │
│         waiting → solving → compiling → completed/failed       │
│                                                                  │
│  Event System:                                                  │
│    - job_created, job_updated, stage_changed                   │
│    - solver_started, solver_completed, solver_failed           │
└────────┬─────────────────────────────────────────────┬──────────┘
         │                                             │
         │ Update State                      Query State
         │                                             │
         ▼                                             ▼
┌─────────────────────┐                    ┌─────────────────────┐
│   ORCHESTRATOR      │                    │   API ROUTES        │
│                     │                    │                     │
│  - Create jobs      │                    │  /api/pset-status  │
│  - Run pipeline     │                    │    └─> Get status  │
│  - Coordinate       │                    │                     │
│    agents           │                    │  /api/pset-cancel  │
│  - Handle errors    │                    │    └─> Cancel job  │
└─────────────────────┘                    └─────────────────────┘
         │
         │ Delegates to
         ▼
┌──────────────────────────────────────────────────────────────────┐
│                          AGENTS                                  │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │  RouterAgent     │  │  Transcription   │  │  Chunking     │ │
│  │  (Gemini Flash)  │  │  (GPT-5 Vision)  │  │  (Claude)     │ │
│  └──────────────────┘  └──────────────────┘  └───────────────┘ │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │  Dependency      │  │  Problem Solver  │  │  Synthesizer  │ │
│  │  (Gemini Flash)  │  │  (Gemini Pro)    │  │  (Template)   │ │
│  └──────────────────┘  └──────────────────┘  └───────────────┘ │
└────────────┬─────────────────────────────────────────┬──────────┘
             │                                         │
             │ Use                                Use  │
             ▼                                         ▼
┌──────────────────────┐                    ┌─────────────────────┐
│   LLM PROVIDERS      │                    │  LATEX SYSTEM       │
│                      │                    │                     │
│  - GeminiProvider    │                    │  - preamble.ts      │
│  - GPTProvider       │                    │    (fixed env)      │
│  - ClaudeProvider    │                    │                     │
│                      │                    │  - compiler.ts      │
│  Interface:          │                    │    (pdflatex)       │
│    generateText()    │                    │                     │
│    generateStruct()  │                    │  - validator        │
└──────────────────────┘                    │    (error parsing)  │
                                            └─────────────────────┘
```

## Dependency Graph Example

```
Problem Set:
  Problem 1: Prove sum formula
    (a) Induction proof
    (b) Combinatorial proof
  Problem 2: Use result from Problem 1     [DEPENDS ON: 1]
  Problem 3: Functional equation
    (a) Show f(0) = 0
    (b) Show f is linear                   [DEPENDS ON: 3.a]
    (c)
      (i) Compute f(2x)
      (ii) Compute f(nx)                   [DEPENDS ON: 3.c.i]

Dependency Graph (Topological Levels):

Level 0 (parallel):
  - Problem 1
  - Problem 1.a
  - Problem 1.b
  - Problem 3
  - Problem 3.a
  - Problem 3.c
  - Problem 3.c.i

Level 1 (after Level 0):
  - Problem 2        [needs: 1]
  - Problem 3.b      [needs: 3.a]
  - Problem 3.c.ii   [needs: 3.c.i]

Execution:
  1. Solve all Level 0 problems in parallel (7 parallel solvers)
  2. Wait for completion
  3. Solve all Level 1 problems in parallel (3 parallel solvers)
  4. Done!
```

## Compilation Loop Detail

```
┌─────────────────────────────────────────────────────────────────┐
│              PROBLEM SOLVER COMPILATION LOOP                    │
│                                                                 │
│  Input: Problem, Dependencies Context, Preamble                │
│                                                                 │
│  Attempt 1:                                                    │
│    ├─> Generate solution (Gemini 2.5 Pro Thinking)           │
│    ├─> Test compile (preamble + solution + end)              │
│    └─> ✓ Success! → Return solution                          │
│        ✗ Errors → Continue to Attempt 2                       │
│                                                                 │
│  Attempt 2:                                                    │
│    ├─> Generate solution with error feedback                 │
│    │    "Your previous solution had these errors: ..."       │
│    ├─> Test compile                                          │
│    └─> ✓ Success! → Return solution                          │
│        ✗ Errors → Continue to Attempt 3                       │
│                                                                 │
│  Attempt 3-5:                                                  │
│    └─> Same pattern...                                        │
│                                                                 │
│  After 5 attempts:                                             │
│    └─> Give up, mark as failed, continue with other problems │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow Through Scheduler

```
User uploads PDF
  │
  ├─> Orchestrator creates job
  │     └─> Scheduler.createJob(pdf, message)
  │           └─> Returns jobId
  │
  ├─> Pipeline starts (async)
  │     │
  │     ├─> Scheduler.updateJobStage('transcription')
  │     ├─> ... transcribe ...
  │     ├─> Scheduler.updateJobData({ rawLatex })
  │     │
  │     ├─> Scheduler.updateJobStage('chunking')
  │     ├─> ... chunk ...
  │     ├─> Scheduler.updateJobData({ problems })
  │     │
  │     ├─> Scheduler.updateJobStage('graph_building')
  │     ├─> ... build graph ...
  │     ├─> Scheduler.updateJobData({ dependencyGraph })
  │     ├─> Scheduler.initializeSolverJobs(graph)
  │     │
  │     ├─> Scheduler.updateJobStage('solving')
  │     ├─> For each problem:
  │     │     ├─> Scheduler.updateSolverStatus(id, 'solving')
  │     │     ├─> ... solve ...
  │     │     └─> Scheduler.updateSolverStatus(id, 'completed', { solution })
  │     │
  │     ├─> Scheduler.updateJobStage('synthesis')
  │     ├─> solutions = Scheduler.getCompletedSolutions()
  │     ├─> ... synthesize ...
  │     ├─> Scheduler.updateJobData({ finalDocument })
  │     │
  │     ├─> Scheduler.updateJobStage('final_compilation')
  │     ├─> ... compile ...
  │     ├─> Scheduler.updateJobData({ finalPdf })
  │     │
  │     └─> Scheduler.updateJobStatus('completed')
  │
  └─> User polls for status
        └─> /api/pset-status?jobId=xxx
              └─> Scheduler.getJobStatus(jobId)
                    └─> Returns current stage, progress, etc.
```

## Status Query Response Example

```json
{
  "success": true,
  "job": {
    "jobId": "abc123",
    "status": "processing",
    "stage": "solving",
    "progress": "Solving problems: 5/10 completed, 0 failed, 3 in progress, 2 waiting",
    "createdAt": "2025-10-14T20:00:00Z",
    "updatedAt": "2025-10-14T20:05:00Z",
    "solverProgress": {
      "total": 10,
      "completed": 5,
      "failed": 0,
      "inProgress": 3,
      "waiting": 2
    },
    "graphSummary": {
      "totalProblems": 10,
      "levels": 2,
      "parallelizable": 7
    }
  }
}
```

## Key Design Benefits

1. **Centralized State**: All job state lives in Scheduler
2. **Event-Driven**: Agents notify Scheduler of progress
3. **Non-Blocking**: Status queries don't interfere with solving
4. **Parallel Execution**: Dependency graph enables maximum parallelism
5. **Fault Isolation**: Individual problem failures don't crash pipeline
6. **Observable**: Real-time status at every stage
7. **Extensible**: Easy to add new agents or modify pipeline
