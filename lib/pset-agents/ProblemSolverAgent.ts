/**
 * Problem Solver Agent
 *
 * Solves individual problems using Gemini 2.5 Pro with thinking mode.
 * Includes a compilation feedback loop to fix LaTeX syntax errors.
 */

import { Agent, SolverInput, SolverOutput } from '../types';
import { createGeminiProThinking } from '../llm/GeminiProvider';
import { compileLatex, formatErrorsForLLM } from '../latex/compiler';
import { createTestDocument } from '../latex/preamble';

export class ProblemSolverAgent implements Agent {
  name = 'problem-solver';
  private llm = createGeminiProThinking();

  async execute(input: SolverInput): Promise<SolverOutput> {
    const { problem, dependencyContext, latexPreamble, previousErrors } = input;

    // Build the prompt
    const prompt = this.buildPrompt(problem, dependencyContext, previousErrors);

    try {
      // Call the LLM to generate a solution
      const systemPrompt = this.getSystemPrompt(latexPreamble);

      const solutionLatex = await this.llm.generateText(prompt, {
        systemPrompt,
        temperature: 0.7, // Allow some creativity in solutions
        maxTokens: 4000, // Generous limit for detailed solutions
      });

      // Extract just the solution content (remove any thinking/reasoning if present)
      const solution = this.extractSolution(solutionLatex);

      return {
        solution,
        reasoning: solutionLatex, // Full response including thinking
      };
    } catch (error: any) {
      console.error('Problem solver error:', error);
      throw new Error(`Failed to solve problem ${problem.id}: ${error.message}`);
    }
  }

  /**
   * Solve with compilation loop
   * This is the main entry point that includes retry logic
   */
  async solveWithCompilationLoop(
    input: SolverInput,
    maxAttempts: number = 5
  ): Promise<SolverOutput> {
    let attempt = 0;
    let currentInput = { ...input };
    let lastError: string | undefined;

    while (attempt < maxAttempts) {
      attempt++;

      try {
        // Generate solution
        const output = await this.execute(currentInput);
        const { solution } = output;

        // Test compilation
        const testDoc = createTestDocument(solution);
        const compilationResult = await compileLatex(testDoc);

        if (compilationResult.success) {
          // Success! Return the solution
          return output;
        } else {
          // Compilation failed - prepare feedback for retry
          const errorMsg = formatErrorsForLLM(compilationResult.errors || []);
          console.log(
            `Compilation failed for problem ${input.problem.id} (attempt ${attempt}):`,
            errorMsg
          );

          if (attempt < maxAttempts) {
            // Add errors to input for next attempt
            currentInput = {
              ...currentInput,
              previousErrors: [
                ...(currentInput.previousErrors || []),
                errorMsg,
              ],
            };
          } else {
            lastError = errorMsg;
          }
        }
      } catch (error: any) {
        console.error(`Solver attempt ${attempt} failed:`, error);
        lastError = error.message;

        if (attempt >= maxAttempts) {
          throw new Error(
            `Failed to solve problem ${input.problem.id} after ${maxAttempts} attempts: ${lastError}`
          );
        }
      }
    }

    throw new Error(
      `Failed to compile solution for problem ${input.problem.id} after ${maxAttempts} attempts. Last error: ${lastError}`
    );
  }

  private getSystemPrompt(latexPreamble: string): string {
    return `You are an expert mathematics problem solver. Your task is to provide complete, rigorous solutions to mathematical problems.

IMPORTANT LATEX CONSTRAINTS:
The following preamble is already defined and CANNOT be modified:

${latexPreamble}

Your solution will be inserted into this environment. You MUST:
1. NOT include \\documentclass, \\begin{document}, or \\end{document}
2. NOT include any \\usepackage commands
3. ONLY use packages and commands already defined in the preamble
4. Write valid LaTeX that compiles without errors
5. Use proper math mode ($ for inline, \\[ \\] or equation environment for display)
6. Close all environments properly

SOLUTION GUIDELINES:
1. Provide complete, step-by-step solutions
2. Show all work and justify each step
3. Use proper mathematical notation and terminology
4. Be rigorous but clear
5. If multiple approaches exist, choose the most elegant one
6. Format your solution nicely with appropriate sectioning

OUTPUT FORMAT:
Return ONLY the LaTeX solution content. Do not include explanations outside of LaTeX.
The solution should be ready to insert directly into the document.`;
  }

  private buildPrompt(
    problem: Problem,
    dependencyContext?: string,
    previousErrors?: string[]
  ): string {
    let prompt = `Solve the following problem:\n\n`;

    prompt += `**Problem ${problem.number}:**\n${problem.text}\n\n`;

    if (dependencyContext) {
      prompt += `**Context from previous problems:**\n${dependencyContext}\n\n`;
    }

    if (previousErrors && previousErrors.length > 0) {
      prompt += `**IMPORTANT: Your previous solution had compilation errors. Please fix them:**\n\n`;
      for (const error of previousErrors) {
        prompt += `${error}\n\n`;
      }
      prompt += `Please provide a corrected solution that compiles successfully.\n\n`;
    }

    prompt += `Provide a complete, rigorous solution in LaTeX format.`;

    return prompt;
  }

  /**
   * Extract just the solution content from the LLM response
   * Removes any thinking/reasoning sections if present
   */
  private extractSolution(response: string): string {
    // If the response contains explicit solution markers, extract that part
    const solutionMatch = response.match(/\\begin{solution}([\s\S]*?)\\end{solution}/);
    if (solutionMatch) {
      return `\\begin{solution}${solutionMatch[1]}\\end{solution}`;
    }

    // Otherwise, assume the entire response is the solution
    // Remove any markdown code blocks if present
    let solution = response.trim();
    solution = solution.replace(/^```latex\n/, '').replace(/\n```$/, '');
    solution = solution.replace(/^```\n/, '').replace(/\n```$/, '');

    return solution;
  }
}
