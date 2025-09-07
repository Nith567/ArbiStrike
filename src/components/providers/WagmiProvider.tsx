import { createConfig, http, WagmiProvider } from "wagmi";
import { base, degen, mainnet, optimism, unichain,arbitrum } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";

export const config = createConfig({
  chains: [optimism, base, mainnet, degen, unichain, arbitrum],
  transports: {
    [base.id]: http(),
    [optimism.id]: http(),
    [degen.id]: http(),
    [mainnet.id]: http(),
    [arbitrum.id]: http(),
    [unichain.id]: http(),
  },
  connectors: [farcasterMiniApp()],
});

const queryClient = new QueryClient();

export default function Provider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
