/**
 * PDF Transcription Agent
 *
 * Uses a Vision Language Model (GPT-5 Vision) to transcribe a PDF
 * problem set into LaTeX format.
 *
 * NOTE: This is a PLACEHOLDER implementation. The actual GPT-5 Vision API
 * integration needs to be completed in GPTProvider.ts
 */

import { Agent, TranscriptionInput, TranscriptionOutput } from '../types';
import { createGPT5Vision } from '../llm/GPTProvider';

export class PDFTranscriptionAgent implements Agent {
  name = 'pdf-transcription';
  private llm = createGPT5Vision();

  async execute(input: TranscriptionInput): Promise<TranscriptionOutput> {
    const { pdf } = input;

    const systemPrompt = `You are an expert at transcribing mathematical problem sets from PDF images into LaTeX format.

Your task:
1. Carefully read the entire problem set
2. Transcribe ALL problems, subproblems, and text into LaTeX
3. Preserve the problem numbering and structure exactly
4. Use proper LaTeX math environments (\\[...\\] for display math, $...$ for inline)
5. Maintain all formatting, emphasis, and special instructions

Guidelines:
- Be extremely precise with mathematical notation
- Preserve problem hierarchy (Problem 1, (a), (i), etc.)
- Include all text, even if it's just instructions or notes
- If something is unclear, transcribe it as best as you can
- Use standard LaTeX packages (amsmath, amssymb, etc.)
- DO NOT solve the problems - just transcribe them

Output format:
Return ONLY the LaTeX content for the problems. Do NOT include:
- \\documentclass
- \\begin{document} or \\end{document}
- \\usepackage commands
- Title or author information

Just the problem content itself.`;

    try {
      // TODO: This will throw an error until GPTProvider vision is implemented
      // The actual implementation should:
      // 1. Convert PDF to images (or send PDF directly if API supports it)
      // 2. Call GPT-5 Vision API with the images
      // 3. Get back LaTeX transcription
      // 4. Validate and clean the output

      const latex = await this.transcribePDF(pdf, systemPrompt);

      return {
        latex,
        confidence: 0.9, // Could be determined by model if available
      };
    } catch (error: any) {
      console.error('PDF transcription error:', error);

      // For development/testing, you might want to return mock data
      if (process.env.NODE_ENV === 'development') {
        return {
          latex: this.getMockTranscription(),
          confidence: 0.0, // Indicate this is mock data
        };
      }

      throw new Error(`PDF transcription failed: ${error.message}`);
    }
  }

  private async transcribePDF(pdf: Buffer, systemPrompt: string): Promise<string> {
    // TODO: Implement actual PDF to LaTeX transcription
    // This might involve:
    // 1. Converting PDF to images using pdf-lib or similar
    // 2. Calling GPT-5 Vision API for each page
    // 3. Combining results

    // Placeholder that uses the GPT provider (will throw until implemented)
    // const result = await this.llm.analyzeImage(
    //   pdf,
    //   'Transcribe this problem set to LaTeX',
    //   { systemPrompt }
    // );
    // return result;

    throw new Error(
      'PDF transcription not yet implemented. Please implement GPTProvider.analyzeImage()'
    );
  }

  /**
   * Mock transcription for development/testing
   */
  private getMockTranscription(): string {
    return `\\section*{Problem 1}
Prove that for all integers $n \\geq 1$, the sum $\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}$.

\\subsection*{(a)}
Prove this using mathematical induction.

\\subsection*{(b)}
Provide a combinatorial proof of the same result.

\\section*{Problem 2}
Using your result from Problem 1, compute the value of $\\sum_{k=1}^{100} k$.

\\section*{Problem 3}
Let $f: \\mathbb{R} \\to \\mathbb{R}$ be a continuous function such that $f(x+y) = f(x) + f(y)$ for all $x, y \\in \\mathbb{R}$.

\\subsection*{(a)}
Show that $f(0) = 0$.

\\subsection*{(b)}
Show that $f$ must be linear, i.e., $f(x) = cx$ for some constant $c \\in \\mathbb{R}$.

\\subsection*{(c)}
\\subsubsection*{(i)}
What is $f(2x)$ in terms of $f(x)$?

\\subsubsection*{(ii)}
What is $f(nx)$ for any integer $n$?`;
  }
}
