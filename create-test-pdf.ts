/**
 * Creates a simple test PDF problem set for testing
 *
 * Usage: npx tsx create-test-pdf.ts
 */

import { compileLatex } from './lib/latex/compiler';
import * as fs from 'fs';
import * as path from 'path';

const TEST_PSET_LATEX = `\\documentclass[11pt]{article}
\\usepackage{amsmath, amssymb}
\\usepackage{geometry}
\\geometry{margin=1in}

\\title{Test Problem Set}
\\author{6.S061}
\\date{}

\\begin{document}
\\maketitle

\\section*{Problem 1}
Prove that for all integers $n \\geq 1$:
\\[
\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}
\\]

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

\\end{document}`;

async function createTestPDF() {
  console.log('📝 Creating test PDF problem set...');

  try {
    const result = await compileLatex(TEST_PSET_LATEX);

    if (result.success && result.pdf) {
      const outputPath = path.join(process.cwd(), 'test-problemset.pdf');
      fs.writeFileSync(outputPath, result.pdf);
      console.log(`✅ Test PDF created: ${outputPath}`);
      console.log(`   Size: ${(result.pdf.length / 1024).toFixed(2)} KB`);
    } else {
      console.error('❌ PDF compilation failed:', result.errors);
      process.exit(1);
    }
  } catch (error: any) {
    console.error('❌ Error creating test PDF:', error.message);
    process.exit(1);
  }
}

createTestPDF();
