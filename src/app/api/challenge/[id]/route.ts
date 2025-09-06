import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const challengeId = params.id;
    
    // For now, hardcoded winner address for challenge ID 1
    if (challengeId === '1') {
      return NextResponse.json({
        challengeId: challengeId,
        winnerAddress: '0x05Cc73A14C1D667a2dA5cc067c692A012EC7dC16',
        status: 'completed'
      });
    }
    
    // For other challenge IDs, return not found
    return NextResponse.json(
      { error: 'Challenge not found' },
      { status: 404 }
    );

  } catch (error) {
    console.error('Error getting challenge winner:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
