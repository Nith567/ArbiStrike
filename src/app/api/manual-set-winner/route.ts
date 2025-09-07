import { NextRequest, NextResponse } from 'next/server';
import { getChallengeById } from '~/lib/db';

// This endpoint can be used to manually trigger setWinner for completed challenges
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { challengeId } = body;

    if (!challengeId) {
      return NextResponse.json(
        { error: 'Challenge ID is required' },
        { status: 400 }
      );
    }

    // Get the challenge from database
    const challenge = await getChallengeById(challengeId);
    if (!challenge) {
      return NextResponse.json(
        { error: 'Challenge not found' },
        { status: 404 }
      );
    }

    // Check if challenge is completed
    if (challenge.status !== 'completed') {
      return NextResponse.json(
        { error: `Challenge ${challengeId} is not completed (status: ${challenge.status})` },
        { status: 400 }
      );
    }

    if (!challenge.winner) {
      return NextResponse.json(
        { error: `Challenge ${challengeId} has no winner` },
        { status: 400 }
      );
    }

    // Call the set-winner endpoint
    const setWinnerResponse = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/challenges/${challengeId}/set-winner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (setWinnerResponse.ok) {
      const result = await setWinnerResponse.json();
      return NextResponse.json({
        success: true,
        message: `Winner set successfully for challenge ${challengeId}`,
        result,
      });
    } else {
      const error = await setWinnerResponse.text();
      return NextResponse.json(
        { error: `Failed to set winner: ${error}` },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Error in manual set winner:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
