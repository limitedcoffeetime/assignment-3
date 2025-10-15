# Deployment Guide

## LaTeX Compilation Strategy

This system uses **LaTeX.Online** (https://latexonline.cc/) for PDF compilation.

### How It Works

**Development (local):**
- Uses local `pdflatex` if available
- Falls back to LaTeX.Online if not installed

**Production (Vercel):**
- Automatically uses LaTeX.Online API
- Free, no configuration needed

The compiler auto-detects the environment:

```typescript
// lib/latex/compiler.ts
if (process.env.VERCEL) {
  return compileLatexRemote(latex);  // Uses LaTeX.Online
} else {
  return compileLatexLocal(latex);   // Uses local pdflatex
}
```

### LaTeX Environment

The fixed LaTeX preamble is defined in [lib/latex/preamble.ts](lib/latex/preamble.ts).

All solvers must work within this predetermined environment. It includes:
- Standard math packages (amsmath, amssymb, amsthm)
- Custom commands (\R, \N, \Z, \Q, \C, etc.)
- Problem formatting commands (\problem, \subproblem, \solution)

### Deployment Steps

**1. Push to GitHub:**
```bash
git add .
git commit -m "Ready for deployment"
git push origin main
```

**2. Deploy to Vercel:**
- Connect GitHub repository to Vercel
- Add environment variables:
  - `GEMINI_API_KEY`
  - `OPENAI_API_KEY` (when implemented)
  - `ANTHROPIC_API_KEY` (when implemented)
- Deploy

**3. That's it!**
LaTeX compilation will automatically use LaTeX.Online.

### If You Need to Scale

If LaTeX.Online becomes slow or rate-limited, deploy your own LaTeX service:

1. Deploy to Railway/Fly.io/Render
2. Set `LATEX_SERVICE_URL` environment variable
3. System automatically switches to your service

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for details.

### Testing

Test remote compilation:
```bash
VERCEL=1 npm run dev
```

This simulates the Vercel environment locally.
