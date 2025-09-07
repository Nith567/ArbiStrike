"use client"

import { useEffect, useState, useCallback } from 'react';
import { useAccount, useWalletClient, useSwitchChain } from 'wagmi';
import { arbitrum } from 'wagmi/chains';
import { encodeFunctionData, parseAbi } from 'viem';
import sdk, { type Context } from "@farcaster/miniapp-sdk";
import { Button } from '~/components/ui/Button';
import { truncateAddress } from '~/lib/truncateAddress';

interface Challenge {
  id: number;
  creator: string;
  creatorFid: number;
  creatorName?: string;
  opponent?: string;
  opponentFid?: number;
  opponentName?: string;
  betAmount: string;
  status: 'created' | 'waiting_opponent' | 'accepted' | 'completed';
  winner?: string;
  createdAt: Date;
  acceptedAt?: Date;
  completedAt?: Date;
}

interface ChallengeAcceptPageProps {
  challengeId: string;
}

export default function ChallengeAcceptPage({ challengeId }: ChallengeAcceptPageProps) {
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<Context.MiniAppContext>();
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptResult, setAcceptResult] = useState<string | null>(null);
  const [isSDKLoaded, setIsSDKLoaded] = useState(false);

  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { switchChain } = useSwitchChain();

  // Load Farcaster context
  useEffect(() => {
    const loadContext = async () => {
      try {
        const ctx = await sdk.context;
        setContext(ctx);
        
        // Set up SDK ready
        sdk.actions.ready({});
      } catch (error) {
        console.error('Failed to load Farcaster context:', error);
      }
    };

    if (sdk && !isSDKLoaded) {
      setIsSDKLoaded(true);
      loadContext();
      return () => {
        sdk.removeAllListeners();
      };
    }
  }, [isSDKLoaded]);

  // Load challenge data
  useEffect(() => {
    const loadChallenge = async () => {
      try {
        const response = await fetch(`/api/challenges/${challengeId}/scores`);
        if (response.ok) {
          const data = await response.json();
          setChallenge(data.challenge);
        } else {
          setError('Challenge not found');
        }
      } catch (err) {
        setError('Failed to load challenge');
      } finally {
        setLoading(false);
      }
    };

    if (challengeId) {
      loadChallenge();
    }
  }, [challengeId]);

  const handleAcceptChallenge = useCallback(async () => {
    if (!walletClient || !address || !challenge || !context) {
      setAcceptResult('Missing wallet, address, challenge, or context');
      return;
    }

    setIsAccepting(true);
    setAcceptResult('');

    try {
      // Switch to Arbitrum
      await switchChain({ chainId: arbitrum.id });

      const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
      const TYPING_CHALLENGE_CONTRACT = '0xD7cFbb7628D0a4df83EFf1967B6D20581f2D4382';

      // First update challenge in our database
      const dbResponse = await fetch(`/api/challenges/${challengeId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: address,
          fid: context.user.fid,
        }),
      });

      if (!dbResponse.ok) {
        throw new Error('Failed to accept challenge in database');
      }

      // Prepare USDC approve transaction
      const approveData = encodeFunctionData({
        abi: parseAbi(['function approve(address spender, uint256 value) returns (bool)']),
        functionName: 'approve',
        args: [TYPING_CHALLENGE_CONTRACT, BigInt(challenge.betAmount)],
      });

      // Prepare acceptChallenge transaction
      const acceptChallengeData = encodeFunctionData({
        abi: parseAbi(['function acceptChallenge(uint256 challengeId)']),
        functionName: 'acceptChallenge',
        args: [BigInt(challenge.id)],
      });

      // Send batch transaction
      const { id } = await walletClient.sendCalls({
        account: address as `0x${string}`,
        chain: arbitrum,
        calls: [
          {
            to: ARBITRUM_USDC as `0x${string}`,
            value: 0n,
            data: approveData,
          },
          {
            to: TYPING_CHALLENGE_CONTRACT as `0x${string}`,
            value: 0n,
            data: acceptChallengeData,
          },
        ],
      });

      // Wait for transaction completion
      const result = await walletClient.waitForCallsStatus({
        id,
        pollingInterval: 1000,
      });

      if (result.status === 'success') {
        setAcceptResult(`Challenge accepted successfully! You can now play the game.`);
        // Update local state
        setChallenge(prev => prev ? { ...prev, status: 'accepted', opponent: address, opponentFid: context.user.fid } : null);
      } else {
        setAcceptResult('Transaction failed or pending');
      }

    } catch (error) {
      setAcceptResult(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsAccepting(false);
    }
  }, [walletClient, address, challenge, context, challengeId, switchChain]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="text-center">
          <div className="text-2xl">🎮</div>
          <div className="mt-2">Loading challenge...</div>
        </div>
      </div>
    );
  }

  if (error || !challenge) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-500">Challenge Not Found</h1>
          <p className="text-gray-400 mt-2">{error || 'This challenge does not exist.'}</p>
          <Button 
            onClick={() => window.location.href = '/'}
            className="mt-4"
          >
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-md mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">⚔️ Typing Challenge</h1>
          <p className="text-gray-400">Challenge #{challenge.id}</p>
        </div>

        {/* Challenge Details */}
        <div className="bg-gray-900 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Challenge Details</h2>
          
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Creator:</span>
              <span className="font-mono">
                {challenge.creatorName ? `${challenge.creatorName} (${truncateAddress(challenge.creator)})` : truncateAddress(challenge.creator)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Creator FID:</span>
              <span>{challenge.creatorFid}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Bet Amount:</span>
              <span className="font-bold text-green-400">
                {(parseInt(challenge.betAmount) / 1000000).toFixed(6)} USDC
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Status:</span>
              <span className={`font-medium ${
                challenge.status === 'created' ? 'text-blue-400' :
                challenge.status === 'waiting_opponent' ? 'text-yellow-400' :
                challenge.status === 'accepted' ? 'text-blue-400' : 'text-green-400'
              }`}>
                {challenge.status.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-4">
          {challenge.status === 'created' && (
            <div className="text-center">
              <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded mb-4">
                <div className="text-blue-400 font-medium mb-2">⏳ Challenge Created</div>
                <div className="text-sm text-blue-300">
                  {challenge.creatorName || 'The creator'} needs to play first to set their score. Please wait for them to complete their game.
                </div>
              </div>
            </div>
          )}

          {challenge.status === 'waiting_opponent' && (
            <>
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded mb-4">
                <div className="text-yellow-400 font-medium mb-2">🎯 Ready to Accept!</div>
                <div className="text-sm text-yellow-300">
                  {challenge.creatorName || 'The challenger'} has set their score. You can now accept this challenge and show your typing skills!
                </div>
              </div>
              {!isConnected ? (
                <div className="text-center">
                  <p className="text-gray-400 mb-4">Connect your wallet to accept this challenge</p>
                  <Button className="w-full">
                    Connect Wallet
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={handleAcceptChallenge}
                  disabled={isAccepting}
                  isLoading={isAccepting}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  {isAccepting ? 'Accepting Challenge...' : 'Accept Challenge & Bet USDC'}
                </Button>
              )}
            </>
          )}

          {challenge.status === 'accepted' && (
            <Button
              onClick={() => window.location.href = `/ztype?challengeId=${challenge.id}&role=opponent`}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              🚀 Play Challenge Game
            </Button>
          )}

          {challenge.status === 'completed' && (
            <div className="text-center">
              <div className="text-2xl mb-2">🏆</div>
              <p className="text-green-400 font-bold">Challenge Completed!</p>
              <p className="text-gray-400">
                Winner: {challenge.winner ? truncateAddress(challenge.winner) : 'Unknown'}
              </p>
            </div>
          )}

          {/* Result Message */}
          {acceptResult && (
            <div className={`p-3 rounded text-sm ${
              acceptResult.includes('successfully')
                ? 'bg-green-900 text-green-300'
                : 'bg-red-900 text-red-300'
            }`}>
              {acceptResult}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="mt-8 text-center">
          <Button
            onClick={() => window.location.href = '/'}
            className="bg-gray-700 hover:bg-gray-600"
          >
            ← Back to Home
          </Button>
        </div>
      </div>
    </div>
  );
}
