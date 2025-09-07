import { NextRequest, NextResponse } from 'next/server';
import { getChallengeById } from '~/lib/db';
import { createWalletClient, http, parseAbi, encodeFunctionData } from 'viem';
import { arbitrum } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Smart contract details
const TYPING_CHALLENGE_CONTRACT = '0xD7cFbb7628D0a4df83EFf1967B6D20581f2D4382';
const PRIVATE_KEY = process.env.PRIVATE_KEY_OWNER as `0x${string}`;

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
      return NextResponse.json(
        { error: `Challenge status is ${challenge.status}, expected 'completed'` },
        { status: 400 }
      );
    }

    if (!challenge.winner) {
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
      chain: arbitrum,
      transport: http(),
    });

    // Prepare the setWinner transaction
    const setWinnerData = encodeFunctionData({
      abi: parseAbi(['function setWinner(uint256 challengeId, address winnerAddress)']),
      functionName: 'setWinner',
      args: [BigInt(challengeId), challenge.winner as `0x${string}`],
    });

    // Send the transaction
    const txHash = await walletClient.sendTransaction({
      to: TYPING_CHALLENGE_CONTRACT,
      data: setWinnerData,
      value: 0n,
    });

    console.log(`setWinner transaction sent: ${txHash}`);

    return NextResponse.json({
      success: true,
      challengeId,
      winnerAddress: challenge.winner,
      transactionHash: txHash,
      message: 'Winner set successfully on smart contract',
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
