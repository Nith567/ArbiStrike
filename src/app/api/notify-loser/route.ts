import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { loserFid, loserName, winnerName, usdcAmount, challengeId, loserScore, winnerScore } = body;

    if (!loserFid || !loserName || !winnerName || !usdcAmount || !challengeId) {
      return NextResponse.json(
        { error: 'Missing required fields: loserFid, loserName, winnerName, usdcAmount, challengeId' },
        { status: 400 }
      );
    }

    // Generate a unique UUID for the notification
    const notificationUUID = crypto.randomUUID();
    
    const notificationPayload = {
      target_fids: [loserFid],
      notification: {
        title: "😔 ArbiStrike Challenge - You Lost",
        body: `You lost to ${winnerName} and he won ${usdcAmount}. ${loserScore !== undefined && winnerScore !== undefined ? `Your score: ${loserScore} vs ${winnerName}'s score: ${winnerScore}` : ''} Better luck next time! 💪`,
        target_url: `${process.env.NEXT_PUBLIC_URL}/challenge/${challengeId}`,
        uuid: notificationUUID
      }
    };

    const response = await fetch('https://api.neynar.com/v2/farcaster/frame/notifications/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.NEYNAR_API_KEY || '<api-key>'
      },
      body: JSON.stringify(notificationPayload)
    });

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to send loser notification', details: result },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      uuid: notificationUUID,
      result,
      sentTo: loserFid,
      loserName: loserName,
      amount: usdcAmount,
      message: `Loser notification sent to ${loserName} (FID: ${loserFid})`
    });

  } catch (error) {
    console.error('Error sending loser notification:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
