import { NextRequest, NextResponse } from 'next/server';
import { getGameInstance, resetGameInstance } from '@/lib/murder-game';

/**
 * Handle murder mystery game chat requests
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, action } = body || {};

    // Handle reset
    if (action === 'reset') {
      resetGameInstance();
      return NextResponse.json({
        assistantMessage: 'Game reset. Type "start game" to begin a new game.',
      });
    }

    if (typeof message !== 'string') {
      return NextResponse.json(
        { error: 'message string is required' },
        { status: 400 }
      );
    }

    // Get game instance
    const game = getGameInstance();

    // Process message
    const response = await game.handleMessage(message);

    // Get debug events since last request
    const debugEvents = game.getAndClearDebugEvents();

    return NextResponse.json({
      assistantMessage: response,
      gameStatus: game.getStatus(),
      debugEvents,
    });
  } catch (err: any) {
    console.error('Murder game error:', err);

    const msg = String(err?.message || err || '').toLowerCase();

    if (msg.includes('gemini_api_key') || msg.includes('gemini') || msg.includes('api key')) {
      return NextResponse.json(
        { error: 'Gemini API key not found. Please set GEMINI_API_KEY in your .env file.' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Game error', details: String(err?.message || err) },
      { status: 500 }
    );
  }
}
