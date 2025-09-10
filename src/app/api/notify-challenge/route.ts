import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { targetFid, challengerName, usdcAmount, challengeId, challengeUrl } = body;

    if (!targetFid || !challengerName || !usdcAmount || !challengeId || !challengeUrl) {
      return NextResponse.json(
        { error: 'Missing required fields: targetFid, challengerName, usdcAmount, challengeId, challengeUrl' },
        { status: 400 }
      );
    }

    // Generate a unique UUID for the notification
    const notificationUUID = crypto.randomUUID();
    
    const notificationPayload = {
      target_fids: [targetFid],
      notification: {
        title: "🎮 ArbiStrike Challenge!",
        body: `${challengerName} is challenging you to a typing battle for ${usdcAmount}! Can you beat the score? 🚀⌨️`,
        target_url: challengeUrl,
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
        { error: 'Failed to send notification', details: result },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      uuid: notificationUUID,
      result,
      sentTo: targetFid,
      challengerName: challengerName,
      amount: usdcAmount
    });

  } catch (error) {
    console.error('Error sending challenge notification:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
