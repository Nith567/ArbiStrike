import { NextRequest, NextResponse } from 'next/server';
import { formatUnits } from 'viem';
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

    // Check if this is the creator's first score submission
    const creatorScoreKey = `typing-game:score:${challengeId}:${challenge.creatorFid}`;
    const opponentScoreKey = `typing-game:score:${challengeId}:${challenge.opponentFid}`;
    const existingCreatorScore = await redis.get<GameScore>(creatorScoreKey);
    const shouldNotifyOpponent = isCreator && !existingCreatorScore && challenge.status === 'waiting_opponent';

    await redis.set(scoreKey, gameScore);

    // If this is the creator submitting their first score, notify the opponent
    if (shouldNotifyOpponent) {
      try {
        console.log(`Creator submitted score, notifying opponent (FID: ${challenge.opponentFid})`);
        const notifyResponse = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/notify-challenge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetFid: challenge.opponentFid,
            challengerName: challenge.creatorName || 'Unknown',
            usdcAmount: `${formatUnits(BigInt(challenge.betAmount), 6)} USDC`,
            challengeId,
            challengeUrl: `${process.env.NEXT_PUBLIC_URL}/challenge/${challengeId}`
          }),
        });

        if (notifyResponse.ok) {
          console.log('Challenge notification sent to opponent successfully');
        } else {
          console.error('Failed to send challenge notification:', await notifyResponse.text());
        }
      } catch (notifyError) {
        console.error('Error sending challenge notification:', notifyError);
        // Don't fail the score submission if notification fails
      }
    }

    // Check if both players have submitted scores
    const creatorScore = await redis.get<GameScore>(creatorScoreKey);
    const opponentScore = await redis.get<GameScore>(opponentScoreKey);

    let winner = null;
    // Only determine winner if both players have played AND challenge is accepted
    if (creatorScore && opponentScore && challenge.status === 'accepted') {
      console.log('Both players have played and challenge is accepted. Determining winner...');
      // Both players have played, determine winner
      if (creatorScore.score > opponentScore.score) {
        winner = challenge.creator;
        console.log(`Creator wins by score: ${creatorScore.score} > ${opponentScore.score}`);
      } else if (opponentScore.score > creatorScore.score) {
        winner = challenge.opponent;
        console.log(`Opponent wins by score: ${opponentScore.score} > ${creatorScore.score}`);
      } else {
        // Tie - use WPM as tiebreaker
        winner = creatorScore.wpm >= opponentScore.wpm ? challenge.creator : challenge.opponent;
        console.log(`Tie game! Winner by WPM: ${winner} (Creator WPM: ${creatorScore.wpm}, Opponent WPM: ${opponentScore.wpm})`);
      }

      // Complete the challenge with the winner
      if (winner) {
        await completeChallenge(challengeId, winner);
        
        // Determine winner details for notification
        const isCreatorWinner = winner === challenge.creator;
        const winnerFid = isCreatorWinner ? challenge.creatorFid : challenge.opponentFid;
        const winnerName = isCreatorWinner ? challenge.creatorName : challenge.opponentName;
        const loserName = isCreatorWinner ? challenge.opponentName : challenge.creatorName;
        const winnerScore = isCreatorWinner ? creatorScore.score : opponentScore.score;
        const loserScore = isCreatorWinner ? opponentScore.score : creatorScore.score;
        
        // Automatically call smart contract to set winner
        let transactionHash = null;
        try {
          console.log(`Attempting to set winner on smart contract for challenge ${challengeId}`);
          const setWinnerResponse = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/challenges/${challengeId}/set-winner`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          
          if (setWinnerResponse.ok) {
            const result = await setWinnerResponse.json();
            transactionHash = result.transactionHash;
            console.log(`Smart contract setWinner successful:`, result);
          } else {
            console.error(`Smart contract setWinner failed:`, await setWinnerResponse.text());
          }
        } catch (smartContractError) {
          console.error('Error calling smart contract setWinner:', smartContractError);
          // Don't fail the score submission if smart contract call fails
        }

        // Send winner notification
        try {
          console.log(`Sending winner notification to FID ${winnerFid}`);
          const notifyWinnerResponse = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/notify-winner`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              winnerFid,
              winnerName: winnerName || 'Unknown',
              loserName: loserName || 'Unknown',
              usdcAmount: `${formatUnits(BigInt(challenge.betAmount), 6)} USDC`,
              challengeId,
              finalScore: winnerScore,
              opponentScore: loserScore,
              transactionHash
            }),
          });

          if (notifyWinnerResponse.ok) {
            const notifyResult = await notifyWinnerResponse.json();
            console.log(`Winner notification sent successfully:`, notifyResult);
          } else {
            console.error(`Winner notification failed:`, await notifyWinnerResponse.text());
          }
        } catch (notifyError) {
          console.error('Error sending winner notification:', notifyError);
          // Don't fail the score submission if notification fails
        }

        // Send loser notification
        try {
          const loserFid = isCreatorWinner ? challenge.opponentFid : challenge.creatorFid;
          console.log(`Sending loser notification to FID ${loserFid}`);
          const notifyLoserResponse = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/notify-loser`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              loserFid,
              loserName: loserName || 'Unknown',
              winnerName: winnerName || 'Unknown',
              usdcAmount: `${formatUnits(BigInt(challenge.betAmount), 6)} USDC`,
              challengeId,
              loserScore: loserScore,
              winnerScore: winnerScore
            }),
          });

          if (notifyLoserResponse.ok) {
            const notifyResult = await notifyLoserResponse.json();
            console.log(`Loser notification sent successfully:`, notifyResult);
          } else {
            console.error(`Loser notification failed:`, await notifyLoserResponse.text());
          }
        } catch (notifyError) {
          console.error('Error sending loser notification:', notifyError);
          // Don't fail the score submission if notification fails
        }
      }
    } else if (creatorScore && opponentScore && challenge.status !== 'accepted') {
      console.log(`WARNING: Both players have scores but challenge status is '${challenge.status}', not 'accepted'. Winner will not be determined yet.`);
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
