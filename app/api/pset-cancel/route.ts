/**
 * API Route: /api/pset-cancel
 *
 * Cancels a problem-solving job
 */

import { NextRequest, NextResponse } from 'next/server';
import { getScheduler } from '@/lib/scheduler/Scheduler';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId } = body;

    if (!jobId) {
      return NextResponse.json(
        { success: false, error: 'Job ID required' },
        { status: 400 }
      );
    }

    const scheduler = getScheduler();
    const job = scheduler.getJob(jobId);

    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    scheduler.cancelJob(jobId);

    return NextResponse.json({
      success: true,
      message: `Job ${jobId} cancelled successfully`,
    });
  } catch (error: any) {
    console.error('Cancel API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to cancel job',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
