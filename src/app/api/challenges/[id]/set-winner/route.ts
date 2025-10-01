import { NextRequest, NextResponse } from 'next/server';
import { getChallengeById, completeChallenge } from '~/lib/db';
import { createWalletClient, http, parseAbi, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Smart contract details
const TYPING_CHALLENGE_CONTRACT = '0xBACa4C4EC8E63c306D57432bC647d9A84C50a70F';
const PRIVATE_KEY = process.env.PRIVATE_KEY_OWNER as `0x${string}`;

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const challengeId = parseInt(params.id);
    console.log(`=== SET WINNER API DEBUG ===`);
    console.log(`Raw challenge ID: ${params.id}`);
    console.log(`Parsed challenge ID: ${challengeId}`);
    
    if (isNaN(challengeId)) {
      console.log(`ERROR: Invalid challenge ID - cannot parse "${params.id}" as integer`);
      return NextResponse.json(
        { error: 'Invalid challenge ID' },
        { status: 400 }
      );
    }

    // Get the challenge from database
    const challenge = await getChallengeById(challengeId);
    console.log(`Challenge from database:`, challenge);
    
    if (!challenge) {
      console.log(`ERROR: Challenge ${challengeId} not found in database`);
      return NextResponse.json(
        { error: 'Challenge not found' },
        { status: 404 }
      );
    }

    // Check if challenge is completed and has a winner
    // Allow both 'completed' status OR if challenge has a winner (in case it was marked completed but smart contract failed)
    if (challenge.status !== 'completed' && !challenge.winner) {
      console.log(`ERROR: Challenge status is "${challenge.status}" and winner is "${challenge.winner}". Need either completed status or winner address.`);
      return NextResponse.json(
        { error: `Challenge status is ${challenge.status} and no winner. Expected 'completed' status or winner address.` },
        { status: 400 }
      );
    }

    if (!challenge.winner) {
      console.log(`ERROR: Challenge has no winner address. Winner field:`, challenge.winner);
      return NextResponse.json(
        { error: 'Challenge has no winner address' },
        { status: 400 }
      );
    }

    // Check if we have the private key
    if (!PRIVATE_KEY) {
      return NextResponse.json(
        { error: 'Private key not configured' },
        { status: 500 }
      );
    }

    console.log(`Setting winner for challenge ${challengeId}: ${challenge.winner}`);

    // Create wallet client with the owner's private key
    const account = privateKeyToAccount(PRIVATE_KEY);
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(),
    });

    // Prepare the setWinner transaction
    const setWinnerData = encodeFunctionData({
      abi: parseAbi(['function setWinner(uint256 challengeId, address winnerAddress)']),
      functionName: 'setWinner',
      args: [BigInt(challengeId), challenge.winner as `0x${string}`],
    });

    // Send the transaction
    console.log(`Sending setWinner transaction to contract: ${TYPING_CHALLENGE_CONTRACT}`);
    console.log(`Transaction data:`, setWinnerData);
    
    const txHash = await walletClient.sendTransaction({
      to: TYPING_CHALLENGE_CONTRACT,
      data: setWinnerData,
      value: 0n,
    });

    console.log(`=== TRANSACTION HASH DEBUG ===`);
    console.log(`txHash type:`, typeof txHash);
    console.log(`txHash value:`, txHash);
    console.log(`txHash stringified:`, JSON.stringify(txHash));
    console.log(`Is txHash a string?:`, typeof txHash === 'string');
    console.log(`txHash length:`, txHash?.length);


    console.log(`Saving transaction hash to database: ${txHash}`);
    const updatedChallenge = await completeChallenge(challengeId, challenge.winner, txHash);
    console.log(`Challenge updated with transaction hash:`, updatedChallenge?.transactionHash);

    return NextResponse.json({
      success: true,
      challengeId,
      winnerAddress: challenge.winner,
      transactionHash: txHash,
      transactionHashType: typeof txHash,
      databaseUpdated: !!updatedChallenge,
      message: 'Winner set successfully on smart contract and saved to database',
    });

  } catch (error) {
    console.error('Error setting winner on smart contract:', error);
    return NextResponse.json(
      { 
        error: 'Failed to set winner on smart contract',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// GET request for testing/debugging from browser
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const challengeId = parseInt(params.id);
    console.log(`=== SET WINNER GET REQUEST DEBUG ===`);
    console.log(`Testing set-winner for challenge ID: ${challengeId}`);
    
    if (isNaN(challengeId)) {
      return NextResponse.json(
        { error: 'Invalid challenge ID' },
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

    // Check if challenge is completed and has a winner
    if (challenge.status !== 'completed') {
      return NextResponse.json({
        error: `Challenge status is ${challenge.status}, expected 'completed'`,
        challenge: {
          id: challenge.id,
          status: challenge.status,
          winner: challenge.winner,
          hasTransactionHash: !!challenge.transactionHash
        }
      }, { status: 400 });
    }

    if (!challenge.winner) {
      return NextResponse.json({
        error: 'Challenge has no winner address',
        challenge: {
          id: challenge.id,
          status: challenge.status,
          winner: challenge.winner
        }
      }, { status: 400 });
    }

    // Check if we have the private key
    if (!PRIVATE_KEY) {
      return NextResponse.json(
        { error: 'Private key not configured' },
        { status: 500 }
      );
    }

    // For GET request, just return what would happen without actually sending transaction
    return NextResponse.json({
      message: 'GET request - would call setWinner for this challenge',
      challenge: {
        id: challenge.id,
        status: challenge.status,
        winner: challenge.winner,
        transactionHash: challenge.transactionHash,
        hasTransactionHash: !!challenge.transactionHash
      },
      wouldSendTransaction: {
        to: TYPING_CHALLENGE_CONTRACT,
        function: 'setWinner',
        args: [challengeId, challenge.winner]
      },
      instructions: `To actually send transaction, use POST request to this same endpoint`
    });

  } catch (error) {
    console.error('Error in GET set-winner:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process GET request',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
