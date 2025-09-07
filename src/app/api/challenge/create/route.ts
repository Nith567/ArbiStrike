import { NextRequest, NextResponse } from 'next/server';
import { createChallenge } from '~/lib/db';
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { creator, creatorFid, betAmount } = body;
    
    if (!creator || !creatorFid || !betAmount) {
      return NextResponse.json(
        { error: 'Missing required fields: creator, creatorFid, betAmount' },
        { status: 400 }
      );
    }
    
    const challenge = createChallenge({
      creator,
      creatorFid,
      betAmount,
      status: 'pending'
    });
    
    return NextResponse.json({
      success: true,
      challengeId: challenge.id,
      challenge
    });
    
  } catch (error) {
    console.error('Error creating challenge:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
