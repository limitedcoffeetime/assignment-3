# Implementation Guide: LaTeX Problem Set Solver

This guide walks you through completing the implementation of the multi-agent problem set solving system.

## 🎯 Current Status

The system architecture is fully designed and scaffolded. All major components are in place:

✅ **Completed:**
- Full type system ([lib/types/index.ts](lib/types/index.ts))
- Scheduler with state management ([lib/scheduler/Scheduler.ts](lib/scheduler/Scheduler.ts))
- LaTeX compilation system ([lib/latex/compiler.ts](lib/latex/compiler.ts))
- Fixed LaTeX preamble ([lib/latex/preamble.ts](lib/latex/preamble.ts))
- All agent scaffolds
- Main orchestrator ([lib/orchestrators/ProblemSetOrchestrator.ts](lib/orchestrators/ProblemSetOrchestrator.ts))
- API routes

⚠️ **Needs Implementation:**
- LLM provider API integrations (GPT, Claude)
- Frontend file upload UI
- LaTeX installation and testing

## 📋 Implementation Steps

### Step 1: Install Dependencies

You'll need to install additional dependencies:

```bash
npm install pdf-lib  # For PDF processing (if needed for GPT vision)
npm install nanoid   # Already in your dependencies
```

For LaTeX compilation, you need a LaTeX distribution installed on your system:
- **macOS:** `brew install --cask mactex-no-gui` (or full MacTeX)
- **Linux:** `sudo apt-get install texlive-latex-base texlive-latex-extra`
- **Windows:** Install MiKTeX or TeX Live

Test that LaTeX is working:
```bash
pdflatex --version
```

### Step 2: Set Up API Keys

Add the following to your [.env](.env) file:

```bash
# Already have Gemini
GEMINI_API_KEY=your_key_here

# Add these:
OPENAI_API_KEY=your_gpt_key_here
ANTHROPIC_API_KEY=your_claude_key_here
```

### Step 3: Implement GPT Provider

Open [lib/llm/GPTProvider.ts](lib/llm/GPTProvider.ts) and implement the actual API calls.

**Important:** Use the new OpenAI **Responses API**, not the old ChatCompletions API.

```typescript
// Example implementation structure:
async generateText(prompt: string, options?: LLMOptions): Promise<string> {
  // TODO: Use OpenAI Responses API
  // 1. Construct request with prompt and system message
  // 2. Call the API
  // 3. Parse response
  // 4. Return text
}

async analyzeImage(imageData: Buffer | string, ...): Promise<string> {
  // TODO: For PDF transcription
  // 1. Convert PDF pages to images or send PDF directly
  // 2. Call GPT-5 Vision API
  // 3. Return transcribed LaTeX
}
```

Resources:
- [OpenAI API Documentation](https://platform.openai.com/docs)
- Look for the latest GPT-5 vision/multimodal endpoints

### Step 4: Implement Claude Provider

Open [lib/llm/ClaudeProvider.ts](lib/llm/ClaudeProvider.ts) and implement the Messages API.

```typescript
async generateText(prompt: string, options?: LLMOptions): Promise<string> {
  // Use Anthropic Messages API
  // Documentation: https://docs.anthropic.com/claude/reference/messages_post
}

async generateStructured<T>(prompt: string, schema: any, ...): Promise<T> {
  // Claude doesn't have native structured output
  // Add schema to prompt and request JSON format
  // Parse and validate response
}
```

Resources:
- [Anthropic API Documentation](https://docs.anthropic.com/)

### Step 5: Test LaTeX Compilation

Before running the full pipeline, test that LaTeX compilation works:

```typescript
// Create a test file: test-latex.ts
import { compileLatex } from './lib/latex/compiler';
import { LATEX_PREAMBLE } from './lib/latex/preamble';

const testDoc = `${LATEX_PREAMBLE}
\\problem{1}
\\begin{solution}
This is a test solution with math: $E = mc^2$.
\\end{solution}
\\end{document}`;

async function test() {
  const result = await compileLatex(testDoc);
  console.log('Success:', result.success);
  if (!result.success) {
    console.log('Errors:', result.errors);
  }
}

test();
```

Run:
```bash
npx tsx test-latex.ts
```

### Step 6: Update Chat Interface for File Upload

The current UI only supports text input. You need to add file upload capability.

Update [app/page.tsx](app/page.tsx):

```typescript
// Add file state
const [pdfFile, setPdfFile] = useState<File | null>(null);

// Add file input
<input
  type="file"
  accept="application/pdf"
  onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
/>

// Update send function
async function send() {
  const formData = new FormData();
  formData.append('message', input);
  if (pdfFile) {
    formData.append('pdf', pdfFile);
  }

  const res = await fetch('/api/pset-solve', {
    method: 'POST',
    body: formData,
  });

  // Handle response...
}
```

### Step 7: Test with Mock Data

Before implementing the LLM APIs, test the system with mock data:

1. The [PDFTranscriptionAgent](lib/pset-agents/PDFTranscriptionAgent.ts) already has a `getMockTranscription()` method
2. The [ProblemChunkingAgent](lib/pset-agents/ProblemChunkingAgent.ts) has `getMockProblems()`
3. Set `NODE_ENV=development` to use these

Test the pipeline:
```bash
NODE_ENV=development npm run dev
```

### Step 8: Implement Full Pipeline

Once all LLM providers are implemented:

1. Start the dev server: `npm run dev`
2. Upload a simple PDF problem set
3. Monitor the console logs to see pipeline progress
4. Check job status via the status endpoint
5. Retrieve the final PDF when complete

### Step 9: Add Error Handling and Logging

The system has basic error handling, but you should add more robust logging:

```typescript
// Consider adding a logger utility:
// lib/logger.ts

export function log(jobId: string, stage: string, message: string) {
  console.log(`[${new Date().toISOString()}] [${jobId}] [${stage}] ${message}`);
}
```

Use this throughout the orchestrator for better observability.

## 🧪 Testing Strategy

### Unit Testing

Test individual components:

1. **Scheduler**: Test job creation, status updates, solver job management
2. **Dependency Graph**: Test topological sorting with various graph structures
3. **LaTeX Compiler**: Test with valid/invalid LaTeX
4. **Agents**: Test with mock LLM responses

### Integration Testing

Test the full pipeline:

1. **Simple Problem Set**: 3 problems, no dependencies
2. **With Dependencies**: Problem 2 depends on Problem 1
3. **Nested Problems**: Problem 1(a)(i), 1(a)(ii), etc.
4. **Compilation Errors**: Test that the retry loop works

### Edge Cases to Test

- Empty PDF
- PDF with no mathematical content
- Circular dependencies (should be detected)
- Very large problem sets (10+ problems)
- Problems that fail compilation after max retries
- Cancellation mid-pipeline

## 🚀 Optimization Ideas (Future)

Once the prototype works, consider:

1. **Persistent Storage**: Replace in-memory scheduler with Redis/PostgreSQL
2. **Queue System**: Use BullMQ or similar for job processing
3. **Streaming Updates**: WebSocket for real-time status updates
4. **Caching**: Cache transcription results for duplicate PDFs
5. **Batch Processing**: Support multiple PDFs at once
6. **Result Storage**: Store generated PDFs in S3 or similar
7. **User Accounts**: Multi-user support with job ownership
8. **Cost Tracking**: Monitor LLM API costs per job

## 📁 File Structure Reference

```
lib/
├── types/
│   └── index.ts                    # All TypeScript types
├── scheduler/
│   └── Scheduler.ts                # State management
├── llm/
│   ├── LLMProvider.ts              # Base provider interface
│   ├── GeminiProvider.ts           # ✅ Implemented
│   ├── GPTProvider.ts              # ⚠️ TODO: Implement
│   └── ClaudeProvider.ts           # ⚠️ TODO: Implement
├── latex/
│   ├── preamble.ts                 # Fixed LaTeX environment
│   └── compiler.ts                 # Compilation system
├── pset-agents/
│   ├── RouterAgent.ts              # ✅ Done
│   ├── PDFTranscriptionAgent.ts    # ⚠️ TODO: Implement vision API
│   ├── ProblemChunkingAgent.ts     # ⚠️ TODO: Implement Claude API
│   ├── DependencyGraphAgent.ts     # ✅ Done (uses Gemini)
│   ├── ProblemSolverAgent.ts       # ⚠️ TODO: Implement Gemini thinking
│   └── SynthesizerAgent.ts         # ✅ Done (deterministic)
└── orchestrators/
    └── ProblemSetOrchestrator.ts   # ✅ Done

app/api/
├── pset-solve/route.ts             # ✅ Done
├── pset-status/route.ts            # ✅ Done
└── pset-cancel/route.ts            # ✅ Done
```

## 🔧 Debugging Tips

### Enable Verbose Logging

Add more console.log statements in:
- Orchestrator pipeline stages
- Agent execute methods
- Scheduler state updates

### Check Scheduler State

Add a debug endpoint:

```typescript
// app/api/debug/route.ts
export async function GET() {
  const scheduler = getScheduler();
  return NextResponse.json({
    stats: scheduler.getStats(),
    jobs: scheduler.getAllJobs(),
  });
}
```

### Test LaTeX Locally

If compilation fails, save the generated LaTeX to a file:

```typescript
import { writeFileSync } from 'fs';
writeFileSync('/tmp/test.tex', latexContent);
// Then compile manually: pdflatex /tmp/test.tex
```

### Monitor API Calls

Add request/response logging to LLM providers:

```typescript
console.log('LLM Request:', { prompt, options });
const response = await api.call(...);
console.log('LLM Response:', response);
```

## 📚 Key Design Principles

1. **Model Agnostic**: LLM provider interface allows easy swapping
2. **Observable**: Scheduler provides real-time status without blocking
3. **Fault Tolerant**: Individual problem failures don't crash entire pipeline
4. **Parallel**: Dependency-aware parallelization for speed
5. **Deterministic LaTeX**: Fixed preamble ensures compilation consistency

## ❓ FAQ

**Q: Why not use Overleaf API for LaTeX compilation?**
A: Local compilation is faster, doesn't require internet, and avoids API rate limits. Plus, we have full control over the environment.

**Q: What if a problem takes too long to solve?**
A: The scheduler has a `solverTimeout` (default 5 minutes). Adjust in [ProblemSetOrchestrator.ts](lib/orchestrators/ProblemSetOrchestrator.ts:18).

**Q: How do I handle very large PDFs?**
A: Consider splitting into pages and processing in chunks, or increase memory limits for the LaTeX compiler.

**Q: Can I use different models for different problem types?**
A: Yes! Modify [ProblemSolverAgent](lib/pset-agents/ProblemSolverAgent.ts) to choose models based on problem content.

**Q: What about handwritten problem sets?**
A: The VLM (GPT-5 Vision) should handle handwritten text, but accuracy will vary. Consider OCR preprocessing for better results.

## 🎉 Next Steps

1. Implement GPT and Claude providers
2. Test LaTeX compilation locally
3. Add file upload to the UI
4. Test with a simple 3-problem PDF
5. Monitor logs and fix issues
6. Gradually test with more complex problem sets

Good luck! This is a solid foundation for a powerful multi-agent system. 🚀
