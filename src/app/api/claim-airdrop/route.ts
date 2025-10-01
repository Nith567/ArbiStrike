import { NextRequest, NextResponse } from 'next/server';
import { createWalletClient, http, parseUnits, encodeFunctionData, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

export async function POST(request: NextRequest) {
  try {
    const { recipientAddress } = await request.json();

    if (!recipientAddress) {
      return NextResponse.json({ error: 'Recipient address is required' }, { status: 400 });
    }

    // Validate address format
    if (!recipientAddress.startsWith('0x') || recipientAddress.length !== 42) {
      return NextResponse.json({ error: 'Invalid recipient address format' }, { status: 400 });
    }

    // Get private key from environment (server-side only)
    const PRIVATE_KEY = process.env.PRIVATE_KEY_OWNER;
    if (!PRIVATE_KEY) {
      console.error('PRIVATE_KEY not found in environment variables');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Create wallet client with your private key
    const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(),
    });

    // Contract addresses
    const TYPING_CHALLENGE_CONTRACT = '0xBACa4C4EC8E63c306D57432bC647d9A84C50a70F';

    // Prepare claimAirdrop transaction data
    const claimData = encodeFunctionData({
      abi: parseAbi(['function claimAirdrop() external']),
      functionName: 'claimAirdrop',
      args: [],
    });

    // Send transaction from your server wallet
    const txHash = await walletClient.sendTransaction({
      to: TYPING_CHALLENGE_CONTRACT as `0x${string}`,
      data: claimData,
      value: 0n,
    });

    return NextResponse.json({ 
      success: true, 
      txHash,
      message: 'Airdrop sent successfully!'
    });

  } catch (error: any) {
    console.error('Airdrop API error:', error);
    
    // Handle specific errors
    if (error?.message?.includes('cooldown')) {
      return NextResponse.json({ 
        error: 'Airdrop cooldown not met (24 hours required)' 
      }, { status: 400 });
    }
    
    if (error?.message?.includes('insufficient funds')) {
      return NextResponse.json({ 
        error: 'Server wallet has insufficient funds' 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      error: error?.message || 'Airdrop failed' 
    }, { status: 500 });
  }
}
