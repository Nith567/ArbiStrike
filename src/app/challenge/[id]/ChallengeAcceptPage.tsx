"use client"

import { useEffect, useState, useCallback } from 'react';
import { useAccount, useWalletClient, useSwitchChain, useConnect } from 'wagmi';
import { arbitrum } from 'wagmi/chains';
import { encodeFunctionData, parseAbi, formatUnits } from 'viem';
import sdk, { type Context } from "@farcaster/miniapp-sdk";
import { Button } from '~/components/ui/Button';
import { truncateAddress } from '~/lib/truncateAddress';
import { config } from "~/components/providers/WagmiProvider";

interface Challenge {
  id: number;
  creator: string;
  creatorFid: number;
  creatorName?: string;
  creatorPfp?: string;
  opponent?: string;
  opponentFid?: number;
  opponentName?: string;
  opponentPfp?: string;
  betAmount: string;
  status: 'created' | 'waiting_opponent' | 'accepted' | 'completed';
  winner?: string;
  transactionHash?: string;
  createdAt: Date;
  acceptedAt?: Date;
  completedAt?: Date;
}

interface ChallengeAcceptPageProps {
  challenge: Challenge;
}

export default function ChallengeAcceptPage({ challenge: initialChallenge }: ChallengeAcceptPageProps) {
  const [challenge, setChallenge] = useState<Challenge | null>(initialChallenge);
  const [loading, setLoading] = useState(false); // Start with false since we have initial data
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<Context.MiniAppContext>();
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptResult, setAcceptResult] = useState<string | null>(null);
  const [isSDKLoaded, setIsSDKLoaded] = useState(false);

  const { address, isConnected } = useAccount();
  const { data: walletClient, isLoading: isWalletClientLoading } = useWalletClient();
  const { switchChain } = useSwitchChain();
  const { connect } = useConnect();

  // Load Farcaster context
  useEffect(() => {
    const load = async () => {
      try {
        const ctx = await sdk.context;
        setContext(ctx);
        
        // Set up SDK ready
        sdk.actions.ready({});
        setIsSDKLoaded(true);
      } catch (error) {
        console.error('Failed to load Farcaster context:', error);
        // Still set SDK as loaded even if context fails, so page can continue
        setIsSDKLoaded(true);
      }
    };

    if (sdk && !isSDKLoaded) {
      load();
      return () => {
        sdk.removeAllListeners();
      };
    }
  }, [isSDKLoaded]);

  // Auto-connect wallet if not connected and SDK is loaded
  useEffect(() => {
    const autoConnect = async () => {
      if (isSDKLoaded && !isConnected && config.connectors.length > 0) {
        try {
          await connect({ 
            chainId: arbitrum.id,
            connector: config.connectors[0] 
          });
        } catch (error) {
          console.log("Auto-connect failed:", error);
        }
      }
    };
    
    autoConnect();
  }, [isSDKLoaded, isConnected, connect]);

  // Load challenge data (refresh from server)
  useEffect(() => {
    const loadChallenge = async () => {
      if (!challenge) return;
      
      try {
        setLoading(true);
        const response = await fetch(`/api/challenges/${challenge.id}/scores`);
        if (response.ok) {
          const data = await response.json();
          setChallenge(data.challenge);
        } else {
          setError('Failed to refresh challenge data');
        }
      } catch (err) {
        setError('Failed to load challenge');
      } finally {
        setLoading(false);
      }
    };

    // Only refresh challenge after SDK is ready and we have initial challenge
    if (challenge && isSDKLoaded) {
      loadChallenge();
    }
  }, [challenge?.id, isSDKLoaded]);

  const handleAcceptChallenge = useCallback(async () => {
    if (!isConnected || !address) {
      setAcceptResult('Please connect your wallet first to accept this challenge.');
      return;
    }
    
    if (!walletClient) {
      setAcceptResult('Wallet client not available. Please refresh and try again.');
      return;
    }
    
    if (!challenge) {
      setAcceptResult('Challenge data not available. Please refresh the page and try again.');
      return;
    }
    
    if (!context) {
      setAcceptResult('Farcaster context not loaded. Please refresh the page and try again.');
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
      const dbResponse = await fetch(`/api/challenges/${challenge.id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: address,
          fid: context.user.fid,
        }),
      });

      if (!dbResponse.ok) {
        throw new Error('Failed to accept challenge, pls refresh and try again');
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
  }, [walletClient, address, challenge, context, switchChain, isConnected]);

  if (!isSDKLoaded || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-bounce">🎮</div>
          <div className="text-xl font-semibold mb-2">
            {!isSDKLoaded ? 'Preparing your challenge...' : 'Loading challenge details...'}
          </div>
          <div className="text-gray-300">
            Please wait a moment
          </div>
        </div>
      </div>
    );
  }

  if (error || !challenge) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="text-center">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="text-2xl font-bold text-red-400 mb-2">Challenge Not Found</h1>
          <p className="text-gray-300 mt-2 mb-6">{error || 'This challenge does not exist or has been removed.'}</p>
          <Button 
            onClick={() => window.location.href = '/'}
            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
          >
            🏠 Go Home
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
          <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">⚔️ Typing Challenge</h1>
          <p className="text-gray-300">Challenge #{challenge.id}</p>
        </div>

        {/* Debug Info (remove in production) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="bg-gray-900/70 backdrop-blur-sm rounded-lg p-4 mb-6 text-xs border border-gray-600">
            <h3 className="text-yellow-400 mb-2">Debug Info:</h3>
            <div>isConnected: {String(isConnected)}</div>
            <div>address: {address || 'null'}</div>
            <div>walletClient: {walletClient ? 'available' : 'null'}</div>
            <div>isWalletClientLoading: {String(isWalletClientLoading)}</div>
            <div>context: {context ? 'available' : 'null'}</div>
            <div>challenge: {challenge ? 'available' : 'null'}</div>
            <div>isSDKLoaded: {String(isSDKLoaded)}</div>
          </div>
        )}

        {/* Challenge Details */}
        <div className="bg-gray-900/50 backdrop-blur-sm rounded-lg p-6 mb-6 border border-gray-600">
          <h2 className="text-xl font-semibold mb-4 text-white">Your Opponent</h2>
          
          <div className="space-y-4 text-sm">
            <div>
              <span className="text-gray-300 block mb-2">Creator:</span>
              <div className="flex items-center space-x-3">
                {challenge.creatorPfp && (
                  <img
                    src={challenge.creatorPfp}
                    alt={challenge.creatorName || 'Creator'}
                    className="w-10 h-10 rounded-full border-2 border-purple-400"
                  />
                )}
                <div>
                  <div className="font-medium text-white">
                    {challenge.creatorName || 'Unknown'}
                  </div>
                  <div className="text-gray-300 font-mono text-xs">
                    {truncateAddress(challenge.creator)}
                  </div>
                  <div className="text-gray-400 text-xs">
                    FID: {challenge.creatorFid}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-300">Bet Amount:</span>
              <span className="font-bold text-green-400">
                {formatUnits(BigInt(challenge.betAmount), 6)} USDC
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-300">Status:</span>
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
              <div className="p-4 bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30 rounded-lg mb-4 backdrop-blur-sm">
                <div className="text-blue-400 font-medium mb-2">⏳ Challenge Created</div>
                <div className="text-sm text-blue-300">
                  {challenge.creatorName || 'The creator'} needs to play first to set their score. Please wait for them to complete their game.
                </div>
              </div>
            </div>
          )}

          {challenge.status === 'waiting_opponent' && (
            <>
              <div className="p-4 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 rounded-lg mb-4 backdrop-blur-sm">
                <div className="text-yellow-400 font-medium mb-2">🎯 Ready to Accept!</div>
                <div className="text-sm text-yellow-300">
                  {challenge.creatorName || 'The challenger'} has set their score. You can now accept this challenge and show your typing skills!
                </div>
              </div>
              {!isConnected ? (
                <div className="text-center">
                  <p className="text-gray-300 mb-4">
                    🔗 Connect your wallet to accept this challenge
                  </p>
                  <Button 
                    onClick={() => connect({ connector: config.connectors[0] })}
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                  >
                    🔗 Connect Wallet
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={handleAcceptChallenge}
                  disabled={isAccepting || isWalletClientLoading}
                  isLoading={isAccepting}
                  className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                >
                  {isAccepting 
                    ? '⏳ Accepting Challenge...' 
                    : isWalletClientLoading
                      ? '⏳ Loading Wallet...'
                      : '✅ Accept Challenge & Bet USDC'
                  }
                </Button>
              )}
            </>
          )}

          {challenge.status === 'accepted' && (
            <Button
              onClick={() => window.location.href = `/ztype?challengeId=${challenge.id}&role=opponent`}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              🚀 Play Challenge Game
            </Button>
          )}

          {challenge.status === 'completed' && (
            <div className="text-center bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 rounded-lg p-6 backdrop-blur-sm">
              <div className="text-4xl mb-4">🏆</div>
              <p className="text-green-400 font-bold text-lg mb-2">Challenge Completed!</p>
              <div className="space-y-3">
                <p className="text-gray-300">
                  Winner: {(() => {
                    if (challenge.winner === challenge.creator) {
                      return challenge.creatorName || 'Creator';
                    } else if (challenge.winner === challenge.opponent) {
                      return challenge.opponentName || 'Opponent';
                    }
                    return 'Unknown';
                  })()}
                </p>
                {challenge.transactionHash && (
                  <div className="mt-4">
                    <p className="text-gray-400 text-sm mb-2">Prize Payment:</p>
                    <a
                      href={`https://arbiscan.io/tx/${challenge.transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded-lg text-blue-300 hover:text-blue-200 transition-all duration-200 text-sm"
                    >
                      <span>�</span>
                      <span>View Payment Transaction</span>
                      <span className="text-xs opacity-75">↗</span>
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Result Message */}
          {acceptResult && (
            <div className={`p-3 rounded-lg text-sm backdrop-blur-sm ${
              acceptResult.includes('successfully')
                ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                : 'bg-red-500/20 text-red-300 border border-red-500/30'
            }`}>
              {acceptResult}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="mt-8 text-center">
          <Button
            onClick={() => window.location.href = '/'}
            className="bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 backdrop-blur-sm"
          >
            ← Back to Home
          </Button>
        </div>
      </div>
    </div>
  );
}
