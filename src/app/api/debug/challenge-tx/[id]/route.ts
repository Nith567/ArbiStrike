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
    
    if (!challenge) {
      return NextResponse.json(
        { error: 'Challenge not found' },
        { status: 404 }
      );
    }

    console.log(`=== CHALLENGE TX DEBUG ${challengeId} ===`);
    console.log(`Challenge status: ${challenge.status}`);
    console.log(`Challenge winner: ${challenge.winner}`);
    console.log(`Challenge transactionHash: ${challenge.transactionHash}`);
    console.log(`Challenge transactionHash type: ${typeof challenge.transactionHash}`);
    console.log(`Challenge transactionHash length: ${challenge.transactionHash?.length}`);
    console.log(`Full challenge object:`, JSON.stringify(challenge, null, 2));

    return NextResponse.json({
      challengeId,
      status: challenge.status,
      winner: challenge.winner,
      transactionHash: challenge.transactionHash,
      transactionHashType: typeof challenge.transactionHash,
      transactionHashLength: challenge.transactionHash?.length,
      hasTransactionHash: !!challenge.transactionHash,
      challenge: challenge
    });

  } catch (error) {
    console.error('Error getting challenge transaction debug:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get challenge transaction debug',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
