import { NextRequest, NextResponse } from 'next/server';
import { Orchestrator } from '@/lib/orchestrators/ExampleJoySadAngryOrchestrator';

/**
 * Handle chat POST requests for a single-turn pipeline execution.
 *
 * Parameters: NextRequest object
 * Returns: JSON response with pipeline output or error.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { history } = body || {};

    if (!Array.isArray(history)) {
      return NextResponse.json(
        { error: 'history array is required' },
        { status: 400 }
      );
    }

    const orchestrator = new Orchestrator();
    const contents = history.map((m: any) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    }));

    const { assistantMessage, frameSet, agent, reasons } = await orchestrator.orchestrate(contents);

    return NextResponse.json({
      assistantMessage,
      replierInput: { frameSet, contextCount: history.length, agent, reasons }
    });
  } catch (err: any) {
    const msg = String(err?.message || err || '').toLowerCase();
    if (msg.includes('gemini_api_key') || msg.includes('gemini') || msg.includes('api key')) {
      return NextResponse.json(
        { error: 'Gemini API key not found' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Pipeline error', details: String(err?.message || err) },
      { status: 500 }
    );
  }
}
