import { NextRequest, NextResponse } from 'next/server';
import { getChallengeById, completeChallenge } from '~/lib/db';

interface GameScore {
  challengeId: number;
  playerAddress: string;
  playerFid: number;
  score: number;
  wpm: number;
  accuracy: number;
  duration: number;
  timestamp: Date;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { challengeId, playerAddress, playerFid, score, wpm, accuracy, duration } = body;

    if (!challengeId || !playerAddress || !playerFid || score === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: challengeId, playerAddress, playerFid, score' },
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

    console.log('=== DEBUG: Score submission validation ===');
    console.log('challengeId:', challengeId);
    console.log('playerAddress:', playerAddress);
    console.log('playerFid:', playerFid);
    console.log('challenge.creator:', challenge.creator);
    console.log('challenge.creatorFid:', challenge.creatorFid);
    console.log('challenge.opponent:', challenge.opponent);
    console.log('challenge.opponentFid:', challenge.opponentFid);

    // Verify the player is part of this challenge by FID (more reliable than address)
    const isCreator = challenge.creatorFid === playerFid;
    const isOpponent = challenge.opponentFid === playerFid;
    
    console.log('isCreator (by FID):', isCreator);
    console.log('isOpponent (by FID):', isOpponent);
    
    if (!isCreator && !isOpponent) {
      console.log('VALIDATION FAILED: Player FID not part of challenge');
      return NextResponse.json(
        { error: 'Player is not part of this challenge' },
        { status: 403 }
      );
    }

    // Use the correct address from database instead of trusting submitted address
    let actualPlayerAddress = playerAddress;
    if (isCreator) {
      actualPlayerAddress = challenge.creator;
      console.log('Player is creator, using database address:', actualPlayerAddress);
    } else if (isOpponent) {
      actualPlayerAddress = challenge.opponent;
      console.log('Player is opponent, using database address:', actualPlayerAddress);
    }

    // Check if challenge allows score submission
    // Creator can play when status is 'waiting_opponent'
    // Opponent can play when status is 'accepted'
    if (isCreator && challenge.status !== 'waiting_opponent') {
      return NextResponse.json(
        { error: 'Creator can only submit score when challenge is waiting for opponent' },
        { status: 400 }
      );
    }
    
    if (isOpponent && challenge.status !== 'accepted') {
      return NextResponse.json(
        { error: 'Opponent can only submit score when challenge is accepted' },
        { status: 400 }
      );
    }

    // Create the score record
    const gameScore: GameScore = {
      challengeId,
      playerAddress: actualPlayerAddress, // Use the correct address from database
      playerFid,
      score,
      wpm,
      accuracy,
      duration,
      timestamp: new Date(),
    };

    // Save score to Redis
    const scoreKey = `typing-game:score:${challengeId}:${playerFid}`;
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    });

    await redis.set(scoreKey, gameScore);

    // Check if both players have submitted scores
    const creatorScoreKey = `typing-game:score:${challengeId}:${challenge.creatorFid}`;
    const opponentScoreKey = `typing-game:score:${challengeId}:${challenge.opponentFid}`;
    
    const creatorScore = await redis.get<GameScore>(creatorScoreKey);
    const opponentScore = await redis.get<GameScore>(opponentScoreKey);

    let winner = null;
    if (creatorScore && opponentScore) {
      // Both players have played, determine winner
      if (creatorScore.score > opponentScore.score) {
        winner = challenge.creator;
      } else if (opponentScore.score > creatorScore.score) {
        winner = challenge.opponent;
      } else {
        // Tie - use WPM as tiebreaker
        winner = creatorScore.wpm >= opponentScore.wpm ? challenge.creator : challenge.opponent;
      }

      // Complete the challenge with the winner
      if (winner) {
        await completeChallenge(challengeId, winner);
      }
    }

    return NextResponse.json({
      success: true,
      score: gameScore,
      message: winner ? `Challenge completed! Winner: ${winner}` : 'Score saved successfully',
      winner,
      challengeComplete: !!winner,
    });

  } catch (error) {
    console.error('Error saving game score:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
