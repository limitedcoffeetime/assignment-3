/**
 * Synthesizer Agent
 *
 * Combines all solved problems into a single, well-formatted LaTeX document.
 * This is mostly deterministic template-based synthesis.
 */

import { Agent, SynthesizerInput, SynthesizerOutput, Problem } from '../types';
import { formatProblemHeader } from '../latex/preamble';

export class SynthesizerAgent implements Agent {
  name = 'synthesizer';

  async execute(input: SynthesizerInput): Promise<SynthesizerOutput> {
    const { problems, solutions, preamble } = input;

    // Build the document content
    const content = this.synthesizeDocument(problems, solutions);

    // Combine with preamble
    const document = `${preamble}\n${content}\n\\end{document}`;

    return { document };
  }

  /**
   * Synthesize the document content from problems and solutions
   */
  private synthesizeDocument(
    problems: Problem[],
    solutions: Map<string, string>
  ): string {
    const parts: string[] = [];

    // Recursively process problems in order
    const processProblem = (problem: Problem) => {
      // Add problem header
      const header = formatProblemHeader(problem.number, problem.level);
      parts.push(header);

      // Add problem statement if not empty
      if (problem.text.trim()) {
        parts.push('\\textbf{Problem Statement:}');
        parts.push(problem.text);
        parts.push(''); // Blank line
      }

      // Add solution if available
      const solution = solutions.get(problem.id);
      if (solution) {
        parts.push(solution);
        parts.push(''); // Blank line
      } else {
        // Solution not available (failed or skipped)
        parts.push('\\textit{Solution not available.}');
        parts.push(''); // Blank line
      }

      // Process children recursively
      for (const child of problem.children) {
        processProblem(child);
      }
    };

    // Process all top-level problems
    for (const problem of problems) {
      processProblem(problem);
      parts.push('\\newpage'); // New page for each top-level problem
    }

    return parts.join('\n');
  }

  /**
   * Get a summary of what was synthesized
   */
  getSynthesisSummary(
    problems: Problem[],
    solutions: Map<string, string>
  ): string {
    const flatProblems = this.flattenProblems(problems);
    const total = flatProblems.length;
    const solved = flatProblems.filter((p) => solutions.has(p.id)).length;
    const failed = total - solved;

    return `Synthesized document with ${total} problems: ${solved} solved, ${failed} failed.`;
  }

  private flattenProblems(problems: Problem[]): Problem[] {
    const flat: Problem[] = [];

    const traverse = (problem: Problem) => {
      flat.push(problem);
      for (const child of problem.children) {
        traverse(child);
      }
    };

    for (const problem of problems) {
      traverse(problem);
    }

    return flat;
  }
}
