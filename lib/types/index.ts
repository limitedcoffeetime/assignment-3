/**
 * Shared TypeScript types for the LaTeX Problem Set Solver
 */

// ============================================================================
// Job & State Management Types
// ============================================================================

export type JobStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type PipelineStage =
  | 'pdf_validation'
  | 'transcription'
  | 'chunking'
  | 'graph_building'
  | 'solving'
  | 'synthesis'
  | 'final_compilation';

export type SolverStatus =
  | 'waiting'      // Waiting for dependencies
  | 'solving'      // LLM is generating solution
  | 'compiling'    // Testing LaTeX compilation
  | 'completed'    // Successfully compiled
  | 'failed';      // Failed after max attempts

export interface Job {
  id: string;
  status: JobStatus;
  stage: PipelineStage;

  // Input
  pdf?: Buffer;
  userMessage?: string;

  // Pipeline intermediate data
  rawLatex?: string;
  problems?: Problem[];
  dependencyGraph?: DependencyGraph;
  solverJobs?: Map<string, SolverJob>; // problemId -> SolverJob

  // Output
  finalDocument?: string;
  finalPdf?: Buffer;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  error?: string;
}

export interface SolverJob {
  id: string;
  problemId: string;
  status: SolverStatus;

  // Dependencies
  dependencies: string[]; // problemIds this depends on
  dependencyContext?: string; // Solutions from dependencies

  // Solving
  solution?: string; // LaTeX solution (without preamble)
  compilationAttempts: number;
  compilationErrors?: string[];

  // Metadata
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

// ============================================================================
// Problem Structure Types
// ============================================================================

export interface Problem {
  id: string;              // e.g., "1", "1.a", "1.a.i"
  parentId?: string;       // Parent problem ID
  number: string;          // Display number (e.g., "1(a)(i)")
  text: string;            // Problem statement in LaTeX
  level: number;           // 0 = top level, 1 = subproblem, 2 = sub-subproblem
  children: Problem[];     // Nested subproblems
  dependencies: string[];  // Explicit dependencies on other problem IDs
}

// ============================================================================
// Dependency Graph Types
// ============================================================================

export interface DependencyGraph {
  nodes: Map<string, Problem>;           // problemId -> Problem
  edges: Map<string, string[]>;          // problemId -> dependent problemIds (adjacency list)
  levels: string[][];                     // Topologically sorted levels for parallel execution

  // Helper methods would be added to a class implementation
}

export interface GraphNode {
  problemId: string;
  dependencies: string[];
  level: number; // Topological level
}

// ============================================================================
// LLM Provider Types
// ============================================================================

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  responseFormat?: 'text' | 'json';
  model?: string;
  [key: string]: any; // Allow provider-specific options
}

export interface LLMProvider {
  name: string;
  generateText(prompt: string, options?: LLMOptions): Promise<string>;
  generateStructured<T = any>(prompt: string, schema: any, options?: LLMOptions): Promise<T>;
}

export interface LLMResponse {
  text: string;
  raw?: any; // Original provider response
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

// ============================================================================
// Agent Types
// ============================================================================

export interface AgentInput {
  [key: string]: any;
}

export interface AgentOutput {
  [key: string]: any;
}

export interface Agent {
  name: string;
  execute(input: AgentInput): Promise<AgentOutput>;
}

// Router Agent
export type RouterIntent = 'solve' | 'status' | 'cancel' | 'unknown';

export interface RouterInput extends AgentInput {
  message: string;
  hasPDF: boolean;
}

export interface RouterOutput extends AgentOutput {
  intent: RouterIntent;
  confidence: number;
  reasoning: string;
}

// PDF Transcription Agent
export interface TranscriptionInput extends AgentInput {
  pdf: Buffer;
}

export interface TranscriptionOutput extends AgentOutput {
  latex: string;
  confidence?: number;
}

// Problem Chunking Agent
export interface ChunkingInput extends AgentInput {
  rawLatex: string;
}

export interface ChunkingOutput extends AgentOutput {
  problems: Problem[];
}

// Dependency Graph Agent
export interface DependencyGraphInput extends AgentInput {
  problems: Problem[];
}

export interface DependencyGraphOutput extends AgentOutput {
  graph: DependencyGraph;
}

// Problem Solver Agent
export interface SolverInput extends AgentInput {
  problem: Problem;
  dependencyContext?: string; // Solutions from problems this depends on
  latexPreamble: string; // The fixed preamble for compilation testing
  previousErrors?: string[]; // Errors from previous compilation attempts
}

export interface SolverOutput extends AgentOutput {
  solution: string; // LaTeX solution (content only, no preamble)
  reasoning?: string; // Chain of thought (if using thinking models)
}

// Synthesizer Agent
export interface SynthesizerInput extends AgentInput {
  problems: Problem[];
  solutions: Map<string, string>; // problemId -> solution LaTeX
  preamble: string;
}

export interface SynthesizerOutput extends AgentOutput {
  document: string; // Complete LaTeX document
}

// ============================================================================
// LaTeX Compilation Types
// ============================================================================

export interface CompilationResult {
  success: boolean;
  pdf?: Buffer;
  log?: string;
  errors?: string[];
}

export interface CompilationOptions {
  engine?: 'pdflatex' | 'xelatex' | 'lualatex';
  timeout?: number; // milliseconds
  workingDir?: string;
}

// ============================================================================
// API Types
// ============================================================================

export interface SolveRequest {
  pdf?: Buffer;
  message?: string;
}

export interface SolveResponse {
  jobId: string;
  status: JobStatus;
  message: string;
}

export interface StatusRequest {
  jobId?: string; // If not provided, return all jobs
}

export interface StatusResponse {
  jobs: JobStatusInfo[];
}

export interface JobStatusInfo {
  jobId: string;
  status: JobStatus;
  stage: PipelineStage;
  progress?: string; // Human-readable progress (e.g., "Solving 3/10 problems")
  createdAt: Date;
  updatedAt: Date;
  error?: string;

  // Detailed info if in solving stage
  solverProgress?: {
    total: number;
    completed: number;
    failed: number;
    inProgress: number;
    waiting: number;
  };

  // Dependency graph visualization (optional)
  graphSummary?: {
    totalProblems: number;
    levels: number;
    parallelizable: number;
  };
}

export interface CancelRequest {
  jobId: string;
}

export interface CancelResponse {
  jobId: string;
  status: JobStatus;
  message: string;
}

// ============================================================================
// Scheduler Types
// ============================================================================

export interface SchedulerConfig {
  maxConcurrentSolvers?: number; // Max parallel solvers per level
  solverTimeout?: number; // Timeout for each solver in ms
  maxCompilationAttempts?: number; // Max times to retry compilation
}

export type SchedulerEventType =
  | 'job_created'
  | 'job_updated'
  | 'stage_changed'
  | 'solver_started'
  | 'solver_completed'
  | 'solver_failed'
  | 'job_completed'
  | 'job_failed'
  | 'job_cancelled';

export interface SchedulerEvent {
  type: SchedulerEventType;
  jobId: string;
  timestamp: Date;
  data?: any;
}

export type SchedulerEventListener = (event: SchedulerEvent) => void;

// ============================================================================
// Utility Types
// ============================================================================

export interface ErrorContext {
  stage: PipelineStage;
  message: string;
  details?: any;
  retryable: boolean;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  timestamp: Date;
  jobId?: string;
  stage?: PipelineStage;
  message: string;
  data?: any;
}
