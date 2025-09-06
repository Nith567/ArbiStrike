import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const challengeId = params.id;
    const challengeIdNumber = parseInt(challengeId);
    
    // If challenge ID is even, use the first address, otherwise use the second
    const winnerAddress = (challengeIdNumber % 2 === 0) 
      ? '0x8A0d290b2EE35eFde47810CA8fF057e109e4190B'
      : '0x05Cc73A14C1D667a2dA5cc067c692A012EC7dC16';
    
    return NextResponse.json({
      challengeId: challengeId,
      winnerAddress: winnerAddress,
      status: 'completed'
    });

  } catch (error) {
    console.error('Error getting challenge winner:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
