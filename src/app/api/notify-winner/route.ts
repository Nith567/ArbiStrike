import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { winnerFid, winnerName, loserName, usdcAmount, challengeId, finalScore, opponentScore, transactionHash } = body;

    if (!winnerFid || !winnerName || !loserName || !usdcAmount || !challengeId) {
      return NextResponse.json(
        { error: 'Missing required fields: winnerFid, winnerName, loserName, usdcAmount, challengeId' },
        { status: 400 }
      );
    }

    // Generate a unique UUID for the notification
    const notificationUUID = crypto.randomUUID();
    
    // Use transaction hash URL if available, otherwise fallback to challenge URL
    const targetUrl =`${process.env.NEXT_PUBLIC_URL}/challenge/${challengeId}`;
    
    const notificationPayload = {
      target_fids: [winnerFid],
      notification: {
        title: "🏆 ArbiStrike Winner!",
        body: `You defeated ${loserName} and won ${usdcAmount}! ${finalScore ? `Score: ${finalScore}${opponentScore ? ` vs ${opponentScore}` : ''}` : ''} 🎉`,
        target_url: targetUrl,
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
        { error: 'Failed to send winner notification', details: result },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      uuid: notificationUUID,
      result,
      sentTo: winnerFid,
      winnerName: winnerName,
      amount: usdcAmount,
      transactionHash: transactionHash || null,
      targetUrl: targetUrl,
      message: `Winner notification sent to ${winnerName} (FID: ${winnerFid})${transactionHash ? ' with transaction link' : ''}`
    });

  } catch (error) {
    console.error('Error sending winner notification:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
