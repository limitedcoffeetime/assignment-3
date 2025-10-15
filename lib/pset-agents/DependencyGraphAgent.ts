/**
 * Dependency Graph Builder Agent
 *
 * Analyzes problems to detect EXPLICIT dependencies (e.g., "using your result
 * from Problem 1") and builds a dependency graph for parallel execution.
 *
 * Uses a cheap model (Gemini Flash) since this is primarily text analysis.
 */

import { Agent, DependencyGraphInput, DependencyGraphOutput, Problem, DependencyGraph } from '../types';
import { createGeminiFlash, GeminiProvider } from '../llm/GeminiProvider';

export class DependencyGraphAgent implements Agent {
  name = 'dependency-graph';
  private llm = createGeminiFlash();

  async execute(input: DependencyGraphInput): Promise<DependencyGraphOutput> {
    const { problems } = input;

    // Flatten the problem tree into a list for analysis
    const allProblems = this.flattenProblems(problems);

    // Detect dependencies using LLM
    const problemsWithDeps = await this.detectDependencies(allProblems);

    // Build the dependency graph
    const graph = this.buildGraph(problemsWithDeps);

    return { graph };
  }

  /**
   * Flatten a hierarchical problem tree into a flat list
   */
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

  /**
   * Detect dependencies for all problems using LLM
   */
  private async detectDependencies(problems: Problem[]): Promise<Problem[]> {
    const prompt = this.buildPrompt(problems);

    try {
      const SCHEMA = {
        type: GeminiProvider.Type.OBJECT,
        properties: {
          dependencies: {
            type: GeminiProvider.Type.ARRAY,
            items: {
              type: GeminiProvider.Type.OBJECT,
              properties: {
                problemId: { type: GeminiProvider.Type.STRING },
                dependsOn: {
                  type: GeminiProvider.Type.ARRAY,
                  items: { type: GeminiProvider.Type.STRING },
                },
                reasoning: { type: GeminiProvider.Type.STRING },
              },
              required: ['problemId', 'dependsOn'],
            },
          },
        },
        required: ['dependencies'],
      };

      const result = await this.llm.generateStructured<{
        dependencies: Array<{
          problemId: string;
          dependsOn: string[];
          reasoning?: string;
        }>;
      }>(prompt, SCHEMA, {
        temperature: 0.1, // Low temperature for consistent analysis
      });

      // Apply detected dependencies to problems
      for (const dep of result.dependencies) {
        const problem = problems.find((p) => p.id === dep.problemId);
        if (problem) {
          problem.dependencies = dep.dependsOn;
        }
      }

      return problems;
    } catch (error: any) {
      console.error('Dependency detection error:', error);

      // Fallback: detect obvious dependencies manually
      return this.detectDependenciesFallback(problems);
    }
  }

  private buildPrompt(problems: Problem[]): string {
    const problemList = problems
      .map(
        (p) => `ID: ${p.id}
Number: ${p.number}
Text: ${p.text}
`
      )
      .join('\n---\n');

    return `You are analyzing a problem set to detect EXPLICIT dependencies between problems.

A problem has a dependency if it EXPLICITLY mentions or references another problem. Examples:
- "Using your result from Problem 1..."
- "From part (a), we know that..."
- "In the previous problem, you showed..."

DO NOT infer dependencies based on:
- Mathematical relationships (e.g., both problems involve calculus)
- Topic similarity
- Complexity ordering

ONLY mark dependencies when there is EXPLICIT textual reference to another problem.

Parent-child relationships (e.g., Problem 1(a) being a subproblem of Problem 1) are NOT dependencies.
They are structural relationships already captured in the hierarchy.

Here are the problems:
${problemList}

For each problem, identify which OTHER problems it depends on (if any).

Return a JSON object with a "dependencies" array. Each entry should have:
- problemId: The ID of the problem
- dependsOn: An array of problem IDs it depends on (empty array if no dependencies)
- reasoning: Brief explanation of why (optional)

Example:
{
  "dependencies": [
    {
      "problemId": "1",
      "dependsOn": [],
      "reasoning": "First problem, no dependencies"
    },
    {
      "problemId": "2",
      "dependsOn": ["1"],
      "reasoning": "Explicitly says 'Using your result from Problem 1'"
    }
  ]
}`;
  }

  /**
   * Fallback dependency detection using simple heuristics
   */
  private detectDependenciesFallback(problems: Problem[]): Problem[] {
    for (const problem of problems) {
      const text = problem.text.toLowerCase();
      const deps: string[] = [];

      // Look for explicit references
      for (const other of problems) {
        if (other.id === problem.id) continue;

        // Check for references like "problem 1", "part (a)", etc.
        const patterns = [
          `problem ${other.number}`,
          `part ${other.number}`,
          `from ${other.number}`,
          `using ${other.number}`,
        ];

        for (const pattern of patterns) {
          if (text.includes(pattern.toLowerCase())) {
            deps.push(other.id);
            break;
          }
        }
      }

      problem.dependencies = deps;
    }

    return problems;
  }

  /**
   * Build the dependency graph and perform topological sort
   */
  private buildGraph(problems: Problem[]): DependencyGraph {
    const nodes = new Map<string, Problem>();
    const edges = new Map<string, string[]>();

    // Build nodes and edges
    for (const problem of problems) {
      nodes.set(problem.id, problem);
      edges.set(problem.id, problem.dependencies || []);
    }

    // Perform topological sort to get execution levels
    const levels = this.topologicalSort(nodes, edges);

    return { nodes, edges, levels };
  }

  /**
   * Topological sort using Kahn's algorithm
   * Returns problems grouped by dependency level
   */
  private topologicalSort(
    nodes: Map<string, Problem>,
    edges: Map<string, string[]>
  ): string[][] {
    const levels: string[][] = [];

    // Calculate in-degree for each node
    const inDegree = new Map<string, number>();
    for (const [nodeId] of nodes) {
      inDegree.set(nodeId, 0);
    }
    for (const [, deps] of edges) {
      for (const dep of deps) {
        inDegree.set(dep, (inDegree.get(dep) || 0) + 1);
      }
    }

    // Find all nodes with in-degree 0
    let currentLevel = Array.from(nodes.keys()).filter((id) => inDegree.get(id) === 0);

    while (currentLevel.length > 0) {
      levels.push([...currentLevel]);

      const nextLevel: string[] = [];

      // Process current level
      for (const nodeId of currentLevel) {
        const deps = edges.get(nodeId) || [];
        for (const dep of deps) {
          const newDegree = (inDegree.get(dep) || 0) - 1;
          inDegree.set(dep, newDegree);
          if (newDegree === 0) {
            nextLevel.push(dep);
          }
        }
      }

      currentLevel = nextLevel;
    }

    // Check for cycles
    const sorted = levels.flat();
    if (sorted.length !== nodes.size) {
      console.warn('Circular dependency detected! Some problems may not be included.');
    }

    return levels;
  }
}
