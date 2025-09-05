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
import { base, degen, mainnet, monadTestnet, optimism, unichain } from "wagmi/chains";
import { BaseError, parseEther, UserRejectedRequestError, encodeFunctionData, parseAbi } from "viem";
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
  { title }: { title?: string } = { title: "Frames v2 Demo" }
) {
  const [isSDKLoaded, setIsSDKLoaded] = useState(false);
  const [context, setContext] = useState<Context.MiniAppContext>();
  const [token, setToken] = useState<string | null>(null);
  const [isContextOpen, setIsContextOpen] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  const [added, setAdded] = useState(false);
  const [notificationDetails, setNotificationDetails] =
    useState<MiniAppNotificationDetails | null>(null);

  const [lastEvent, setLastEvent] = useState("");

  const [addFrameResult, setAddFrameResult] = useState("");
  const [sendNotificationResult, setSendNotificationResult] = useState("");

  useEffect(() => {
    setNotificationDetails(context?.client.notificationDetails ?? null);
  }, [context]);

  const { address, isConnected } = useAccount();
  const chainId = useChainId();

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
      // Just check if frame is added, not requiring notifications
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
        setAdded(false); // Mark as not subscribed when notifications are disabled
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
          ? `Added, got notificaton token ${result.notificationDetails.token} and url ${result.notificationDetails.url}`
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

  const signTyped = useCallback(() => {
    signTypedData({
      domain: {
        name: "Frames v2 Demo",
        version: "1",
        chainId,
      },
      types: {
        Message: [{ name: "content", type: "string" }],
      },
      message: {
        content: "Hello from Frames v2!",
      },
      primaryType: "Message",
    });
  }, [chainId, signTypedData]);

  const toggleContext = useCallback(() => {
    setIsContextOpen((prev) => !prev);
  }, []);

  const { publicKey: solanaPublicKey } = useSolanaWallet();
  const solanaAddress = solanaPublicKey?.toBase58();

  if (!isSDKLoaded) {
    return <div>Loading...</div>;
  }

  return (
    <div
      style={{
        paddingTop: context?.client.safeAreaInsets?.top ?? 0,
        paddingBottom: context?.client.safeAreaInsets?.bottom ?? 0,
        paddingLeft: context?.client.safeAreaInsets?.left ?? 0,
        paddingRight: context?.client.safeAreaInsets?.right ?? 0,
      }}
    >
      <div className="w-[300px] mx-auto py-4 px-4">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold mb-2">🚀 ZTyping Space Game</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Type fast, destroy aliens, reach the stars!
          </p>
        </div>

        {/* Main Game Section */}
        <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-gray-800 dark:to-gray-700 rounded-lg border">
          <div className="text-center mb-4">
            <h2 className="text-lg font-semibold mb-2">🎮 Play ZTyping Game</h2>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
              Epic space typing shooter with increasing difficulty
            </p>
          </div>
          
          <Button 
            onClick={() => window.location.href = '/ztype'} 
            className="w-full mb-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
          >
            🚀 Launch Game
          </Button>

          {/* Add Frame to Client */}
          <div className="border-t pt-3">
            <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
              Subscribe for game updates & leaderboards
            </div>
            {addFrameResult && (
              <div className="mb-2 text-xs p-2 bg-green-50 dark:bg-green-900 rounded border text-green-700 dark:text-green-300">
                ✅ {addFrameResult}
              </div>
            )}
            <Button 
              onClick={addFrame} 
              disabled={added}
              className="w-full text-xs"
            >
              {added ? "✅ Subscribed to Updates" : "🔔 Subscribe to Game Updates"}
            </Button>
            
            {/* Commented notification send */}
            {/* {notificationDetails && (
              <Button 
                onClick={sendNotification} 
                className="w-full mt-2 text-xs"
                disabled={!notificationDetails}
              >
                📨 Test Notification
              </Button>
            )} */}
          </div>
        </div>

        {/* Wallet Section */}
        {address && (
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border">
            <h3 className="font-semibold mb-3 text-sm">💳 Wallet Connected</h3>
            <div className="text-xs space-y-2">
              <div>
                <span className="text-gray-600 dark:text-gray-400">Address:</span>
                <div className="font-mono bg-white dark:bg-gray-700 p-1 rounded mt-1">
                  {truncateAddress(address)}
                </div>
              </div>
              {chainId && (
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Chain:</span>
                  <div className="font-mono">{chainId}</div>
                </div>
              )}
            </div>
            
            <div className="mt-3 space-y-2">
              <Button
                onClick={() => isConnected ? disconnect() : connect({ connector: config.connectors[0] })}
                className="w-full text-xs"
              >
                {isConnected ? "Disconnect" : "Connect Wallet"}
              </Button>
            </div>
          </div>
        )}

        {/* Web3 Actions */}
        {isConnected && (
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border">
            <h3 className="font-semibold mb-3 text-sm">⚡ Web3 Actions</h3>
            <div className="space-y-2">
              <Button
                onClick={handleSwitchChain}
                disabled={isSwitchChainPending}
                isLoading={isSwitchChainPending}
                className="w-full text-xs"
              >
                Switch to {nextChain.name}
              </Button>
              
              <Button
                onClick={signTyped}
                disabled={!isConnected || isSignTypedPending}
                isLoading={isSignTypedPending}
                className="w-full text-xs"
              >
                Sign Typed Data
              </Button>
              
              <SendEth />
              
              <Button
                onClick={sendTx}
                disabled={!isConnected || isSendTxPending}
                isLoading={isSendTxPending}
                className="w-full text-xs"
              >
                Send Transaction
              </Button>
              
              <TestBatchOperation />
            </div>
            
            {/* Transaction Status */}
            {txHash && (
              <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900 rounded text-xs">
                <div className="font-semibold text-blue-700 dark:text-blue-300">Transaction:</div>
                <div className="font-mono">{truncateAddress(txHash)}</div>
                <div className="text-blue-600 dark:text-blue-400">
                  {isConfirming ? "Confirming..." : isConfirmed ? "Confirmed!" : "Pending"}
                </div>
              </div>
            )}
            
            {/* Errors */}
            {isSendTxError && (
              <div className="mt-2 p-2 bg-red-50 dark:bg-red-900 rounded text-xs text-red-700 dark:text-red-300">
                {renderError(sendTxError)}
              </div>
            )}
            {isSignTypedError && (
              <div className="mt-2 p-2 bg-red-50 dark:bg-red-900 rounded text-xs text-red-700 dark:text-red-300">
                {renderError(signTypedError)}
              </div>
            )}
            {isSwitchChainError && (
              <div className="mt-2 p-2 bg-red-50 dark:bg-red-900 rounded text-xs text-red-700 dark:text-red-300">
                {renderError(switchChainError)}
              </div>
            )}
          </div>
        )}

        {/* Game Stats / Last Event */}
        <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border">
          <h3 className="font-semibold mb-2 text-sm">📊 Game Events</h3>
          <div className="text-xs">
            <div className="font-mono p-2 bg-white dark:bg-gray-700 rounded">
              {lastEvent || "No recent events"}
            </div>
          </div>
        </div>

        {/* Client Info */}
        <div className="text-center text-xs text-gray-500 dark:text-gray-400">
          <div>Client FID: {context?.client.clientFid}</div>
          <div className="mt-1">
            {added ? "🟢 Frame Added" : "⚪ Frame Not Added"} • 
            {notificationDetails ? " 🔔 Notifications On" : " 🔕 Notifications Off"}
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
  const { data: walletClient } = useWalletClient();
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
  }, [walletClient, address]);

  const handleSendCalls = useCallback(async () => {
    if (!walletClient || !address) {
      setError('No wallet client or address');
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
  }, [walletClient, address, forceAtomic, switchChain]);

  const handleSendCallsApproveAndTransfer = useCallback(async () => {
    if (!walletClient || !address) {
      setApproveTransferError('No wallet client or address');
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
  }, [walletClient, address, switchChain]);

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
            disabled={!isConnected || isGettingCapabilities}
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
            disabled={!isConnected || isSendingCalls}
            isLoading={isSendingCalls}
          >
            Send Batch Calls
          </Button>
        </div>

        <div className="mb-4">
          <Button
            onClick={handleSendCallsApproveAndTransfer}
            disabled={!isConnected || isSendingApproveTransfer}
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
