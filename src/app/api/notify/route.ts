import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Generate a unique UUID for the notification
    const notificationUUID = crypto.randomUUID();
    
    const notificationPayload = {
      target_fids: [1316495],
      notification: {
        title: "play the game",
        body: "play the ztype game",
        target_url: "https://frames-v2-typing-game-4l9i.vercel.app/ztype",
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
      result
    });

  } catch (error) {
    console.error('Error sending notification:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
