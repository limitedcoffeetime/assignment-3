/**
 * Test script for the problem set solving pipeline
 *
 * Usage:
 *   npx tsx test-pipeline.ts [path-to-pdf]
 *
 * If no PDF provided, uses mock data for development testing
 */

import { ProblemSetOrchestrator } from './lib/orchestrators/ProblemSetOrchestrator';
import { getScheduler } from './lib/scheduler/Scheduler';
import * as fs from 'fs';
import * as path from 'path';

async function testPipeline() {
  console.log('🧪 Testing Problem Set Pipeline\n');

  // Get PDF path from command line or use mock mode
  const pdfPath = process.argv[2];
  let pdf: Buffer | undefined;

  if (pdfPath) {
    if (!fs.existsSync(pdfPath)) {
      console.error(`❌ PDF file not found: ${pdfPath}`);
      process.exit(1);
    }
    console.log(`📄 Loading PDF: ${pdfPath}`);
    pdf = fs.readFileSync(pdfPath);
    console.log(`   Size: ${(pdf.length / 1024).toFixed(2)} KB\n`);
  } else {
    console.log('📝 No PDF provided - will use mock data for development\n');
  }

  // Create orchestrator
  const orchestrator = new ProblemSetOrchestrator();
  const scheduler = getScheduler();

  // Listen to scheduler events for progress updates
  scheduler.on('job_created', (event) => {
    console.log(`✨ Job created: ${event.jobId}`);
  });

  scheduler.on('stage_changed', (event) => {
    console.log(`📍 Stage changed: ${event.data.stage}`);
  });

  scheduler.on('solver_started', (event) => {
    console.log(`🔧 Started solving problem: ${event.data.problemId}`);
  });

  scheduler.on('solver_completed', (event) => {
    console.log(`✅ Completed problem: ${event.data.problemId}`);
  });

  scheduler.on('solver_failed', (event) => {
    console.log(`❌ Failed problem: ${event.data.problemId} - ${event.data.error}`);
  });

  scheduler.on('job_completed', (event) => {
    console.log(`\n🎉 Job completed: ${event.jobId}`);
  });

  scheduler.on('job_failed', (event) => {
    console.log(`\n💥 Job failed: ${event.jobId} - ${event.data.error}`);
  });

  try {
    console.log('🚀 Starting orchestration...\n');
    const result = await orchestrator.orchestrate('Solve this problem set', pdf);

    console.log('\n📊 Result:', JSON.stringify(result, null, 2));

    if (result.success && result.jobId) {
      // Get final status
      const status = scheduler.getJobStatus(result.jobId);
      console.log('\n📈 Final Status:', JSON.stringify(status, null, 2));

      // Get the final PDF if available
      const job = scheduler.getJob(result.jobId);
      if (job?.finalPdf) {
        const outputPath = path.join(process.cwd(), 'test-output.pdf');
        fs.writeFileSync(outputPath, job.finalPdf);
        console.log(`\n💾 Saved final PDF to: ${outputPath}`);
      }
    }

    console.log('\n✅ Test completed successfully!');
  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
testPipeline();
