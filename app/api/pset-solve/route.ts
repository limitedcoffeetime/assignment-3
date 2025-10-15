/**
 * API Route: /api/pset-solve
 *
 * Handles PDF upload and initiates the problem-solving pipeline
 */

import { NextRequest, NextResponse } from 'next/server';
import { ProblemSetOrchestrator } from '@/lib/orchestrators/ProblemSetOrchestrator';

// Singleton orchestrator instance
let orchestrator: ProblemSetOrchestrator | null = null;

function getOrchestrator(): ProblemSetOrchestrator {
  if (!orchestrator) {
    orchestrator = new ProblemSetOrchestrator();
  }
  return orchestrator;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const message = formData.get('message') as string | null;
    const pdfFile = formData.get('pdf') as File | null;

    let pdf: Buffer | undefined;
    if (pdfFile) {
      const arrayBuffer = await pdfFile.arrayBuffer();
      pdf = Buffer.from(arrayBuffer);
    }

    const orch = getOrchestrator();
    const result = await orch.orchestrate(message || '', pdf);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Solve API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process request',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
