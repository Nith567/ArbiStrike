import { NextRequest, NextResponse } from 'next/server';
import { updateChallengeAfterCreatorPlays } from '~/lib/db';

export async function POST(
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

    const challenge = await updateChallengeAfterCreatorPlays(challengeId);
    
    if (!challenge) {
      return NextResponse.json(
        { error: 'Challenge not found or not in created status' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      challenge,
      shareUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/challenge/${challengeId}`
    });

  } catch (error) {
    console.error('Error updating challenge after creator played:', error);
    return NextResponse.json(
      { error: 'Failed to update challenge' },
      { status: 500 }
    );
  }
}
