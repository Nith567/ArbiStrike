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

    // NOW send notification to opponent since creator has played and set their score
    const challengeUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/challenge/${challengeId}`;
    
    try {
      const notificationUUID = crypto.randomUUID();
      
      const notificationPayload = {
        target_fids: [challenge.opponentFid],
        notification: {
          title: "🎮 Arbi Challenge Ready!",
          body: `${challenge.creatorName} has set their score! Ready to take the challenge? 💰 ${(parseFloat(challenge.betAmount) / 1000000).toFixed(2)} USDC at stake! ⚡🎮`,
          target_url: challengeUrl,
          uuid: notificationUUID
        }
      };

      const notificationResponse = await fetch('https://api.neynar.com/v2/farcaster/frame/notifications/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.NEYNAR_API_KEY || '<api-key>'
        },
        body: JSON.stringify(notificationPayload)
      });

      const notificationResult = await notificationResponse.json();

      return NextResponse.json({
        success: true,
        challenge,
        shareUrl: challengeUrl,
        notificationSent: notificationResponse.ok,
        notificationDetails: notificationResponse.ok ? {
          uuid: notificationUUID,
          sentTo: challenge.opponentFid,
          targetUrl: challengeUrl
        } : null,
        notificationError: notificationResponse.ok ? null : notificationResult
      });

    } catch (notificationError) {
      console.error('Failed to send notification:', notificationError);
      
      // Still return success for the challenge update, but note notification failed
      return NextResponse.json({
        success: true,
        challenge,
        shareUrl: challengeUrl,
        notificationSent: false,
        notificationError: 'Failed to send notification to opponent'
      });
    }

  } catch (error) {
    console.error('Error updating challenge after creator played:', error);
    return NextResponse.json(
      { error: 'Failed to update challenge' },
      { status: 500 }
    );
  }
}
