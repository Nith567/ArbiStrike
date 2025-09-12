"use client";

import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  createApproveInstruction,
} from "@solana/spl-token";
import {
  useConnection as useSolanaConnection,
  useWallet as useSolanaWallet,
} from '@solana/wallet-adapter-react';
import { jwtDecode } from "jwt-decode";
import {
  PublicKey as SolanaPublicKey,
  SystemProgram as SolanaSystemProgram,
  Transaction as SolanaTransaction,
  VersionedTransaction,
  TransactionMessage,
} from "@solana/web3.js";
import { useEffect, useCallback, useState, useMemo } from "react";
import { Input } from "../components/ui/input";
import sdk, {
  AddMiniApp,
  ComposeCast,
  MiniAppNotificationDetails,
  SignIn as SignInCore,
  type Context,
} from "@farcaster/miniapp-sdk";
import {
  useAccount,
  useSendTransaction,
  useSignMessage,
  useSignTypedData,
  useWaitForTransactionReceipt,
  useDisconnect,
  useConnect,
  useSwitchChain,
  useChainId,
  useWalletClient,
} from "wagmi";

import { config } from "~/components/providers/WagmiProvider";
import { Button } from "~/components/ui/Button";
import { truncateAddress } from "~/lib/truncateAddress";
import { base, degen, mainnet, monadTestnet, optimism, unichain, arbitrum } from "wagmi/chains";
import { BaseError, parseEther, UserRejectedRequestError, encodeFunctionData, parseAbi, parseUnits, formatUnits } from "viem";
import { createStore } from "mipd";
import { Label } from "~/components/ui/label";


// Handles JSON strinify with `BigInt` values
function safeJsonStringify(obj: unknown) {
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return value;
  });
}

export default function Demo(
  { title }: { title?: string } = { title: "ArbiStrike" }
) {
  const [isSDKLoaded, setIsSDKLoaded] = useState(false);
  const [context, setContext] = useState<Context.MiniAppContext | null>(null);
  
  const [token, setToken] = useState<string | null>(null);
  const [isContextOpen, setIsContextOpen] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  const [lastEvent, setLastEvent] = useState("");
  const [addFrameResult, setAddFrameResult] = useState("");
  const [sendNotificationResult, setSendNotificationResult] = useState("");

  const [added, setAdded] = useState(false);
  const [notificationDetails, setNotificationDetails] = useState<MiniAppNotificationDetails | null>(null);

  // Airdrop claim state
  const [isClaimingAirdrop, setIsClaimingAirdrop] = useState(false);
  const [airdropResult, setAirdropResult] = useState<string>("");

  // Check if mini app is added and notifications are enabled using context
  const hasNotifications = notificationDetails !== undefined;
  const isAdded = added;

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();

  const {
    sendTransaction,
    error: sendTxError,
    isError: isSendTxError,
    isPending: isSendTxPending,
  } = useSendTransaction();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash: txHash as `0x${string}`,
    });

  const {
    signTypedData,
    error: signTypedError,
    isError: isSignTypedError,
    isPending: isSignTypedPending,
  } = useSignTypedData();

  const { disconnect } = useDisconnect();
  const { connect } = useConnect();

  const {
    switchChain,
    error: switchChainError,
    isError: isSwitchChainError,
    isPending: isSwitchChainPending,
  } = useSwitchChain();

  const nextChain = useMemo(() => {
    if (chainId === base.id) {
      return optimism;
    } else if (chainId === optimism.id) {
      return degen;
    } else if (chainId === degen.id) {
      return mainnet;
    } else if (chainId === mainnet.id) {
      return unichain;
    } else {
      return base;
    }
  }, [chainId]);

  const handleSwitchChain = useCallback(() => {
    switchChain({ chainId: nextChain.id });
  }, [switchChain, nextChain.id]);

  useEffect(() => {
    const load = async () => {
      const context = await sdk.context;
      setContext(context);
      setAdded(context.client.added);

      sdk.on("miniAppAdded", ({ notificationDetails }) => {
        setLastEvent(
          `miniAppAdded${!!notificationDetails ? ", notifications enabled" : ""}`
        );

        setAdded(true);
        if (notificationDetails) {
          setNotificationDetails(notificationDetails);
        }
      });

      sdk.on("miniAppAddRejected", ({ reason }) => {
        setLastEvent(`miniAppAddRejected, reason ${reason}`);
      });

      sdk.on("miniAppRemoved", () => {
        setLastEvent("miniAppRemoved");
        setAdded(false);
        setNotificationDetails(null);
      });

      sdk.on("notificationsEnabled", ({ notificationDetails }) => {
        setLastEvent("notificationsEnabled");
        setNotificationDetails(notificationDetails);
      });
      
      sdk.on("notificationsDisabled", () => {
        setLastEvent("notificationsDisabled");
        setNotificationDetails(null);
      });

      sdk.on("primaryButtonClicked", () => {
        console.log("primaryButtonClicked");
      });

      const ethereumProvider = await sdk.wallet.getEthereumProvider();
      ethereumProvider?.on("chainChanged", (chainId) => {
        console.log("[ethereumProvider] chainChanged", chainId)
      })
      ethereumProvider?.on("connect", (connectInfo) => {
        console.log("[ethereumProvider] connect", connectInfo);
      });

      sdk.actions.ready({});

      // Set up a MIPD Store, and request Providers.
      const store = createStore();

      // Subscribe to the MIPD Store.
      store.subscribe((providerDetails) => {
        console.log("PROVIDER DETAILS", providerDetails);
        // => [EIP6963ProviderDetail, EIP6963ProviderDetail, ...]
      });
    };
    
    if (sdk && !isSDKLoaded) {
      setIsSDKLoaded(true);
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

  const openUrl = useCallback(() => {
    sdk.actions.openUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  }, []);

  const openWarpcastUrl = useCallback(() => {
    sdk.actions.openUrl("https://warpcast.com/~/compose");
  }, []);

  const close = useCallback(() => {
    sdk.actions.close();
  }, []);

  const addFrame = useCallback(async () => {
    try {
      setNotificationDetails(null);

      const result = await sdk.actions.addFrame();

      if (result.notificationDetails) {
        setNotificationDetails(result.notificationDetails);
      }
      setAddFrameResult(
        result.notificationDetails
          ? `Added, got notification token ${result.notificationDetails.token} and url ${result.notificationDetails.url}`
          : "Added, got no notification details"
      );
    } catch (error) {
      if (error instanceof AddMiniApp.RejectedByUser) {
        setAddFrameResult(`Not added: ${error.message}`);
      }

      if (error instanceof AddMiniApp.InvalidDomainManifest) {
        setAddFrameResult(`Not added: ${error.message}`);
      }

      setAddFrameResult(`Error: ${error}`);
    }
  }, []);

  const sendNotification = useCallback(async () => {
    setSendNotificationResult("");
    if (!notificationDetails || !context) {
      return;
    }

    try {
      const response = await fetch("/api/send-notification", {
        method: "POST",
        mode: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fid: context.user.fid,
          notificationDetails,
        }),
      });

      if (response.status === 200) {
        setSendNotificationResult("Success");
        return;
      } else if (response.status === 429) {
        setSendNotificationResult("Rate limited");
        return;
      }

      const data = await response.text();
      setSendNotificationResult(`Error: ${data}`);
    } catch (error) {
      setSendNotificationResult(`Error: ${error}`);
    }
  }, [context, notificationDetails]);

  const sendTx = useCallback(() => {
    sendTransaction(
      {
        // call yoink() on Yoink contract
        to: "0x4bBFD120d9f352A0BEd7a014bd67913a2007a878",
        data: "0x9846cd9efc000023c0",
        chainId: monadTestnet.id,
      },
      {
        onSuccess: (hash) => {
          setTxHash(hash);
        },
      }
    );
  }, [sendTransaction]);

  // Claim daily airdrop function
  const claimAirdrop = useCallback(async () => {
    if (!address || !isConnected) {
      setAirdropResult("❌ Please connect your wallet first");
      return;
    }

    if (!walletClient) {
      setAirdropResult("❌ Wallet client not available");
      return;
    }

    setIsClaimingAirdrop(true);
    setAirdropResult("🔄 Claiming your daily 0.01 USDC airdrop...");

    try {
      // Typing Challenge contract address
      const TYPING_CHALLENGE_CONTRACT = '0x5E486ae98F6FE7C4FB064640fdEDA7D58aC13E4b';

      // Prepare claimAirdrop transaction data
      const claimData = encodeFunctionData({
        abi: parseAbi(['function claimAirdrop(address recipient) external']),
        functionName: 'claimAirdrop',
        args: [address as `0x${string}`],
      });

      setAirdropResult("🔄 Sending transaction... Please confirm in your wallet");

      const { id } = await walletClient.sendCalls({
        account: address as `0x${string}`,
        chain: arbitrum,
        calls: [
          {
            to: TYPING_CHALLENGE_CONTRACT as `0x${string}`,
            value: 0n,
            data: claimData,
          },
        ],
      });

      setAirdropResult("🔄 Waiting for transaction confirmation...");
      
      const result = await walletClient.waitForCallsStatus({
        id,
        pollingInterval: 2000,
      });
      
      if (result.status === 'success') {
        setAirdropResult(`🎉 Success! You received 0.01 USDC airdrop!`);
      } else {
        throw new Error('Transaction failed or was rejected');
      }

    } catch (error: any) {
      console.error('Airdrop claim error:', error);
      
      if (error?.message?.includes('User rejected') || 
          error?.message?.includes('User denied') ||
          error?.message?.includes('User cancelled') ||
          error?.code === 4001) {
        setAirdropResult("❌ Transaction cancelled by user");
      } else if (error?.message?.includes('insufficient funds')) {
        setAirdropResult("❌ Insufficient gas fees for transaction");
      } else {
        setAirdropResult(`❌ Claim failed: ${error?.message || 'Unknown error'}`);
      }
    } finally {
      setIsClaimingAirdrop(false);
    }
  }, [address, isConnected, walletClient]);

  const toggleContext = useCallback(() => {
    setIsContextOpen((prev) => !prev);
  }, []);

  const { publicKey: solanaPublicKey } = useSolanaWallet();
  const solanaAddress = solanaPublicKey?.toBase58();

  if (!isSDKLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900 to-black text-white">
        <div className="text-center p-8">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-purple-500/20 rounded-full blur-xl animate-pulse"></div>
            <div className="relative text-7xl animate-bounce">⚡</div>
          </div>
          <div className="text-2xl font-bold mb-3 bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
            Initializing ZTyping Arena
          </div>
          <div className="text-gray-400 animate-pulse">Preparing your gaming experience...</div>
          <div className="mt-6 w-32 h-1 bg-gray-700 rounded-full mx-auto overflow-hidden">
            <div className="h-full bg-gradient-to-r from-purple-500 to-cyan-500 rounded-full animate-pulse"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-black text-white"
      style={{
        paddingTop: context?.client.safeAreaInsets?.top ?? 0,
        paddingBottom: context?.client.safeAreaInsets?.bottom ?? 0,
        paddingLeft: context?.client.safeAreaInsets?.left ?? 0,
        paddingRight: context?.client.safeAreaInsets?.right ?? 0,
      }}
    >
      <div className="w-full max-w-md mx-auto py-6 px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="relative inline-block mb-4">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-cyan-500/20 blur-xl rounded-full"></div>
            <div className="relative text-6xl">⚡</div>
          </div>
          <h1 className="text-3xl font-bold mb-3 bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent">
            ZTyping Arena
          </h1>
          <p className="text-gray-400 text-sm leading-relaxed">
            Master your typing skills in epic space battles.<br/>
            <span className="text-purple-400">Compete • Earn • Dominate</span>
          </p>
        </div>

        {/* Daily Airdrop Section */}
        <div className="mb-6 p-4 bg-gradient-to-r from-emerald-900/40 to-green-900/20 rounded-2xl border border-emerald-500/20 backdrop-blur-sm shadow-lg">
          {airdropResult && (
            <div className={`mb-3 text-xs p-3 rounded-xl backdrop-blur-sm ${
              airdropResult.includes('Success') || airdropResult.includes('🎉')
                ? 'bg-green-900/30 border border-green-500/30 text-green-300'
                : airdropResult.includes('hours') || airdropResult.includes('⏰')
                  ? 'bg-yellow-900/30 border border-yellow-500/30 text-yellow-300'
                  : airdropResult.includes('❌')
                    ? 'bg-red-900/30 border border-red-500/30 text-red-300'
                    : 'bg-blue-900/30 border border-blue-500/30 text-blue-300'
            }`}>
              <div className="flex items-start gap-2">
                <span className="mt-0.5">
                  {airdropResult.includes('Success') ? '🎉' : 
                   airdropResult.includes('hours') ? '⏰' :
                   airdropResult.includes('❌') ? '❌' : '🔄'}
                </span>
                <div className="flex-1">
                  <div className="whitespace-pre-line">{airdropResult}</div>
                </div>
              </div>
            </div>
          )}
          
          <Button 
            onClick={claimAirdrop} 
            disabled={isClaimingAirdrop || !isConnected}
            className={`w-full text-sm py-3 rounded-xl transition-all duration-300 ${
              !isConnected
                ? 'bg-gray-700/50 border border-gray-600/30 text-gray-400 cursor-not-allowed'
                : isClaimingAirdrop
                  ? 'bg-blue-900/50 border border-blue-500/30 text-blue-300 cursor-not-allowed'
                  : 'bg-gradient-to-r from-emerald-600/80 to-green-600/80 hover:from-emerald-600 hover:to-green-600 text-white border border-emerald-500/30 hover:scale-105'
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              {!isConnected ? (
                <>
                  <span>🔒</span>
                  <span>Connect Wallet to Claim</span>
                </>
              ) : isClaimingAirdrop ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-2 border-blue-300 border-t-transparent"></div>
                  <span>Claiming...</span>
                </>
              ) : (
                <>
                  <span>💰</span>
                  <span>Claim Daily 0.01 USDC</span>
                </>
              )}
            </span>
          </Button>
          
          {isConnected && (
            <div className="mt-2 text-xs text-center text-gray-400">
              🎁 Free daily airdrop • 0.01 USDC on Arbitrum
            </div>
          )}
        </div>

        {/* Challenge Section */}
        <div className="mb-6 p-6 bg-gradient-to-br from-purple-900/40 to-cyan-900/20 rounded-2xl border border-purple-500/20 backdrop-blur-sm shadow-2xl">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl mb-4">
              <span className="text-2xl">⚔️</span>
            </div>
            <h2 className="text-xl font-bold mb-2 text-white">Battle Arena</h2>
            <p className="text-gray-400 text-sm mb-4">
              Challenge players worldwide for USDC rewards
            </p>
            <div className="text-xs bg-gradient-to-r from-blue-900/50 to-purple-900/50 border border-blue-500/30 rounded-xl p-3 backdrop-blur-sm">
              <div className="flex items-center justify-center gap-2 mb-2">
                <span className="text-blue-400">📋</span>
                <span className="font-semibold text-blue-300">Battle Flow</span>
              </div>
              <div className="text-gray-300 leading-relaxed">
                Create Challenge → Set Your Score → Share Battle Link
              </div>
            </div>
          </div>
          
          <CreateChallenge context={context} address={address} />
        </div>

        {/* Main Game Section */}
        <div className="mb-6 p-6 bg-gradient-to-br from-blue-900/40 to-purple-900/20 rounded-2xl border border-blue-500/20 backdrop-blur-sm shadow-2xl">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl mb-4">
              <span className="text-2xl">🎮</span>
            </div>
            <h2 className="text-xl font-bold mb-2 text-white">Solo Arena</h2>
            <p className="text-gray-400 text-sm mb-4">
              Train your skills in the cosmic battlefield (DEMO game)
            </p>
          </div>
          
          <Button 
            onClick={() => {
              // If there's an active challenge, pass it to the game
              const urlParams = new URLSearchParams(window.location.search);
              const challengeId = urlParams.get('challengeId');
              const gameUrl = challengeId ? `/ztype?challengeId=${challengeId}` : '/ztype';
              window.location.href = gameUrl;
            }} 
            className="w-full mb-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-4 rounded-xl shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-purple-500/25"
          >
            <span className="flex items-center justify-center gap-2">
              <span className="text-xl">🚀</span>
              <span>Play ArbiStrike</span>
            </span>
          </Button>

          {/* Notifications Section */}
          <div className="border-t border-gray-700/50 pt-4">
            {addFrameResult && (
              <div className="mb-3 text-xs p-3 bg-green-900/30 border border-green-500/30 rounded-xl text-green-300 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <span>✅</span>
                  <span>{addFrameResult}</span>.  
                </div>
              </div>
            )}
            <Button 
              onClick={addFrame} 
              disabled={added}
              className={`w-full text-sm py-3 rounded-xl transition-all duration-300 ${
                added 
                  ? 'bg-green-900/30 border border-green-500/30 text-green-300 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-yellow-600/80 to-orange-600/80 hover:from-yellow-600 hover:to-orange-600 text-white border border-yellow-500/30 hover:scale-105'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <span>{added ? "✅" : "🔔"}</span>
                <span>{added ? "Notifications Active" : "Enable Battle Alerts"}</span>
              </span>
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-500 mt-8">
          <p>Powered by Farcaster Frames v2</p>
          <div className="flex items-center justify-center gap-4 mt-2">
            <span className="text-purple-400">⚡ Fast</span>
            <span className="text-cyan-400">🛡️ Secure</span>
            <span className="text-pink-400">🏆 Competitive</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ComposeCastAction() {
  const [result, setResult] = useState<ComposeCast.Result>();
  const compose = useCallback(async () => {
    setResult(await sdk.actions.composeCast({
      text: 'Hello from Demo Mini App',
      embeds: ["https://test.com/foo%20bar"],
    }))
  }, []);

  return (
    <>
      <Button
        onClick={compose}
      >
        Compose Cast
      </Button>
      {result && (
        <div className="mt-2 text-xs">
          <div>Cast Hash: {result.cast?.hash}</div>
        </div>
      )}
    </>
  );
}

function SignEthMessage() {
  const { isConnected } = useAccount();
  const { connectAsync } = useConnect();
  const {
    signMessage,
    data: signature,
    error: signError,
    isError: isSignError,
    isPending: isSignPending,
  } = useSignMessage();

  const handleSignMessage = useCallback(async () => {
    if (!isConnected) {
      await connectAsync({
        chainId: base.id,
        connector: config.connectors[0],
      });
    }

    signMessage({ message: "Hello from Frames v2!" });
  }, [connectAsync, isConnected, signMessage]);

  return (
    <>
      <Button
        onClick={handleSignMessage}
        disabled={isSignPending}
        isLoading={isSignPending}
      >
        Sign Message
      </Button>
      {isSignError && renderError(signError)}
      {signature && (
        <div className="mt-2 text-xs">
          <div>Signature: {signature}</div>
        </div>
      )}
    </>
  );
}

function SendEth() {
  const { isConnected, chainId } = useAccount();
  const {
    sendTransaction,
    data,
    error: sendTxError,
    isError: isSendTxError,
    isPending: isSendTxPending,
  } = useSendTransaction();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash: data,
    });

  const toAddr = useMemo(() => {
    // Protocol guild address
    return chainId === base.id
      ? "0x32e3C7fD24e175701A35c224f2238d18439C7dBC"
      : "0xB3d8d7887693a9852734b4D25e9C0Bb35Ba8a830";
  }, [chainId]);

  const handleSend = useCallback(() => {
    sendTransaction({
      to: toAddr,
      value: 1n,
    });
  }, [toAddr, sendTransaction]);

  return (
    <>
      <Button
        onClick={handleSend}
        disabled={!isConnected || isSendTxPending}
        isLoading={isSendTxPending}
      >
        Send Transaction (eth)
      </Button>
      {isSendTxError && renderError(sendTxError)}
      {data && (
        <div className="mt-2 text-xs">
          <div>Hash: {truncateAddress(data)}</div>
          <div>
            Status:{" "}
            {isConfirming
              ? "Confirming..."
              : isConfirmed
                ? "Confirmed!"
                : "Pending"}
          </div>
        </div>
      )}
    </>
  );
}

function SignSolanaMessage() {
  const [signature, setSignature] = useState<string | undefined>();
  const [signError, setSignError] = useState<Error | undefined>();
  const [signPending, setSignPending] = useState(false);

  const { signMessage } = useSolanaWallet();
  const handleSignMessage = useCallback(async () => {
    setSignPending(true);
    try {
      if (!signMessage) {
        throw new Error('no Solana signMessage');
      }
      const input = Buffer.from("Hello from Frames v2!", "utf8");
      const signatureBytes = await signMessage(input);
      const signature = Buffer.from(signatureBytes).toString("base64");
      setSignature(signature);
      setSignError(undefined);
    } catch (e) {
      if (e instanceof Error) {
        setSignError(e);
      }
      throw e;
    } finally {
      setSignPending(false);
    }
  }, [signMessage]);

  return (
    <>
      <Button
        onClick={handleSignMessage}
        disabled={signPending}
        isLoading={signPending}
      >
        Sign Message
      </Button>
      {signError && renderError(signError)}
      {signature && (
        <div className="mt-2 text-xs">
          <div>Signature: {signature}</div>
        </div>
      )}
    </>
  );
}

// I am collecting lamports to buy a boat
const ashoatsPhantomSolanaWallet =
  'Ao3gLNZAsbrmnusWVqQCPMrcqNi6jdYgu8T6NCoXXQu1';

function SendTokenSolana() {
  const [state, setState] = useState<
    | { status: 'none' }
    | { status: 'pending' }
    | { status: 'error'; error: Error }
    | { status: 'success'; signature: string; type: 'send' | 'approve' }
  >({ status: 'none' });

  const [selectedSymbol, setSelectedSymbol] = useState(''); // Initialize with empty string
  const [associatedMapping, setAssociatedMapping] = useState<{ token: string, decimals: number } | undefined>(undefined);

  const { publicKey, sendTransaction } = useSolanaWallet();
  const solanaAddress = publicKey?.toBase58();

  const [destinationAddress, setDestinationAddress] = useState(solanaAddress ?? '');
  const [simulation, setSimulation] = useState('');
  const [useVersionedTransaction, setUseVersionedTransaction] = useState(false);

  const tokenOptions = [
    { label: 'Select a token', value: '', disabled: true }, // Added a disabled default option
    { label: 'USDC', value: 'USDC' },
    { label: 'Tether', value: 'Tether' },
    { label: 'Bonk', value: 'Bonk' },
    { label: 'GOGS', value: 'GOGS' },
  ];

  const handleValueChange = (value: string) => {
    setSelectedSymbol(value);
    setState({ status: 'none' }); // Reset status when token changes
    if (!value) {
      setAssociatedMapping(undefined);
      return;
    }

    let valueToSet = '';
    let decimalsToSet = 0;
    switch (value) {
      case 'USDC':
        valueToSet = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC Mint address
        decimalsToSet = 6;
        break;
      case 'Tether':
        valueToSet = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
        decimalsToSet = 6;
        break;
      case 'Bonk':
        valueToSet = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'
        decimalsToSet = 5;
        break;
      case 'GOGS':
        valueToSet = 'HxptKywiNbHobJD4XMMBn1czMUGkdMrUkeUErQLKbonk'
        decimalsToSet = 6;
        break;
      default:
        // It's better to handle this case gracefully, e.g., by clearing the mapping
        // or simply not setting it if the value is unexpected (though the select should prevent this)
        console.error('Invalid symbol selected:', value);
        setAssociatedMapping(undefined);
        return;
    }
    setAssociatedMapping({
      token: valueToSet,
      decimals: decimalsToSet,
    });
  };

  const { connection: solanaConnection } = useSolanaConnection();



  return (
    <div className="p-4 max-w-md mx-auto space-y-4"> {/* Added some basic styling for layout */}
      <h2 className="text-xl font-semibold">Send Solana Transaction</h2>

      <div>
        <label htmlFor="destination-address" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Destination Address
        </label>
        <input
          type="text"
          id="destination-address"
          value={destinationAddress}
          onChange={(e) => setDestinationAddress(e.target.value)}
          className="w-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="use-versioned"
          checked={useVersionedTransaction}
          onChange={(e) => setUseVersionedTransaction(e.target.checked)}
          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded bg-white dark:bg-gray-900"
        />
        <label htmlFor="use-versioned" className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Use Versioned Transaction
        </label>
      </div>

      <div>
        <label htmlFor="token-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Select Token
        </label>
        <select
          value={selectedSymbol}
          onChange={(e) => handleValueChange(e.target.value)}
          className="w-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
        >
          {tokenOptions.map(option => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
      </div>


      {state.status === 'none' && !selectedSymbol && (
        <div className="mt-2 text-xs text-gray-500">Please select a token.</div>
      )}
      {state.status === 'error' && renderError(state.error)}
      {state.status === 'success' && (
        <div className="mt-2 text-xs p-2 bg-green-50 border border-green-200 rounded">
          <div className="font-semibold text-green-700">
            {state.type === 'approve' ? 'Approval' : 'Send'} Transaction Successful!
          </div>
          <div>Signature: <a href={`https://explorer.solana.com/tx/${state.signature}?cluster=devnet`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{truncateAddress(state.signature)}</a></div>
        </div>
      )}
      {simulation && (
        <div className="mt-2 text-xs p-2 bg-green-50 border border-green-200 rounded">
          <div className="font-semibold text-green-700">Simulation Result:</div>
          <div>{simulation}</div>
        </div>
      )}
    </div>
  );
}

function TestBatchOperation() {
  const { address, isConnected } = useAccount();
  const { data: walletClient, isLoading: isWalletClientLoading, error: walletClientError } = useWalletClient();
  const [capabilities, setCapabilities] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forceAtomic, setForceAtomic] = useState(false);
  const [isGettingCapabilities, setIsGettingCapabilities] = useState(false);
  const [isSendingCalls, setIsSendingCalls] = useState(false);
  const { switchChain } = useSwitchChain();

  const [batchCallId, setBatchCallId] = useState<string | null>(null);
  const [batchCallResult, setBatchCallResult] = useState<string | null>(null);

  // State for explicit USDC approve + MockTransfer.mockTransfer test (non-atomic)
  const [isSendingApproveTransfer, setIsSendingApproveTransfer] = useState(false);
  const [approveTransferId, setApproveTransferId] = useState<string | null>(null);
  const [approveTransferResult, setApproveTransferResult] = useState<string | null>(null);
  const [approveTransferError, setApproveTransferError] = useState<string | null>(null);

  const handleGetCapabilities = useCallback(async () => {
    if (!walletClient || !address) {
      setError('No wallet client or address');
      return;
    }

    if (isWalletClientLoading) {
      setError('Wallet client is still loading');
      return;
    }

    if (walletClientError) {
      setError(`Wallet client error: ${walletClientError.message}`);
      return;
    }
    
    setIsGettingCapabilities(true);
    setError(null);
    
    try {
      const capabilities = await walletClient.getCapabilities({
        account: address,
      });
      if (!capabilities) {
        setError('No capabilities found');
      } else {
        setCapabilities(JSON.stringify(capabilities, null, 2));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsGettingCapabilities(false);
    }
  }, [walletClient, isWalletClientLoading, walletClientError, address]);

  const handleSendCalls = useCallback(async () => {
    if (!walletClient || !address) {
      setError('No wallet client or address');
      return;
    }

    if (isWalletClientLoading) {
      setError('Wallet client is still loading');
      return;
    }

    if (walletClientError) {
      setError(`Wallet client error: ${walletClientError.message}`);
      return;
    }

    switchChain({ chainId: base.id });
    
    setIsSendingCalls(true);
    setError(null);
    setBatchCallId(null);
    setBatchCallResult(null);
    
    try {
      const { id } = await walletClient.sendCalls({ 
        account: address,
        forceAtomic,
        chain: base,
        calls: [
          {
            to: '0x729170d38dd5449604f35f349fdfcc9ad08257cd',
            value: parseEther('0.00002')
          },
          {
            to: '0xf4319842934025823b461db1fa545d144833e84e',
            value: parseEther('0.00002')
          },
          {
            to: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            value: parseEther('0'),
            data: '0xa9059cbb000000000000000000000000729170d38dd5449604f35f349fdfcc9ad08257cd0000000000000000000000000000000000000000000000000000000000002710'
          },
        ],
      });
      setBatchCallId(id);
      
      const result = await walletClient.waitForCallsStatus({
        id,
        pollingInterval: 200,
      });
      console.log('result', result);
      setBatchCallResult(safeJsonStringify(result));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsSendingCalls(false);
    }
  }, [walletClient, isWalletClientLoading, walletClientError, address, forceAtomic, switchChain]);

  const handleSendCallsApproveAndTransfer = useCallback(async () => {
    if (!walletClient || !address) {
      setApproveTransferError('No wallet client or address');
      return;
    }

    if (isWalletClientLoading) {
      setApproveTransferError('Wallet client is still loading');
      return;
    }

    if (walletClientError) {
      setApproveTransferError(`Wallet client error: ${walletClientError.message}`);
      return;
    }

    // Ensure we are on Base for this test
    switchChain({ chainId: base.id });

    setIsSendingApproveTransfer(true);
    setApproveTransferError(null);
    setApproveTransferId(null);
    setApproveTransferResult(null);

    try {
      const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
      const MOCK_TRANSFER = '0xDC5A772d22558524cbBbfa8Ba6E83b5BebE45783';
      const TEN_CENTS_USDC = 100_000n; // 0.10 USDC with 6 decimals

      const approveData = encodeFunctionData({
        abi: parseAbi(['function approve(address spender, uint256 value) returns (bool)']),
        functionName: 'approve',
        args: [MOCK_TRANSFER, TEN_CENTS_USDC],
      });

      const mockTransferData = encodeFunctionData({
        abi: parseAbi(['function mockTransfer(uint256 amount)']),
        functionName: 'mockTransfer',
        args: [TEN_CENTS_USDC],
      });

      const { id } = await walletClient.sendCalls({
        account: address,
        chain: base,
        // Explicitly non-atomic per request
        forceAtomic: false,
        calls: [
          { to: BASE_USDC, value: 0n, data: approveData },
          { to: MOCK_TRANSFER, value: 0n, data: mockTransferData },
        ],
      });

      setApproveTransferId(id);

      const result = await walletClient.waitForCallsStatus({
        id,
        pollingInterval: 200,
      });
      setApproveTransferResult(safeJsonStringify(result));
    } catch (e) {
      setApproveTransferError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsSendingApproveTransfer(false);
    }
  }, [walletClient, isWalletClientLoading, walletClientError, address, switchChain]);

  return (
    <>
      <div className="mb-4">
        <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg my-2">
          <pre className="font-mono text-xs whitespace-pre-wrap break-words max-w-[260px] overflow-x-">
            wallet.getCapabilities / wallet.sendCalls
          </pre>
        </div>
        
        <div className="mb-4">
          <Button 
            onClick={handleGetCapabilities}
            disabled={!isConnected || isGettingCapabilities || !walletClient || isWalletClientLoading}
            isLoading={isGettingCapabilities}
          >
            Get Capabilities
          </Button>
          
          {capabilities && (
            <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <div className="font-semibold text-gray-500 dark:text-gray-300 mb-1">Capabilities</div>
              <pre className="font-mono text-xs whitespace-pre-wrap break-words max-w-[260px] overflow-x-">
                {capabilities}
              </pre>
            </div>
          )}
        </div>

        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              id="force-atomic"
              checked={forceAtomic}
              onChange={(e) => setForceAtomic(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="force-atomic" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Force Atomic
            </label>
          </div>
          
          <Button 
            onClick={handleSendCalls}
            disabled={!isConnected || isSendingCalls || !walletClient || isWalletClientLoading}
            isLoading={isSendingCalls}
          >
            Send Batch Calls
          </Button>
        </div>

        <div className="mb-4">
          <Button
            onClick={handleSendCallsApproveAndTransfer}
            disabled={!isConnected || isSendingApproveTransfer || !walletClient || isWalletClientLoading}
            isLoading={isSendingApproveTransfer}
          >
            SendCalls: Approve 10c USDC + mockTransfer (This will take 10c in USDC, use at your own discression)
          </Button>
        </div>

        {batchCallId && (
          <div className="mb-2 text-xs">
            Batch Call ID: {batchCallId}
          </div>
        )}

        {batchCallResult && (
          <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <div className="font-semibold text-gray-500 dark:text-gray-300 mb-1">Batch Call Result</div>
            <pre className="font-mono text-xs whitespace-pre-wrap break-words max-w-[260px] overflow-x-">
              {batchCallResult}
            </pre>
          </div>
        )}

        {error && (
          <div className="text-red-500 text-xs mt-1">{error}</div>
        )}

        {approveTransferId && (
          <div className="mb-2 text-xs">
            Approve + Transfer ID: {approveTransferId}
          </div>
        )}

        {approveTransferResult && (
          <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <div className="font-semibold text-gray-500 dark:text-gray-300 mb-1">Approve + Transfer Result</div>
            <pre className="font-mono text-xs whitespace-pre-wrap break-words max-w-[260px] overflow-x-">
              {approveTransferResult}
            </pre>
          </div>
        )}

        {approveTransferError && (
          <div className="text-red-500 text-xs mt-1">{approveTransferError}</div>
        )}
      </div>
    </>
  );
}

function SendSolana() {
  const [state, setState] = useState<
    | { status: 'none' }
    | { status: 'pending' }
    | { status: 'error'; error: Error }
    | { status: 'success'; signature: string }
  >({ status: 'none' });

  const { connection: solanaConnection } = useSolanaConnection();
  const { sendTransaction, publicKey } = useSolanaWallet();

  const handleSend = useCallback(async () => {
    setState({ status: 'pending' });
    try {
      if (!publicKey) {
        throw new Error('no Solana publicKey');
      }

      const { blockhash } = await solanaConnection.getLatestBlockhash();
      if (!blockhash) {
        throw new Error('failed to fetch latest Solana blockhash');
      }

      const transaction = new SolanaTransaction();
      transaction.add(
        SolanaSystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new SolanaPublicKey(ashoatsPhantomSolanaWallet),
          lamports: 1n,
        }),
      );
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      const simulation =
        await solanaConnection.simulateTransaction(transaction);
      if (simulation.value.err) {
        throw new Error('Simulation failed');
      }

      const signature = await sendTransaction(transaction, solanaConnection);
      setState({ status: 'success', signature });
    } catch (e) {
      if (e instanceof Error) {
        setState({ status: 'error', error: e });
      } else {
        setState({ status: 'none' });
      }
      throw e;
    }
  }, [sendTransaction, publicKey, solanaConnection]);

  return (
    <>
      <Button
        onClick={handleSend}
        disabled={state.status === 'pending'}
        isLoading={state.status === 'pending'}
      >
        Send Transaction
      </Button>
      {state.status === 'error' && renderError(state.error)}
      {state.status === 'success' && (
        <div className="mt-2 text-xs">
          <div>Hash: {truncateAddress(state.signature)}</div>
        </div>
      )}
    </>
  );
}

function QuickAuth({ setToken, token }: { setToken: (token: string | null) => void; token: string | null; }) {
  const [signingIn, setSigningIn] = useState(false);
  const [signInFailure, setSignInFailure] = useState<string>();

  const handleSignIn = useCallback(async () => {
    try {
      setSigningIn(true);
      setSignInFailure(undefined);

      const { token } = await sdk.experimental.quickAuth();

      setToken(token);

      // Demonstrate hitting an authed endpoint
      const response = await fetch('/api/me', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      return;
    } catch (e) {
      if (e instanceof SignInCore.RejectedByUser) {
        setSignInFailure("Rejected by user");
        return;
      }

      setSignInFailure("Unknown error");
    } finally {
      setSigningIn(false);
    }
  }, [setToken]);

  const handleSignOut = useCallback(async () => {
    setToken(null)
  }, [setToken]);

  return (
    <>
      {status !== "authenticated" && (
        <Button onClick={handleSignIn} disabled={signingIn}>
          Sign In
        </Button>
      )}
      {status === "authenticated" && (
        <Button onClick={handleSignOut}>
          Sign out
        </Button>
      )}
      {token && (
        <>
          <div className="my-2 p-2 text-xs overflow-x-scroll bg-gray-100 dark:bg-gray-800 rounded-lg font-mono">
            <div className="font-semibold text-gray-500 dark:text-gray-300 mb-1">Raw JWT</div>
            <div className="whitespace-pre">
              {token}
            </div>
          </div>
          <div className="my-2 p-2 text-xs overflow-x-scroll bg-gray-100 dark:bg-gray-800 rounded-lg font-mono">
            <div className="font-semibold text-gray-500 dark:text-gray-300 mb-1">Decoded JWT</div>
            <div className="whitespace-pre">
              {JSON.stringify(jwtDecode(token), undefined, 2)}
            </div>
          </div>
        </>
      )}
      {signInFailure && !signingIn && (
        <div className="my-2 p-2 text-xs overflow-x-scroll bg-gray-100 dark:bg-gray-800 rounded-lg font-mono">
          <div className="font-semibold text-gray-500 dark:text-gray-300 mb-1">SIWF Result</div>
          <div className="whitespace-pre">{signInFailure}</div>
        </div>
      )}
    </>
  );
}


function OpenMiniApp() {
  const [selectedUrl, setSelectedUrl] = useState("");
  const [openResult, setOpenResult] = useState<string>("");
  const [isOpening, setIsOpening] = useState(false);

  const urlOptions = [
    { label: "Select a URL", value: "", disabled: true },
    { 
      label: "Bountycaster (Embed)", 
      value: "https://www.bountycaster.xyz/bounty/0x392626b092e05955c11c41c5df8e2fb8003ece78" 
    },
    { 
      label: "Eggs (Launcher)", 
      value: "https://farcaster.xyz/miniapps/Qqjy9efZ-1Qu/eggs" 
    },
    { 
      label: "Invalid URL", 
      value: "https://swizec.com/" 
    },
  ];

  const handleOpenMiniApp = useCallback(async () => {
    if (!selectedUrl) {
      setOpenResult("Please select a URL");
      return;
    }

    setIsOpening(true);
    setOpenResult("");

    try {
      await sdk.actions.openMiniApp({url: selectedUrl});
      setOpenResult("Mini app opened successfully");
    } catch (error) {
      setOpenResult(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsOpening(false);
    }
  }, [selectedUrl]);

  return (
    <>
      <div>
        <Label
          className="text-xs font-semibold text-gray-500 dark:text-gray-300 mb-1"
          htmlFor="mini-app-select"
        >
          Select Mini App URL
        </Label>
        <select
          id="mini-app-select"
          value={selectedUrl}
          onChange={(e) => setSelectedUrl(e.target.value)}
          className="w-full mb-2 p-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-700 rounded"
        >
          {urlOptions.map(option => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <Button
        onClick={handleOpenMiniApp}
        disabled={!selectedUrl || isOpening}
        isLoading={isOpening}
      >
        Open Mini App
      </Button>
      {openResult && (
        <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
          {openResult}
        </div>
      )}
    </>
  );
}

function CreateChallenge({ context, address }: { context?: Context.MiniAppContext | null, address?: string }) {
  const [betAmount, setBetAmount] = useState('1'); // Human-readable USDC amount
  const [searchTerm, setSearchTerm] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [challengeResult, setChallengeResult] = useState('');
  const [isCreatingChallenge, setIsCreatingChallenge] = useState(false);
  const [createdChallengeId, setCreatedChallengeId] = useState<number | null>(null);
  const [challengeUrls, setChallengeUrls] = useState<{creatorPlay: string, opponentChallenge: string} | null>(null);
  
  // Simple wallet client approach like in try.tsx
  const { data: walletClient, isLoading: isWalletClientLoading } = useWalletClient();
  const { switchChain } = useSwitchChain();
  const { isConnected } = useAccount();
  const { connect } = useConnect();

  // Search for Farcaster users
  useEffect(() => {
    const fetchUsers = async () => {
      if (searchTerm.length > 2) {
        setLoading(true);
        try {
          const response = await fetch(`/api/search-users?q=${encodeURIComponent(searchTerm)}`);
          if (response.ok) {
            const data = await response.json();
            setUsers(data.users || []);
          }
        } catch (error) {
          console.error('Error fetching users:', error);
        } finally {
          setLoading(false);
        }
      } else {
        setUsers([]);
      }
    };

    const debounceTimer = setTimeout(fetchUsers, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchTerm]);

  const handleCreateChallenge = useCallback(async () => {
    // Simple validation like in try.tsx
    if (!selectedUser) {
      setChallengeResult('❌ Please select a user to challenge first');
      return;
    }

    if (!address) {
      setChallengeResult('❌ Please connect your wallet first');
      return;
    }

    if (!isConnected) {
      setChallengeResult('❌ Wallet is not connected. Please connect your wallet first');
      return;
    }

    if (!context?.user?.fid) {
      setChallengeResult('❌ Missing user FID from Farcaster context');
      return;
    }

    setIsCreatingChallenge(true);
    setChallengeResult('🔄 Creating challenge and placing bet...');

    try {
      // Validate bet amount
      if (!betAmount || isNaN(Number(betAmount)) || Number(betAmount) <= 0) {
        throw new Error('Please enter a valid USDC amount greater than 0');
      }

      // Validate wallet client first
      if (!walletClient) {
        throw new Error('Wallet client not available. Please refresh and try again.');
      }

      if (isWalletClientLoading) {
        throw new Error('Wallet client is still loading. Please wait a moment and try again.');
      }

      setChallengeResult('🔄 Switching to Arbitrum network...');
      
/*       // Switch to Arbitrum (chain ID 42161) with proper error handling
      try {
        await switchChain({ chainId: arbitrum.id });
        // Give the network switch a moment to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (switchError: any) {
        if (switchError?.message?.includes('User rejected')) {
          throw new Error('Network switch was cancelled. Please approve the network switch to continue.');
        }
        throw new Error(`Failed to switch to Arbitrum network: ${switchError?.message || 'Unknown error'}`);
      }
 */
      const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
      const TYPING_CHALLENGE_CONTRACT = '0x5E486ae98F6FE7C4FB064640fdEDA7D58aC13E4b';

      setChallengeResult('🔄 Creating challenge in ...');

      // First create challenge in our database
      console.log('=== DEBUG: Creating challenge ===');
      console.log('creator (address):', address);
      console.log('creatorFid:', context.user.fid);
      console.log('selectedUser:', selectedUser);
      console.log('selectedUser.verified_addresses:', selectedUser.verified_addresses);
      console.log('selectedUser.verified_addresses?.primary?.eth_address:', selectedUser.verified_addresses?.primary?.eth_address);
      
      // Use the exact same logic that displays the address in the UI
      const opponentAddress = selectedUser.verified_addresses?.primary?.eth_address;
      console.log('opponentAddress calculated as:', opponentAddress);
      
      // Validate opponent address
      if (!opponentAddress || !opponentAddress.startsWith('0x')) {
        throw new Error(`Invalid opponent address: ${opponentAddress ? truncateAddress(opponentAddress) : 'None'}. User must have a verified Ethereum address.`);
      }
      
      // Convert human-readable USDC amount to wei (6 decimals)
      const betAmountWei = parseUnits(betAmount, 6).toString();
      
      const dbResponse = await fetch('/api/challenges/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creator: address,
          creatorFid: context.user.fid,
          creatorName: context.user.displayName || context.user.username || 'Unknown',
          creatorPfp: context.user.pfpUrl || '',
          opponent: opponentAddress, // Use the same variable
          opponentFid: selectedUser.fid,
          opponentName: selectedUser.display_name || selectedUser.username || 'Unknown',
          opponentPfp: selectedUser.pfp_url || '',
          betAmount: betAmountWei,
        }),
      });

      if (!dbResponse.ok) {
        const errorText = await dbResponse.text();
        throw new Error(`Failed to create challenge in database: ${errorText}`);
      }

      const { challenge } = await dbResponse.json();
      const challengeId = challenge.id;

      setChallengeResult('🔄 Preparing blockchain transactions...');

      // Prepare USDC approve transaction
      const approveData = encodeFunctionData({
        abi: parseAbi(['function approve(address spender, uint256 value) returns (bool)']),
        functionName: 'approve',
        args: [TYPING_CHALLENGE_CONTRACT, parseUnits(betAmount, 6)],
      });

      // Prepare createChallenge transaction
      const createChallengeData = encodeFunctionData({
        abi: parseAbi(['function createChallenge(uint256 challengeId, address opponent, uint256 betAmount)']),
        functionName: 'createChallenge',
        args: [BigInt(challengeId), opponentAddress, parseUnits(betAmount, 6)],
      });

      setChallengeResult('🔄 Sending transactions... Please confirm in your wallet');

      // Send batch transaction with timeout and better error handling
      let transactionId: string;
      try {
        const txResult = await Promise.race([
          walletClient.sendCalls({
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
                data: createChallengeData,
              },
            ],
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Transaction timeout after 60 seconds')), 60000)
          )
        ]) as { id: string };
        
        transactionId = txResult.id;
      } catch (txError: any) {
        console.error('Transaction error:', txError);
        
        if (txError?.message?.includes('User rejected') || 
            txError?.message?.includes('User denied') ||
            txError?.message?.includes('User cancelled') ||
            txError?.code === 4001) {
          throw new Error('Transaction was cancelled by user. No funds were transferred.');
        }
        
        if (txError?.message?.includes('insufficient funds') || 
            txError?.message?.includes('insufficient balance')) {
          throw new Error(`Insufficient USDC balance. You need at least ${betAmount} USDC on Arbitrum.`);
        }
        
        if (txError?.message?.includes('timeout')) {
          throw new Error('Transaction timed out. Please try again with a higher gas price.');
        }
        
        throw new Error(`Transaction failed: ${txError?.message || 'Unknown transaction error'}`);
      }

      setChallengeResult('🔄 Waiting for transaction confirmation...');

      // Wait for transaction completion with timeout
      let result;
      try {
        result = await Promise.race([
          walletClient.waitForCallsStatus({
            id: transactionId,
            pollingInterval: 2000,
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Transaction confirmation timeout')), 120000)
          )
        ]) as any;
      } catch (waitError: any) {
        if (waitError?.message?.includes('timeout')) {
          throw new Error('Transaction confirmation timed out. The transaction may still be processing. Please check your wallet.');
        }
        throw waitError;
      }

      if (result.status === 'success') {
        const creatorPlayUrl = `${window.location.origin}/ztype?challengeId=${challengeId}&role=creator`;
        const opponentChallengeUrl = `${window.location.origin}/challenge/${challengeId}`;
        
        // DON'T send notification yet - only after creator plays and sets score
        setChallengeResult(`🎉 Challenge created successfully!

💰 Bet placed: ${betAmount} USDC`);
        
        setCreatedChallengeId(challengeId);
        
        // Store URLs for buttons
        setChallengeUrls({
          creatorPlay: creatorPlayUrl,
          opponentChallenge: opponentChallengeUrl
        });
        
      } else if (result.status === 'failed') {
        throw new Error('Transaction failed on blockchain. Please try again.');
      } else {
        throw new Error('Transaction status unknown. Please check your wallet for confirmation.');
      }

    } catch (error: any) {
      console.error('Challenge creation error:', error);
      
      // Handle specific error types with user-friendly messages
      let errorMessage = 'Unknown error occurred';
      
      if (error?.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      setChallengeResult(`❌ ${errorMessage}`);
    } finally {
      setIsCreatingChallenge(false);
    }
  }, [walletClient, isWalletClientLoading, address, selectedUser, context, betAmount, switchChain]);

  return (
    <div className="space-y-4">
      {/* Wallet Connection Status */}
      {!isConnected && (
        <div className="p-3 bg-yellow-50 dark:bg-yellow-900 rounded border text-xs">
          <div className="font-medium text-yellow-700 dark:text-yellow-300 mb-2">
            ⚠️ Wallet Not Connected
          </div>
          <div className="text-yellow-600 dark:text-yellow-400 mb-2">
            You need to connect your wallet to create challenges and bet USDC.
          </div>
          <Button
            onClick={() => connect({ connector: config.connectors[0] })}
            className="w-full bg-yellow-600 hover:bg-yellow-700 text-white text-xs"
          >
            🔗 Connect Wallet
          </Button>
        </div>
      )}

      {/* Connection Success */}
      {isConnected && address && (
        <div className="p-3 bg-green-900/30 border border-green-500/30 rounded-xl text-xs backdrop-blur-sm">
          <div className="flex items-center gap-2 text-green-300">
            <span>✅</span>
            <span className="font-medium">Wallet Connected: {truncateAddress(address)}</span>
          </div>
        </div>
      )}

      {/* Bet Amount Input */}
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-white">
          💰 Bet Amount (USDC)
        </label>
        <div className="relative">
          <input
            type="text"
            value={betAmount}
            onChange={(e) => setBetAmount(e.target.value)}
            placeholder="1.5"
            className="w-full p-3 text-sm bg-gray-800/50 border border-gray-600/50 rounded-xl backdrop-blur-sm text-white placeholder-gray-400 focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all"
          />
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm">
            USDC
          </div>
        </div>
        <div className="text-xs text-gray-400 flex items-center gap-2">
          <span>💎</span>
          <span>Betting: {betAmount} USDC on Arbitrum</span>
        </div>
      </div>

      {/* User Search */}
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-white">
          🎯 Find Your Opponent
        </label>
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search Farcaster username..."
            className="w-full p-3 text-sm bg-gray-800/50 border border-gray-600/50 rounded-xl backdrop-blur-sm text-white placeholder-gray-400 focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all"
          />
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400">
            🔍
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-purple-400">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-purple-400 border-t-transparent"></div>
          <span>Searching for opponents...</span>
        </div>
      )}

      {/* Search Results */}
      {users.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold text-white mb-3">
            🎮 Available Opponents
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {users.map((user) => (
              <div
                key={user.fid}
                onClick={() => setSelectedUser(user)}
                className={`p-4 border-2 rounded-xl cursor-pointer transition-all duration-200 backdrop-blur-sm ${
                  selectedUser?.fid === user.fid
                    ? 'bg-purple-600/30 border-purple-400/60 shadow-lg shadow-purple-500/20'
                    : 'bg-gray-800/30 border-gray-600/30 hover:bg-gray-700/40 hover:border-gray-500/50 hover:shadow-md'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <img
                      src={user.pfp_url}
                      alt={user.display_name}
                      className="w-10 h-10 rounded-full border-2 border-gray-500/30"
                    />
                    {selectedUser?.fid === user.fid && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-purple-500 rounded-full flex items-center justify-center">
                        <span className="text-xs">✓</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-white truncate">{user.display_name}</div>
                    <div className="text-sm text-gray-400">@{user.username} • FID: {user.fid}</div>
                    <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                      <span>🔗</span>
                      <span>
                        {user.verified_addresses?.primary?.eth_address 
                          ? truncateAddress(user.verified_addresses.primary.eth_address)
                          : 'No verified address'
                        }
                      </span>
                    </div>
                  </div>
                  {selectedUser?.fid === user.fid && (
                    <div className="text-purple-400 text-lg">
                      🎯
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}



      {/* Create Challenge Button */}
      <Button
        onClick={handleCreateChallenge}
        disabled={!selectedUser || !address || !isConnected || isCreatingChallenge || isWalletClientLoading}
        isLoading={isCreatingChallenge}
        className="w-full py-3 text-sm font-semibold bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-700 rounded-xl shadow-lg transition-all duration-300 hover:scale-105 disabled:hover:scale-100"
      >
        {isCreatingChallenge 
          ? (
            <span className="flex items-center justify-center gap-2">
              <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div>
              <span>Creating Challenge...</span>
            </span>
          )
          : isWalletClientLoading
            ? (
              <span className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div>
                <span>Loading Wallet...</span>
              </span>
            )
            : !isConnected 
              ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="text-sm">❌</span>
                  <span>Connect Wallet First</span>
                </span>
              )
              : !selectedUser 
                ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="text-sm">🎯</span>
                    <span>Select Opponent First</span>
                  </span>
                )
                : (
                  <span className="flex items-center justify-center gap-2">
                    <span className="text-sm">⚔️</span>
                    <span>Create Challenge & Bet {betAmount} USDC</span>
                  </span>
                )
        }
      </Button>

      {/* Result */}
      {challengeResult && (
        <div className={`mt-4 p-6 rounded-2xl backdrop-blur-sm border-2 ${
          challengeResult.includes('successfully')
            ? 'bg-green-900/20 border-green-400/40 text-green-200'
            : challengeResult.includes('🔄')
              ? 'bg-blue-900/20 border-blue-400/40 text-blue-200'
              : 'bg-red-900/20 border-red-400/40 text-red-200'
        }`}>
          <div className="flex items-start gap-3">
            <span className="text-2xl mt-1">
              {challengeResult.includes('successfully') 
                ? '🎉' 
                : challengeResult.includes('🔄')
                  ? '⏳'
                  : '❌'
              }
            </span>
            <div className="flex-1">
              <div className="font-bold text-lg mb-2">
                {challengeResult.includes('successfully') 
                  ? 'Challenge Created!' 
                  : challengeResult.includes('🔄')
                    ? 'Processing...'
                    : 'Error'
                }
              </div>
              <div className="text-sm leading-relaxed whitespace-pre-line">
                {challengeResult}
              </div>
              {challengeResult.includes('cancelled') && (
                <div className="mt-3 p-3 bg-yellow-900/30 border border-yellow-500/30 rounded-lg">
                  <div className="text-yellow-300 text-xs">
                    💡 <strong>Tip:</strong> Make sure to approve both the network switch and transaction in your wallet to create the challenge.
                  </div>
                </div>
              )}
              {challengeResult.includes('insufficient') && (
                <div className="mt-3 p-3 bg-orange-900/30 border border-orange-500/30 rounded-lg">
                  <div className="text-orange-300 text-xs">
                    💡 <strong>Need USDC?</strong> You can get USDC on Arbitrum through a bridge or DEX like Uniswap.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Play Now Section - appears after challenge creation */}
      {createdChallengeId && challengeUrls && (
        <div className="mt-6 p-6 bg-gradient-to-br from-blue-900/40 via-purple-900/30 to-pink-900/20 rounded-2xl border-2 border-blue-400/30 backdrop-blur-md shadow-xl">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl mb-4 shadow-lg">
              <span className="text-2xl">🎮</span>
            </div>
            <h3 className="text-xl font-bold mb-2 text-white">Ready for Battle!</h3>
            <p className="text-gray-300 text-sm leading-relaxed">
              Time to set your challenge score.<br/>
              <span className="text-yellow-400 font-semibold">Your opponent will be notified only after you play!</span>
            </p>
          </div>
          
          {/* Step Indicator */}
          <div className="mb-6 p-3 bg-yellow-900/30 border border-yellow-500/30 rounded-xl">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚠️</span>
              <div>
                <div className="font-bold text-yellow-300 text-sm">Important Next Steps:</div>
                <div className="text-yellow-200 text-xs mt-1">
                  1. Play the game and set your score<br/>
                  2. Opponent gets notified automatically<br/>
                  3. They have 24 hours to beat your score
                </div>
              </div>
            </div>
          </div>
          
          {/* Creator Play Button */}
          <Button
            onClick={() => window.location.href = challengeUrls.creatorPlay}
            className="w-full mb-6 py-2.5 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:from-blue-700 hover:via-purple-700 hover:to-pink-700 text-white font-semibold text-sm rounded-lg shadow-lg transition-all duration-300 hover:scale-105"
          >
            <span className="flex items-center justify-center gap-2">
              <span className="text-base">🎮</span>
              <span>Set Score</span>
            </span>
          </Button>
          
          {/* Manual Share Section */}
          <div className="mb-6">
            <div className="text-center mb-4">
              <p className="text-gray-300 text-sm">
                <span className="text-blue-400 font-semibold">Optional:</span> You can share manually also after your game
              </p>
            </div>
            
            {/* Side by side buttons */}
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(challengeUrls.opponentChallenge);
                  // You could add a toast notification here
                }}
                className="flex-1 py-2 px-2 bg-gradient-to-r from-purple-600/60 to-pink-600/60 hover:from-purple-600 hover:to-pink-600 text-white text-xs font-medium rounded-lg border border-purple-400/30 transition-all duration-300 hover:scale-105"
              >
                <span className="flex items-center justify-center gap-1">
                  <span className="text-xs">📋</span>
                  <span>Copy</span>
                </span>
              </Button>
              
              <Button
                onClick={() => {
                  setCreatedChallengeId(null);
                  setChallengeUrls(null);
                  setSelectedUser(null);
                  setSearchTerm('');
                  setBetAmount('1');
                  setChallengeResult('');
                }}
                className="flex-1 py-2 px-2 bg-gradient-to-r from-gray-600/60 to-gray-700/60 hover:from-gray-600 hover:to-gray-700 text-white text-xs font-medium rounded-lg border border-gray-500/30 transition-all duration-300 hover:scale-105"
              >
                <span className="flex items-center justify-center gap-1">
                  <span className="text-xs">🔄</span>
                  <span>New</span>
                </span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const renderError = (error: Error | null) => {
  if (!error) return null;
  if (error instanceof BaseError) {
    const isUserRejection = error.walk(
      (e) => e instanceof UserRejectedRequestError
    );

    if (isUserRejection) {
      return <div className="text-red-500 text-xs mt-1">Rejected by user.</div>;
    }
  }

  return <div className="text-red-500 text-xs mt-1">{error.message}</div>;
};
