/**
 * Problem Set Orchestrator
 *
 * The main orchestrator that coordinates the entire pipeline from PDF to solved problem set.
 * This is the "conductor" that manages all agents and the scheduler.
 */

import { getScheduler, Scheduler } from '../scheduler/Scheduler';
import { RouterAgent } from '../pset-agents/RouterAgent';
import { PDFTranscriptionAgent } from '../pset-agents/PDFTranscriptionAgent';
import { ProblemChunkingAgent } from '../pset-agents/ProblemChunkingAgent';
import { DependencyGraphAgent } from '../pset-agents/DependencyGraphAgent';
import { ProblemSolverAgent } from '../pset-agents/ProblemSolverAgent';
import { SynthesizerAgent } from '../pset-agents/SynthesizerAgent';
import { compileLatex } from '../latex/compiler';
import { LATEX_PREAMBLE } from '../latex/preamble';
import { RouterIntent, Problem } from '../types';

export class ProblemSetOrchestrator {
  private scheduler: Scheduler;
  private routerAgent: RouterAgent;
  private transcriptionAgent: PDFTranscriptionAgent;
  private chunkingAgent: ProblemChunkingAgent;
  private dependencyAgent: DependencyGraphAgent;
  private solverAgent: ProblemSolverAgent;
  private synthesizerAgent: SynthesizerAgent;

  constructor() {
    this.scheduler = getScheduler({
      maxConcurrentSolvers: 10,
      solverTimeout: 5 * 60 * 1000, // 5 minutes per problem
      maxCompilationAttempts: 5,
    });

    // Initialize all agents
    this.routerAgent = new RouterAgent();
    this.transcriptionAgent = new PDFTranscriptionAgent();
    this.chunkingAgent = new ProblemChunkingAgent();
    this.dependencyAgent = new DependencyGraphAgent();
    this.solverAgent = new ProblemSolverAgent();
    this.synthesizerAgent = new SynthesizerAgent();
  }

  /**
   * Main orchestration method
   * Routes the request to the appropriate handler
   */
  async orchestrate(message: string, pdf?: Buffer): Promise<any> {
    // Route the request
    const routerResult = await this.routerAgent.execute({
      message,
      hasPDF: !!pdf,
    });

    console.log(`Router determined intent: ${routerResult.intent} (${routerResult.reasoning})`);

    switch (routerResult.intent) {
      case 'solve':
        return this.handleSolve(message, pdf);
      case 'status':
        return this.handleStatus(message);
      case 'cancel':
        return this.handleCancel(message);
      default:
        return {
          success: false,
          message: 'I could not understand your request. Please upload a PDF to solve, or ask for status/cancel.',
        };
    }
  }

  /**
   * Handle the solve pipeline
   */
  private async handleSolve(message: string, pdf?: Buffer): Promise<any> {
    if (!pdf) {
      return {
        success: false,
        message: 'Please upload a PDF file to solve.',
      };
    }

    // Create a job
    const jobId = this.scheduler.createJob(pdf, message);
    console.log(`Created job ${jobId}`);

    // Start the pipeline asynchronously
    this.runSolvePipeline(jobId).catch((error) => {
      console.error(`Pipeline error for job ${jobId}:`, error);
      this.scheduler.updateJobStatus(jobId, 'failed', error.message);
    });

    return {
      success: true,
      jobId,
      message: `Started solving your problem set. Job ID: ${jobId}. Use "status" to check progress.`,
    };
  }

  /**
   * Run the complete solve pipeline
   */
  private async runSolvePipeline(jobId: string): Promise<void> {
    const job = this.scheduler.getJob(jobId);
    if (!job || !job.pdf) {
      throw new Error('Job or PDF not found');
    }

    try {
      // Update status
      this.scheduler.updateJobStatus(jobId, 'processing');

      // Stage 1: Transcription
      console.log(`[${jobId}] Stage 1: Transcribing PDF...`);
      this.scheduler.updateJobStage(jobId, 'transcription');

      const { latex } = await this.transcriptionAgent.execute({ pdf: job.pdf });
      this.scheduler.updateJobData(jobId, { rawLatex: latex });

      // Stage 2: Chunking
      console.log(`[${jobId}] Stage 2: Chunking problems...`);
      this.scheduler.updateJobStage(jobId, 'chunking');

      const { problems } = await this.chunkingAgent.execute({ rawLatex: latex });
      this.scheduler.updateJobData(jobId, { problems });

      // Stage 3: Dependency Graph
      console.log(`[${jobId}] Stage 3: Building dependency graph...`);
      this.scheduler.updateJobStage(jobId, 'graph_building');

      const { graph } = await this.dependencyAgent.execute({ problems });
      this.scheduler.updateJobData(jobId, { dependencyGraph: graph });

      // Initialize solver jobs
      this.scheduler.initializeSolverJobs(jobId, graph);

      // Stage 4: Parallel Solving
      console.log(`[${jobId}] Stage 4: Solving problems...`);
      this.scheduler.updateJobStage(jobId, 'solving');

      await this.runParallelSolvers(jobId, graph);

      // Stage 5: Synthesis
      console.log(`[${jobId}] Stage 5: Synthesizing document...`);
      this.scheduler.updateJobStage(jobId, 'synthesis');

      const solutions = this.scheduler.getCompletedSolutions(jobId);
      const { document } = await this.synthesizerAgent.execute({
        problems,
        solutions,
        preamble: LATEX_PREAMBLE,
      });

      this.scheduler.updateJobData(jobId, { finalDocument: document });

      // Stage 6: Final Compilation
      console.log(`[${jobId}] Stage 6: Compiling final PDF...`);
      this.scheduler.updateJobStage(jobId, 'final_compilation');

      const compilationResult = await compileLatex(document);
      if (!compilationResult.success) {
        throw new Error(`Final compilation failed: ${compilationResult.errors?.join(', ')}`);
      }

      this.scheduler.updateJobData(jobId, { finalPdf: compilationResult.pdf });

      // Done!
      console.log(`[${jobId}] Pipeline completed successfully!`);
      this.scheduler.updateJobStatus(jobId, 'completed');
    } catch (error: any) {
      console.error(`[${jobId}] Pipeline failed:`, error);
      this.scheduler.updateJobStatus(jobId, 'failed', error.message);
      throw error;
    }
  }

  /**
   * Run solvers in parallel according to dependency graph
   */
  private async runParallelSolvers(jobId: string, graph: any): Promise<void> {
    const { levels } = graph;
    const config = this.scheduler.getConfig();

    // Process each level sequentially, but problems within a level in parallel
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      console.log(`[${jobId}] Solving level ${i} (${level.length} problems)...`);

      // Solve all problems in this level in parallel
      const promises = level.map((problemId: string) =>
        this.solveProblem(jobId, problemId)
      );

      await Promise.all(promises);

      console.log(`[${jobId}] Level ${i} complete`);
    }
  }

  /**
   * Solve a single problem with compilation loop
   */
  private async solveProblem(jobId: string, problemId: string): Promise<void> {
    const job = this.scheduler.getJob(jobId);
    if (!job || !job.dependencyGraph) {
      throw new Error('Job or dependency graph not found');
    }

    const problem = job.dependencyGraph.nodes.get(problemId);
    if (!problem) {
      throw new Error(`Problem ${problemId} not found`);
    }

    try {
      // Update status
      this.scheduler.updateSolverStatus(jobId, problemId, 'solving');

      // Get dependency context
      const dependencyContext = this.scheduler.getDependencyContext(jobId, problemId);

      // Solve with compilation loop
      const config = this.scheduler.getConfig();
      const { solution } = await this.solverAgent.solveWithCompilationLoop(
        {
          problem,
          dependencyContext,
          latexPreamble: LATEX_PREAMBLE,
        },
        config.maxCompilationAttempts
      );

      // Update with solution
      this.scheduler.updateSolverStatus(jobId, problemId, 'completed', {
        solution,
        completedAt: new Date(),
      });

      console.log(`[${jobId}] Solved problem ${problemId}`);
    } catch (error: any) {
      console.error(`[${jobId}] Failed to solve problem ${problemId}:`, error);
      this.scheduler.updateSolverStatus(jobId, problemId, 'failed', {
        error: error.message,
      });
      // Continue with other problems even if this one fails
    }
  }

  /**
   * Handle status query
   */
  private async handleStatus(message: string): Promise<any> {
    // TODO: Parse message to extract specific job ID if provided
    // For now, return all jobs

    const statuses = this.scheduler.getAllJobStatuses();

    if (statuses.length === 0) {
      return {
        success: true,
        message: 'No jobs found. Upload a PDF to start solving!',
      };
    }

    return {
      success: true,
      jobs: statuses,
    };
  }

  /**
   * Handle cancel request
   */
  private async handleCancel(message: string): Promise<any> {
    // TODO: Parse message to extract job ID
    // For now, ask user to specify

    const jobs = this.scheduler.getAllJobs().filter((j) => j.status === 'processing');

    if (jobs.length === 0) {
      return {
        success: false,
        message: 'No jobs in progress to cancel.',
      };
    }

    if (jobs.length === 1) {
      // Only one job, cancel it
      const jobId = jobs[0].id;
      this.scheduler.cancelJob(jobId);
      return {
        success: true,
        message: `Cancelled job ${jobId}.`,
      };
    }

    // Multiple jobs - ask user to specify
    return {
      success: false,
      message: `Multiple jobs in progress. Please specify which job to cancel: ${jobs.map((j) => j.id).join(', ')}`,
    };
  }

  /**
   * Get the scheduler instance (for external access if needed)
   */
  getScheduler(): Scheduler {
    return this.scheduler;
  }
}
