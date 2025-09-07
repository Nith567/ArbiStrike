import { NextRequest, NextResponse } from 'next/server';
import { createChallenge } from '~/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { creator, creatorFid, creatorName, opponent, opponentFid, opponentName, betAmount } = body;

    if (!creator || !creatorFid || !opponent || !opponentFid || !betAmount) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const challenge = await createChallenge({
      creator,
      creatorFid,
      creatorName,
      opponent,
      opponentFid,
      opponentName,
      betAmount,
      status: 'waiting_opponent' // Changed from 'created' to 'waiting_opponent'
    });

    return NextResponse.json({
      success: true,
      challenge
    });

  } catch (error) {
    console.error('Error creating challenge:', error);
    return NextResponse.json(
      { error: 'Failed to create challenge' },
      { status: 500 }
    );
  }
}
