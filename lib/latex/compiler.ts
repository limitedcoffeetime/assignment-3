/**
 * LaTeX Compilation System
 *
 * Compiles LaTeX documents to PDF using a local LaTeX installation.
 * Handles error parsing and provides feedback for the compilation loop.
 */

import { spawn } from 'child_process';
import { writeFile, readFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { nanoid } from 'nanoid';
import { CompilationResult, CompilationOptions } from '../types';

/**
 * Compile a LaTeX document to PDF
 *
 * @param latexContent - The complete LaTeX document (including preamble)
 * @param options - Compilation options
 * @returns CompilationResult with success status, PDF buffer, and errors
 */
export async function compileLatex(
  latexContent: string,
  options: CompilationOptions = {}
): Promise<CompilationResult> {
  const {
    engine = 'pdflatex',
    timeout = 30000, // 30 seconds
    workingDir,
  } = options;

  // Create temporary directory for compilation
  const tempDir = workingDir || join(tmpdir(), `latex-compile-${nanoid()}`);

  try {
    // Ensure temp directory exists
    await mkdir(tempDir, { recursive: true });

    // Write LaTeX file
    const texFile = join(tempDir, 'document.tex');
    await writeFile(texFile, latexContent, 'utf-8');

    // Run LaTeX compiler
    const { stdout, stderr, exitCode } = await runCompiler(
      engine,
      texFile,
      tempDir,
      timeout
    );

    const logContent = stdout + '\n' + stderr;

    // Check if compilation succeeded
    if (exitCode === 0) {
      // Read the generated PDF
      const pdfFile = join(tempDir, 'document.pdf');
      try {
        const pdf = await readFile(pdfFile);
        return {
          success: true,
          pdf,
          log: logContent,
        };
      } catch (error) {
        // PDF file not created despite exit code 0
        const errors = parseLatexErrors(logContent);
        return {
          success: false,
          log: logContent,
          errors: errors.length > 0 ? errors : ['PDF file was not created'],
        };
      }
    } else {
      // Compilation failed - parse errors
      const errors = parseLatexErrors(logContent);
      return {
        success: false,
        log: logContent,
        errors: errors.length > 0 ? errors : ['Compilation failed with unknown error'],
      };
    }
  } catch (error: any) {
    return {
      success: false,
      log: error.message,
      errors: [error.message],
    };
  } finally {
    // Clean up temporary directory (optional - could keep for debugging)
    try {
      if (!workingDir) {
        await rm(tempDir, { recursive: true, force: true });
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Run the LaTeX compiler as a child process
 */
function runCompiler(
  engine: string,
  texFile: string,
  workingDir: string,
  timeout: number
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const args = [
      '-interaction=nonstopmode', // Don't stop on errors
      '-halt-on-error',           // But do halt
      '-file-line-error',         // Better error messages
      'document.tex',
    ];

    const process = spawn(engine, args, {
      cwd: workingDir,
      timeout,
    });

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('error', (error) => {
      reject(new Error(`Failed to run ${engine}: ${error.message}`));
    });

    process.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code || 0,
      });
    });
  });
}

/**
 * Parse LaTeX error messages from compilation log
 *
 * Extracts the most important errors and formats them for the LLM to fix
 */
export function parseLatexErrors(log: string): string[] {
  const errors: string[] = [];
  const lines = log.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Look for error indicators
    if (line.startsWith('!')) {
      // This is an error line
      let errorMsg = line.substring(1).trim();

      // Get the next few lines for context
      const contextLines: string[] = [errorMsg];
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const contextLine = lines[j].trim();
        if (contextLine && !contextLine.startsWith('!')) {
          contextLines.push(contextLine);
        } else {
          break;
        }
      }

      errors.push(contextLines.join('\n'));
    }

    // Also catch file-line-error format: "./file.tex:123: Error message"
    const fileLineErrorMatch = line.match(/^(.+?):(\d+):\s*(.+)$/);
    if (fileLineErrorMatch) {
      const [, file, lineNum, message] = fileLineErrorMatch;
      errors.push(`Line ${lineNum}: ${message}`);
    }

    // Catch undefined control sequence errors
    if (line.includes('Undefined control sequence')) {
      errors.push(line);
    }

    // Catch missing $ errors
    if (line.includes('Missing $')) {
      errors.push(line);
    }

    // Catch environment errors
    if (line.includes('\\begin') && line.includes('ended by')) {
      errors.push(line);
    }
  }

  // If no specific errors found, try to extract any line with "Error"
  if (errors.length === 0) {
    for (const line of lines) {
      if (line.toLowerCase().includes('error') && line.trim()) {
        errors.push(line.trim());
      }
    }
  }

  // Deduplicate and limit to most important errors
  const uniqueErrors = Array.from(new Set(errors));
  return uniqueErrors.slice(0, 10); // Return at most 10 errors
}

/**
 * Format errors for LLM feedback
 *
 * Creates a clear, actionable error message for the solver agent
 */
export function formatErrorsForLLM(errors: string[]): string {
  if (errors.length === 0) {
    return 'Compilation failed but no specific errors were found. Please check your LaTeX syntax.';
  }

  const errorList = errors.map((err, i) => `${i + 1}. ${err}`).join('\n\n');

  return `Your LaTeX solution failed to compile with the following errors:\n\n${errorList}\n\nPlease fix these errors and provide a corrected solution. Remember:\n- You can only use packages and commands defined in the preamble\n- All math must be in proper math mode ($...$ or \\[...\\])\n- All environments must be properly closed\n- Check for typos in command names`;
}

/**
 * Check if LaTeX compiler is available
 */
export async function checkLatexInstalled(engine: string = 'pdflatex'): Promise<boolean> {
  try {
    const { exitCode } = await runCompiler(engine, '--version', '.', 5000);
    return exitCode === 0;
  } catch {
    return false;
  }
}
