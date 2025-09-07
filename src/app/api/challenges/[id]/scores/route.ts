import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { getChallengeById } from '~/lib/db';

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

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

    console.log('=== DEBUG: Challenge scores API ===');
    console.log('challengeId:', challengeId);
    console.log('challenge from DB:', challenge);

    // Get scores for both players
    const creatorScoreKey = `typing-game:score:${challengeId}:${challenge.creatorFid}`;
    const opponentScoreKey = `typing-game:score:${challengeId}:${challenge.opponentFid}`;
    
    const creatorScore = await redis.get(creatorScoreKey);
    const opponentScore = challenge.opponentFid ? await redis.get(opponentScoreKey) : null;

    console.log('creatorScore:', creatorScore);
    console.log('opponentScore:', opponentScore);

    return NextResponse.json({
      challenge,
      scores: {
        creator: creatorScore,
        opponent: opponentScore,
      },
    });

  } catch (error) {
    console.error('Error getting challenge scores:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
