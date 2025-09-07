import { NextRequest, NextResponse } from 'next/server';
import { acceptChallenge, getChallengeById } from '~/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const challengeId = parseInt(params.id);
    const body = await request.json();
    const { address, fid } = body;

    if (isNaN(challengeId)) {
      return NextResponse.json(
        { error: 'Invalid challenge ID' },
        { status: 400 }
      );
    }

    if (!address || !fid) {
      return NextResponse.json(
        { error: 'Missing address or FID' },
        { status: 400 }
      );
    }

    const challenge = await acceptChallenge(challengeId, address, fid);
    
    if (!challenge) {
      return NextResponse.json(
        { error: 'Challenge not found or already accepted' },
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
      { error: 'Failed to accept challenge' },
      { status: 500 }
    );
  }
}

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
    
    const challenge = await getChallengeById(challengeId);
    
    if (!challenge) {
      return NextResponse.json(
        { error: 'Challenge not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      challenge
    });

  } catch (error) {
    console.error('Error getting challenge:', error);
    return NextResponse.json(
      { error: 'Failed to get challenge' },
      { status: 500 }
    );
  }
}
