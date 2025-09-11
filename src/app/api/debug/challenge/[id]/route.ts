import { NextRequest, NextResponse } from 'next/server';
import { getChallengeById } from '~/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const challengeId = parseInt(params.id);
    
    if (isNaN(challengeId)) {
      return NextResponse.json(
        { error: 'Invalid challenge ID' },
        { status: 400 }
      );
    }

    // Get the challenge from database
    const challenge = await getChallengeById(challengeId);
    
    console.log(`=== DEBUG CHALLENGE ${challengeId} ===`);
    console.log('Raw challenge data from database:');
    console.log(JSON.stringify(challenge, null, 2));
    
    if (!challenge) {
      return NextResponse.json(
        { error: 'Challenge not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      challenge,
      debug: {
        hasTransactionHash: !!challenge.transactionHash,
        transactionHashValue: challenge.transactionHash,
        status: challenge.status,
        winner: challenge.winner,
        completedAt: challenge.completedAt
      }
    });

  } catch (error) {
    console.error('Error debugging challenge:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
