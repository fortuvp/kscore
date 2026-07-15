"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http, fallback } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";
import { injected, metaMask, walletConnect } from "wagmi/connectors";
import { VerificationEnvironmentProvider } from "@/components/verification-environment-provider";

const queryClient = new QueryClient();

const preferredSepoliaRpcUrl = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL?.trim();
const sepoliaRpcUrls = [
  preferredSepoliaRpcUrl,
  ...sepolia.rpcUrls.default.http,
].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
const ethereumRpcUrls = [
  process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL?.trim(),
  ...mainnet.rpcUrls.default.http,
].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);

const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
const appOrigin =
  typeof window !== "undefined" && window.location.origin !== "null"
    ? window.location.origin
    : process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://kleros.io";

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
            name: "KSCORE",
            description: "ERC-8004 Agents Explorer Demo",
            url: appOrigin,
            icons: [`${appOrigin}/favicon.ico`],
          },
        }),
      ]
    : []),
];

export const wagmiConfig = createConfig({
  chains: [sepolia, mainnet],
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
    [mainnet.id]: fallback(
      ethereumRpcUrls.map((rpcUrl) =>
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
      <QueryClientProvider client={queryClient}>
        <VerificationEnvironmentProvider>{children}</VerificationEnvironmentProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
