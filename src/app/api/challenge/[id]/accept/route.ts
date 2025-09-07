import { NextRequest, NextResponse } from 'next/server';
import { acceptChallenge } from '~/lib/db';
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const challengeId = parseInt(params.id);
    const body = await request.json();
    const { opponent, opponentFid } = body;
    
    if (isNaN(challengeId)) {
      return NextResponse.json(
        { error: 'Invalid challenge ID' },
        { status: 400 }
      );
    }
    
    if (!opponent || !opponentFid) {
      return NextResponse.json(
        { error: 'Missing required fields: opponent, opponentFid' },
        { status: 400 }
      );
    }
    
    const challenge = acceptChallenge(challengeId, opponent, opponentFid);
    
    if (!challenge) {
      return NextResponse.json(
        { error: 'Challenge not found or cannot be accepted' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      challenge
    });
    
  } catch (error) {
    console.error('Error accepting challenge:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
