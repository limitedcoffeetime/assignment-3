/**
 * Scheduler: Central state management system for all problem-solving jobs
 *
 * This is the "brain" of the application - it tracks all jobs, manages their
 * state transitions, coordinates parallel solver execution, and provides
 * real-time status queries without blocking execution.
 */

import { nanoid } from 'nanoid';
import {
  Job,
  JobStatus,
  PipelineStage,
  SolverJob,
  SolverStatus,
  SchedulerConfig,
  SchedulerEvent,
  SchedulerEventType,
  SchedulerEventListener,
  JobStatusInfo,
  Problem,
  DependencyGraph,
} from '../types';

export class Scheduler {
  private jobs: Map<string, Job>;
  private config: SchedulerConfig;
  private eventListeners: Map<SchedulerEventType, SchedulerEventListener[]>;

  constructor(config: Partial<SchedulerConfig> = {}) {
    this.jobs = new Map();
    this.config = {
      maxConcurrentSolvers: config.maxConcurrentSolvers ?? 10,
      solverTimeout: config.solverTimeout ?? 5 * 60 * 1000, // 5 minutes
      maxCompilationAttempts: config.maxCompilationAttempts ?? 5,
    };
    this.eventListeners = new Map();
  }

  // ==========================================================================
  // Job Management
  // ==========================================================================

  /**
   * Create a new job for solving a problem set
   */
  createJob(pdf?: Buffer, userMessage?: string): string {
    const jobId = nanoid();
    const job: Job = {
      id: jobId,
      status: 'queued',
      stage: 'pdf_validation',
      pdf,
      userMessage,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.jobs.set(jobId, job);
    this.emitEvent('job_created', jobId, { job });

    return jobId;
  }

  /**
   * Get a job by ID
   */
  getJob(jobId: string): Job | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Get all jobs
   */
  getAllJobs(): Job[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Update job status
   */
  updateJobStatus(jobId: string, status: JobStatus, error?: string): void {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    job.status = status;
    job.updatedAt = new Date();
    if (error) job.error = error;

    this.emitEvent('job_updated', jobId, { status, error });

    if (status === 'completed') {
      this.emitEvent('job_completed', jobId);
    } else if (status === 'failed') {
      this.emitEvent('job_failed', jobId, { error });
    } else if (status === 'cancelled') {
      this.emitEvent('job_cancelled', jobId);
    }
  }

  /**
   * Update job pipeline stage
   */
  updateJobStage(jobId: string, stage: PipelineStage): void {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    job.stage = stage;
    job.updatedAt = new Date();

    this.emitEvent('stage_changed', jobId, { stage });
  }

  /**
   * Store intermediate data in job
   */
  updateJobData(
    jobId: string,
    data: Partial<Pick<Job, 'rawLatex' | 'problems' | 'dependencyGraph' | 'finalDocument' | 'finalPdf'>>
  ): void {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    Object.assign(job, data);
    job.updatedAt = new Date();

    this.emitEvent('job_updated', jobId, { data });
  }

  /**
   * Cancel a job and all its solver jobs
   */
  cancelJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    // Cancel all in-progress solver jobs
    if (job.solverJobs) {
      for (const solverJob of job.solverJobs.values()) {
        if (solverJob.status === 'solving' || solverJob.status === 'compiling') {
          solverJob.status = 'failed';
          solverJob.error = 'Job cancelled by user';
        }
      }
    }

    this.updateJobStatus(jobId, 'cancelled');
  }

  // ==========================================================================
  // Solver Job Management
  // ==========================================================================

  /**
   * Initialize solver jobs for all problems in the dependency graph
   */
  initializeSolverJobs(jobId: string, graph: DependencyGraph): void {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    const solverJobs = new Map<string, SolverJob>();

    for (const [problemId, problem] of graph.nodes) {
      const solverJob: SolverJob = {
        id: nanoid(),
        problemId,
        status: 'waiting',
        dependencies: problem.dependencies,
        compilationAttempts: 0,
      };
      solverJobs.set(problemId, solverJob);
    }

    job.solverJobs = solverJobs;
    this.emitEvent('job_updated', jobId, { solverJobsInitialized: true });
  }

  /**
   * Get a solver job
   */
  getSolverJob(jobId: string, problemId: string): SolverJob | undefined {
    const job = this.jobs.get(jobId);
    return job?.solverJobs?.get(problemId);
  }

  /**
   * Update solver job status
   */
  updateSolverStatus(
    jobId: string,
    problemId: string,
    status: SolverStatus,
    data?: Partial<SolverJob>
  ): void {
    const job = this.jobs.get(jobId);
    if (!job || !job.solverJobs) throw new Error(`Job or solver jobs not found`);

    const solverJob = job.solverJobs.get(problemId);
    if (!solverJob) throw new Error(`Solver job ${problemId} not found`);

    solverJob.status = status;
    if (data) Object.assign(solverJob, data);

    if (status === 'solving' && !solverJob.startedAt) {
      solverJob.startedAt = new Date();
      this.emitEvent('solver_started', jobId, { problemId });
    } else if (status === 'completed') {
      solverJob.completedAt = new Date();
      this.emitEvent('solver_completed', jobId, { problemId });
    } else if (status === 'failed') {
      this.emitEvent('solver_failed', jobId, { problemId, error: solverJob.error });
    }

    job.updatedAt = new Date();
  }

  /**
   * Get dependency context for a problem
   * Returns LaTeX solutions from all dependencies
   */
  getDependencyContext(jobId: string, problemId: string): string | undefined {
    const job = this.jobs.get(jobId);
    if (!job || !job.solverJobs || !job.dependencyGraph) return undefined;

    const problem = job.dependencyGraph.nodes.get(problemId);
    if (!problem || problem.dependencies.length === 0) return undefined;

    const contextParts: string[] = [];
    for (const depId of problem.dependencies) {
      const depSolverJob = job.solverJobs.get(depId);
      if (depSolverJob?.solution) {
        const depProblem = job.dependencyGraph.nodes.get(depId);
        contextParts.push(
          `\\textbf{From Problem ${depProblem?.number || depId}:}\n${depSolverJob.solution}\n`
        );
      }
    }

    return contextParts.length > 0 ? contextParts.join('\n') : undefined;
  }

  /**
   * Check if all dependencies for a problem are completed
   */
  areDependenciesReady(jobId: string, problemId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || !job.solverJobs || !job.dependencyGraph) return false;

    const problem = job.dependencyGraph.nodes.get(problemId);
    if (!problem) return false;

    // If no dependencies, it's ready
    if (problem.dependencies.length === 0) return true;

    // Check if all dependencies are completed
    return problem.dependencies.every((depId) => {
      const depSolver = job.solverJobs!.get(depId);
      return depSolver?.status === 'completed';
    });
  }

  /**
   * Get all problems ready to be solved (dependencies satisfied, not yet started)
   */
  getReadyProblems(jobId: string): string[] {
    const job = this.jobs.get(jobId);
    if (!job || !job.solverJobs || !job.dependencyGraph) return [];

    const ready: string[] = [];
    for (const [problemId, solverJob] of job.solverJobs) {
      if (solverJob.status === 'waiting' && this.areDependenciesReady(jobId, problemId)) {
        ready.push(problemId);
      }
    }

    return ready;
  }

  /**
   * Check if all solver jobs are completed (or failed)
   */
  areAllSolversDone(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || !job.solverJobs) return false;

    for (const solver of job.solverJobs.values()) {
      if (solver.status !== 'completed' && solver.status !== 'failed') {
        return false;
      }
    }

    return true;
  }

  /**
   * Get all completed solutions in problem order
   */
  getCompletedSolutions(jobId: string): Map<string, string> {
    const job = this.jobs.get(jobId);
    const solutions = new Map<string, string>();

    if (!job || !job.solverJobs) return solutions;

    for (const [problemId, solverJob] of job.solverJobs) {
      if (solverJob.status === 'completed' && solverJob.solution) {
        solutions.set(problemId, solverJob.solution);
      }
    }

    return solutions;
  }

  // ==========================================================================
  // Status Queries
  // ==========================================================================

  /**
   * Get detailed status information for a job
   */
  getJobStatus(jobId: string): JobStatusInfo | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;

    const info: JobStatusInfo = {
      jobId: job.id,
      status: job.status,
      stage: job.stage,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      error: job.error,
    };

    // Add progress string based on stage
    if (job.stage === 'solving' && job.solverJobs) {
      const total = job.solverJobs.size;
      const completed = Array.from(job.solverJobs.values()).filter(
        (s) => s.status === 'completed'
      ).length;
      const failed = Array.from(job.solverJobs.values()).filter(
        (s) => s.status === 'failed'
      ).length;
      const inProgress = Array.from(job.solverJobs.values()).filter(
        (s) => s.status === 'solving' || s.status === 'compiling'
      ).length;
      const waiting = Array.from(job.solverJobs.values()).filter(
        (s) => s.status === 'waiting'
      ).length;

      info.progress = `Solving problems: ${completed}/${total} completed, ${failed} failed, ${inProgress} in progress, ${waiting} waiting`;
      info.solverProgress = { total, completed, failed, inProgress, waiting };
    } else if (job.stage === 'transcription') {
      info.progress = 'Transcribing PDF to LaTeX...';
    } else if (job.stage === 'chunking') {
      info.progress = 'Chunking problems...';
    } else if (job.stage === 'graph_building') {
      info.progress = 'Building dependency graph...';
    } else if (job.stage === 'synthesis') {
      info.progress = 'Synthesizing final document...';
    } else if (job.stage === 'final_compilation') {
      info.progress = 'Compiling final PDF...';
    }

    // Add graph summary if available
    if (job.dependencyGraph) {
      const totalProblems = job.dependencyGraph.nodes.size;
      const levels = job.dependencyGraph.levels.length;
      const parallelizable = job.dependencyGraph.levels[0]?.length || 0;

      info.graphSummary = { totalProblems, levels, parallelizable };
    }

    return info;
  }

  /**
   * Get status for all jobs
   */
  getAllJobStatuses(): JobStatusInfo[] {
    const statuses: JobStatusInfo[] = [];
    for (const job of this.jobs.values()) {
      const status = this.getJobStatus(job.id);
      if (status) statuses.push(status);
    }
    return statuses;
  }

  // ==========================================================================
  // Event System
  // ==========================================================================

  /**
   * Register an event listener
   */
  on(eventType: SchedulerEventType, listener: SchedulerEventListener): void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, []);
    }
    this.eventListeners.get(eventType)!.push(listener);
  }

  /**
   * Unregister an event listener
   */
  off(eventType: SchedulerEventType, listener: SchedulerEventListener): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index !== -1) listeners.splice(index, 1);
    }
  }

  /**
   * Emit an event to all registered listeners
   */
  private emitEvent(type: SchedulerEventType, jobId: string, data?: any): void {
    const event: SchedulerEvent = {
      type,
      jobId,
      timestamp: new Date(),
      data,
    };

    const listeners = this.eventListeners.get(type);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (error) {
          console.error(`Error in event listener for ${type}:`, error);
        }
      }
    }
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Get scheduler configuration
   */
  getConfig(): SchedulerConfig {
    return { ...this.config };
  }

  /**
   * Clear all jobs (for testing)
   */
  clearAllJobs(): void {
    this.jobs.clear();
  }

  /**
   * Get statistics about the scheduler
   */
  getStats() {
    const totalJobs = this.jobs.size;
    const byStatus: Record<JobStatus, number> = {
      queued: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    for (const job of this.jobs.values()) {
      byStatus[job.status]++;
    }

    return { totalJobs, byStatus };
  }
}

/**
 * Singleton scheduler instance
 * In a production app, this might be managed by a DI container
 */
let schedulerInstance: Scheduler | null = null;

export function getScheduler(config?: Partial<SchedulerConfig>): Scheduler {
  if (!schedulerInstance) {
    schedulerInstance = new Scheduler(config);
  }
  return schedulerInstance;
}

export function resetScheduler(): void {
  schedulerInstance = null;
}
