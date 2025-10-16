import { NextRequest, NextResponse } from 'next/server';
import { submitHumanResponse } from '@/lib/gameState';

/**
 * API endpoint to receive human player's response and continue the game.
 */
export async function POST(req: NextRequest) {
  try {
    const { response } = await req.json();

    if (typeof response !== 'string') {
      return NextResponse.json(
        { error: 'response string is required' },
        { status: 400 }
      );
    }

    // Submit the human's response, which will resolve the promise in the game loop
    submitHumanResponse(response);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error submitting human response:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to submit response' },
      { status: 500 }
    );
  }
}
