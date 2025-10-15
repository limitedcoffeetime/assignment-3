/**
 * Remote LaTeX Compilation
 *
 * Compiles LaTeX using an external API service (for Vercel/serverless deployment)
 */

import { CompilationResult, CompilationOptions } from '../types';

/**
 * Compile LaTeX using LaTeX.Online (free service)
 *
 * Documentation: https://github.com/aslushnikov/latex-online
 * API: https://latexonline.cc/
 *
 * LaTeX.Online accepts:
 * - URL to .tex file: /compile?url=<url>
 * - Plain text: /compile?text=<url-encoded-tex>
 * - Git repo: /compile?git=<repo>&target=<file>
 *
 * Optional params: force=true, command=xelatex, download=filename.pdf
 */
export async function compileLatexOnline(
  latexContent: string,
  options: CompilationOptions = {}
): Promise<CompilationResult> {
  try {
    // URL-encode the LaTeX content
    const encodedLatex = encodeURIComponent(latexContent);

    // Build URL with optional parameters
    let url = `https://latexonline.cc/compile?text=${encodedLatex}`;

    // Add compiler engine if specified (pdflatex, xelatex, lualatex)
    if (options.engine && options.engine !== 'pdflatex') {
      url += `&command=${options.engine}`;
    }

    // Force recompilation (skip cache)
    url += '&force=true';

    console.log('[LaTeX.Online] Compiling document...');

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/pdf',
      },
    });

    if (response.ok && response.headers.get('content-type')?.includes('application/pdf')) {
      const pdfBuffer = Buffer.from(await response.arrayBuffer());
      console.log('[LaTeX.Online] ✓ Compilation successful');
      return {
        success: true,
        pdf: pdfBuffer,
        log: 'Compiled using LaTeX.Online',
      };
    } else {
      // LaTeX.Online returns error log in response body
      const errorText = await response.text();
      console.log('[LaTeX.Online] ✗ Compilation failed');
      return {
        success: false,
        log: errorText,
        errors: ['LaTeX.Online compilation failed', errorText],
      };
    }
  } catch (error: any) {
    console.error('[LaTeX.Online] Error:', error.message);
    return {
      success: false,
      log: error.message,
      errors: [`Remote compilation failed: ${error.message}`],
    };
  }
}

/**
 * Compile LaTeX using a custom self-hosted service
 *
 * This expects a service deployed on Railway, Fly.io, etc.
 * See DEPLOYMENT_GUIDE.md for setup instructions
 */
export async function compileLatexCustomService(
  latexContent: string,
  serviceUrl: string,
  options: CompilationOptions = {}
): Promise<CompilationResult> {
  try {
    const response = await fetch(`${serviceUrl}/compile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        latex: latexContent,
        engine: options.engine || 'pdflatex',
      }),
    });

    const result = await response.json();

    if (result.success) {
      // PDF is returned as base64
      const pdfBuffer = Buffer.from(result.pdf, 'base64');
      return {
        success: true,
        pdf: pdfBuffer,
        log: result.log || 'Compiled using custom service',
      };
    } else {
      return {
        success: false,
        log: result.log,
        errors: result.errors || ['Unknown compilation error'],
      };
    }
  } catch (error: any) {
    return {
      success: false,
      log: error.message,
      errors: [`Custom service compilation failed: ${error.message}`],
    };
  }
}

/**
 * Compile using the appropriate remote service based on environment
 */
export async function compileLatexRemote(
  latexContent: string,
  options: CompilationOptions = {}
): Promise<CompilationResult> {
  const customServiceUrl = process.env.LATEX_SERVICE_URL;

  if (customServiceUrl) {
    // Use custom self-hosted service (preferred for production)
    console.log('Using custom LaTeX service:', customServiceUrl);
    return compileLatexCustomService(latexContent, customServiceUrl, options);
  } else {
    // Fall back to LaTeX.Online (good for prototypes)
    console.log('Using LaTeX.Online (free service)');
    return compileLatexOnline(latexContent, options);
  }
}
