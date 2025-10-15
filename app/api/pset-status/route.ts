/**
 * API Route: /api/pset-status
 *
 * Returns the status of problem-solving jobs
 */

import { NextRequest, NextResponse } from 'next/server';
import { getScheduler } from '@/lib/scheduler/Scheduler';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    const scheduler = getScheduler();

    if (jobId) {
      // Get specific job status
      const status = scheduler.getJobStatus(jobId);
      if (!status) {
        return NextResponse.json(
          { success: false, error: 'Job not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, job: status });
    } else {
      // Get all job statuses
      const statuses = scheduler.getAllJobStatuses();
      return NextResponse.json({ success: true, jobs: statuses });
    }
  } catch (error: any) {
    console.error('Status API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get status',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // Also support POST for consistency with other endpoints
  return GET(request);
}
