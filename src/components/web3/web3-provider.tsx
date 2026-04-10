"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http, fallback } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected, metaMask, walletConnect } from "wagmi/connectors";

const queryClient = new QueryClient();

const preferredSepoliaRpcUrl = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL?.trim();
if (!preferredSepoliaRpcUrl) {
  throw new Error("Missing env var NEXT_PUBLIC_SEPOLIA_RPC_URL");
}

const sepoliaRpcUrls = [
  preferredSepoliaRpcUrl,
  ...sepolia.rpcUrls.default.http,
].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);

const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

const connectors = [
  // Dedicated MetaMask connector avoids provider collisions when multiple injected wallets are installed.
  metaMask(),

  // Rabby
  injected({ target: "rabby", shimDisconnect: true }),

  ...(wcProjectId
    ? [
        walletConnect({
          projectId: wcProjectId,
          showQrModal: true,
          metadata: {
            name: "DEX8004",
            description: "ERC-8004 Agents Explorer Demo",
            url: "http://localhost:3000",
            icons: ["http://localhost:3000/favicon.ico"],
          },
        }),
      ]
    : []),
];

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors,
  pollingInterval: 15_000,
  transports: {
    [sepolia.id]: fallback(
      sepoliaRpcUrls.map((rpcUrl) =>
        http(rpcUrl, {
          retryCount: 1,
          retryDelay: 250,
        })
      ),
      {
        retryCount: 0,
      }
    ),
  },
  ssr: true,
});

export function Web3Provider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
