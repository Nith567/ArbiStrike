import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const challengeId = params.id;
    
    console.log(`=== MANUAL SET-WINNER TEST ===`);
    console.log(`Testing set-winner API for challenge ${challengeId}`);
    
    const setWinnerResponse = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/challenges/${challengeId}/set-winner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    
    console.log(`Response status: ${setWinnerResponse.status}`);
    
    if (setWinnerResponse.ok) {
      const result = await setWinnerResponse.json();
      console.log(`SUCCESS - Full response:`, JSON.stringify(result, null, 2));
      
      return NextResponse.json({
        success: true,
        status: setWinnerResponse.status,
        response: result,
        transactionHash: result.transactionHash,
        transactionHashType: typeof result.transactionHash,
        message: 'Test completed successfully'
      });
    } else {
      const errorText = await setWinnerResponse.text();
      console.log(`ERROR - Response:`, errorText);
      
      return NextResponse.json({
        success: false,
        status: setWinnerResponse.status,
        error: errorText,
        message: 'Test failed'
      });
    }

  } catch (error) {
    console.error('Error testing set-winner API:', error);
    return NextResponse.json(
      { 
        error: 'Test failed with exception',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
