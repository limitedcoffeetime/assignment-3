/**
 * Problem Chunking Agent
 *
 * Takes raw LaTeX and breaks it into structured, hierarchical problems.
 * Uses Claude for its strong structured output capabilities.
 *
 * NOTE: This is a PLACEHOLDER implementation. The actual Claude API
 * integration needs to be completed in ClaudeProvider.ts
 */

import { Agent, ChunkingInput, ChunkingOutput, Problem } from '../types';
import { createClaudeSonnet } from '../llm/ClaudeProvider';

const PROBLEM_SCHEMA = {
  type: 'object',
  properties: {
    problems: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          parentId: { type: 'string', nullable: true },
          number: { type: 'string' },
          text: { type: 'string' },
          level: { type: 'number' },
          children: { type: 'array' },
        },
        required: ['id', 'number', 'text', 'level'],
      },
    },
  },
  required: ['problems'],
};

export class ProblemChunkingAgent implements Agent {
  name = 'problem-chunking';
  private llm = createClaudeSonnet();

  async execute(input: ChunkingInput): Promise<ChunkingOutput> {
    const { rawLatex } = input;

    const prompt = this.buildPrompt(rawLatex);

    try {
      // TODO: This will throw until ClaudeProvider is implemented
      const result = await this.llm.generateStructured<{ problems: Problem[] }>(
        prompt,
        PROBLEM_SCHEMA,
        {
          temperature: 0.2, // Low temperature for consistent parsing
        }
      );

      // Post-process: ensure children arrays are populated correctly
      const problems = this.buildHierarchy(result.problems);

      return { problems };
    } catch (error: any) {
      console.error('Problem chunking error:', error);

      // For development/testing, return mock data
      if (process.env.NODE_ENV === 'development') {
        return { problems: this.getMockProblems() };
      }

      throw new Error(`Problem chunking failed: ${error.message}`);
    }
  }

  private buildPrompt(rawLatex: string): string {
    return `You are an expert at parsing mathematical problem sets. Your task is to break down this LaTeX problem set into a structured, hierarchical format.

Input LaTeX:
${rawLatex}

Instructions:
1. Identify all problems and subproblems in the LaTeX
2. Assign each a unique ID based on its position (e.g., "1", "1.a", "1.a.i")
3. Determine the hierarchy level (0 = top-level problem, 1 = subproblem, 2 = sub-subproblem, etc.)
4. Extract the full text of each problem (in LaTeX format)
5. Identify parent-child relationships

Guidelines:
- Problem IDs should follow the pattern: "1", "2", "1.a", "1.b", "1.a.i", "1.a.ii", etc.
- The "number" field is the display number (e.g., "1(a)(i)")
- The "text" field contains the complete problem statement in LaTeX
- Level 0 = main problems (Problem 1, 2, 3, ...)
- Level 1 = first-level subproblems (usually (a), (b), (c), ...)
- Level 2 = second-level subproblems (usually (i), (ii), (iii), ...)
- The "children" field should initially be an empty array (we'll populate it later)
- DO NOT infer dependencies - we'll handle that in a separate step

Example structure for "Problem 1 (a) (i)":
{
  "id": "1.a.i",
  "parentId": "1.a",
  "number": "1(a)(i)",
  "text": "Show that f(0) = 0.",
  "level": 2,
  "children": []
}

Return a JSON object with a "problems" array containing all parsed problems.`;
  }

  /**
   * Build the hierarchy by populating children arrays
   */
  private buildHierarchy(flatProblems: Problem[]): Problem[] {
    // Create a map for quick lookup
    const problemMap = new Map<string, Problem>();
    for (const problem of flatProblems) {
      problem.children = []; // Ensure children array exists
      problem.dependencies = []; // Initialize empty dependencies
      problemMap.set(problem.id, problem);
    }

    // Build parent-child relationships
    for (const problem of flatProblems) {
      if (problem.parentId) {
        const parent = problemMap.get(problem.parentId);
        if (parent) {
          parent.children.push(problem);
        }
      }
    }

    // Return only top-level problems (the hierarchy is in their children)
    return flatProblems.filter((p) => p.level === 0);
  }

  /**
   * Mock problems for development/testing
   */
  private getMockProblems(): Problem[] {
    const problems: Problem[] = [
      {
        id: '1',
        number: '1',
        text: 'Prove that for all integers $n \\geq 1$, the sum $\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}$.',
        level: 0,
        children: [],
        dependencies: [],
      },
      {
        id: '1.a',
        parentId: '1',
        number: '1(a)',
        text: 'Prove this using mathematical induction.',
        level: 1,
        children: [],
        dependencies: [],
      },
      {
        id: '1.b',
        parentId: '1',
        number: '1(b)',
        text: 'Provide a combinatorial proof of the same result.',
        level: 1,
        children: [],
        dependencies: [],
      },
      {
        id: '2',
        number: '2',
        text: 'Using your result from Problem 1, compute the value of $\\sum_{k=1}^{100} k$.',
        level: 0,
        children: [],
        dependencies: [],
      },
      {
        id: '3',
        number: '3',
        text: 'Let $f: \\mathbb{R} \\to \\mathbb{R}$ be a continuous function such that $f(x+y) = f(x) + f(y)$ for all $x, y \\in \\mathbb{R}$.',
        level: 0,
        children: [],
        dependencies: [],
      },
      {
        id: '3.a',
        parentId: '3',
        number: '3(a)',
        text: 'Show that $f(0) = 0$.',
        level: 1,
        children: [],
        dependencies: [],
      },
      {
        id: '3.b',
        parentId: '3',
        number: '3(b)',
        text: 'Show that $f$ must be linear, i.e., $f(x) = cx$ for some constant $c \\in \\mathbb{R}$.',
        level: 1,
        children: [],
        dependencies: [],
      },
      {
        id: '3.c',
        parentId: '3',
        number: '3(c)',
        text: '',
        level: 1,
        children: [],
        dependencies: [],
      },
      {
        id: '3.c.i',
        parentId: '3.c',
        number: '3(c)(i)',
        text: 'What is $f(2x)$ in terms of $f(x)$?',
        level: 2,
        children: [],
        dependencies: [],
      },
      {
        id: '3.c.ii',
        parentId: '3.c',
        number: '3(c)(ii)',
        text: 'What is $f(nx)$ for any integer $n$?',
        level: 2,
        children: [],
        dependencies: [],
      },
    ];

    return this.buildHierarchy(problems);
  }
}
