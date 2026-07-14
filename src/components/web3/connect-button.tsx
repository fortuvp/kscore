"use client";

import * as React from "react";
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { truncateAddress } from "@/lib/format";
import { getAddressExplorerUrl } from "@/lib/block-explorer";
import { useVerificationEnvironment } from "@/components/verification-environment-provider";

type WalletKind = "metamask" | "rabby" | "walletconnect";

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

const WALLET_ICON_URLS: Record<WalletKind, string | null> = {
  metamask: walletConnectProjectId
    ? `https://explorer-api.walletconnect.com/v3/logo/md/eebe4a7f-7166-402f-92e0-1f64ca2aa800?projectId=${walletConnectProjectId}`
    : null,
  rabby: walletConnectProjectId
    ? `https://explorer-api.walletconnect.com/v3/logo/md/255e6ba2-8dfd-43ad-e88e-57cbb98f6800?projectId=${walletConnectProjectId}`
    : "https://raw.githubusercontent.com/RabbyHub/logo/master/logo.svg",
  walletconnect: "https://cdn.sanity.io/files/1t8iva7t/production/0e5e20646c3067b55046c65e1000ed4a3b28f596.svg",
};

const WALLET_LABELS: Record<WalletKind, string> = {
  metamask: "MetaMask",
  rabby: "Rabby",
  walletconnect: "WalletConnect",
};

function getChainLabel(chainId: number | undefined) {
  if (!chainId) return "Unknown";
  if (chainId === sepolia.id) return "Sepolia";
  if (chainId === mainnet.id) return "Ethereum";
  return `Chain ${chainId}`;
}

function WalletLogo({ kind }: { kind: WalletKind }) {
  const [imageFailed, setImageFailed] = React.useState(false);
  const src = WALLET_ICON_URLS[kind];

  if (src && !imageFailed) {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded border border-white/20 bg-white/5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={`${WALLET_LABELS[kind]} logo`}
          className="h-4 w-4 object-contain"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      </span>
    );
  }

  if (kind === "metamask") {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-orange-500/30 bg-orange-500/20 text-[10px] font-semibold text-orange-400">
        M
      </span>
    );
  }
  if (kind === "rabby") {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-sky-500/30 bg-sky-500/20 text-[10px] font-semibold text-sky-400">
        R
      </span>
    );
  }
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-blue-500/30 bg-blue-500/20 text-[10px] font-semibold text-blue-400">
      WC
    </span>
  );
}

export function ConnectButton({ compact = false }: { compact?: boolean } = {}) {
  const { address, isConnected } = useAccount();
  const { connectors, connect, status, error } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain, status: switchStatus, error: switchError } = useSwitchChain();
  const { environment, deployment } = useVerificationEnvironment();
  const onSelectedChain = chainId === deployment.chainId;

  const walletOptions = React.useMemo(() => {
    const seen = new Set<string>();
    const entries: Array<{ kind: WalletKind; label: string; connector: (typeof connectors)[number] }> = [];

    const pushFirstMatch = (
      kind: WalletKind,
      label: string,
      matcher: (connector: (typeof connectors)[number]) => boolean
    ) => {
      const connector = connectors.find((candidate) => {
        if (seen.has(candidate.uid)) return false;
        return matcher(candidate);
      });
      if (!connector) return;
      seen.add(connector.uid);
      entries.push({ kind, label, connector });
    };

    pushFirstMatch("metamask", "MetaMask", (connector) => {
      const id = connector.id.toLowerCase();
      const name = connector.name.toLowerCase();
      return id.includes("metamask") || name.includes("metamask");
    });

    pushFirstMatch("rabby", "Rabby", (connector) => {
      const id = connector.id.toLowerCase();
      const name = connector.name.toLowerCase();
      return id.includes("rabby") || name.includes("rabby");
    });

    pushFirstMatch("walletconnect", "WalletConnect", (connector) => {
      const id = connector.id.toLowerCase();
      const name = connector.name.toLowerCase();
      return id.includes("walletconnect") || name.includes("walletconnect");
    });

    return entries;
  }, [connectors]);

  if (!isConnected) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm">{compact ? "Wallet" : "Connect wallet"}</Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72">
          <div className="space-y-3">
            <div>
              <div className="text-sm font-medium">Connect</div>
              <div className="text-xs text-muted-foreground">
                {deployment.label}: {deployment.chainName}
              </div>
            </div>
            <div className="space-y-2">
              {walletOptions.map(({ kind, label, connector }) => (
                <Button
                  key={connector.uid}
                  variant="outline"
                  className="w-full justify-between"
                  disabled={status === "pending"}
                  onClick={() => connect({ connector, chainId: deployment.chainId })}
                >
                  <span className="inline-flex items-center gap-2">
                    <WalletLogo kind={kind} />
                    {label}
                  </span>
                  {status === "pending" ? (
                    <span className="text-xs text-muted-foreground">Connecting...</span>
                  ) : null}
                </Button>
              ))}
            </div>
            {error ? (
              <div className="text-xs text-red-400">{error.message}</div>
            ) : null}
            {!process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ? (
              <div className="text-[11px] text-muted-foreground">
                WalletConnect is disabled: set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID.
              </div>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        {compact ? (
          <Button variant="ghost" size="sm" className="px-2 font-mono text-xs text-white/75 hover:text-white">
            {truncateAddress(address || "")}
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="gap-2">
            <span className="font-mono">{truncateAddress(address || "")}</span>
            <Badge variant="secondary" className={onSelectedChain ? "" : "bg-red-500/20 text-red-300 border-red-500/30"}>
              {getChainLabel(chainId)}
            </Badge>
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-3">
          <div>
            <div className="text-sm font-medium">Wallet</div>
            <div className="text-xs text-muted-foreground font-mono">
              {(() => {
                const walletExplorerUrl = getAddressExplorerUrl(address || "", chainId);
                return walletExplorerUrl ? (
                  <a href={walletExplorerUrl} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                    {address}
                  </a>
                ) : (
                  address
                );
              })()}
            </div>
          </div>

          {!onSelectedChain ? (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3">
              <div className="text-sm font-medium text-red-200">Wrong network</div>
              <div className="text-xs text-red-200/80">
                Switch to {deployment.chainName} to use {environment} verification features.
              </div>
              <Button
                className="mt-2 w-full"
                size="sm"
                onClick={() => switchChain({ chainId: deployment.chainId })}
                disabled={switchStatus === "pending"}
              >
                {switchStatus === "pending" ? "Switching..." : `Switch to ${deployment.chainName}`}
              </Button>
              {switchError ? (
                <div className="mt-2 text-xs text-red-300">{switchError.message}</div>
              ) : null}
            </div>
          ) : null}

          <Button variant="ghost" className="w-full" onClick={() => disconnect()}>
            Disconnect
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
