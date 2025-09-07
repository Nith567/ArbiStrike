import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    
    if (!query || query.length < 2) {
      return NextResponse.json({ users: [] });
    }

    // Mock Neynar API call (replace with actual API call)
    const response = await fetch(`https://api.neynar.com/v2/farcaster/user/search?q=${encodeURIComponent(query)}&limit=10`, {
      headers: {
        'api_key': process.env.NEYNAR_API_KEY || '',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to search users');
    }

    const data = await response.json();
    
    return NextResponse.json({
      users: data.result?.users || []
    });

  } catch (error) {
    console.error('Error searching users:', error);
    return NextResponse.json(
      { error: 'Failed to search users' },
      { status: 500 }
    );
  }
}
