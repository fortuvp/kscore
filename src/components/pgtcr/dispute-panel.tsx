"use client";

import * as React from "react";
import { toast } from "sonner";
import { useAccount, useBalance, useChainId, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { formatEther, formatUnits } from "viem";

import PermanentGTCRAbi from "@/lib/abi/PermanentGTCR.json";
import { ERC20_ABI } from "@/lib/abi/erc20";
import { IARBITRATOR_ABI } from "@/lib/abi/iArbitrator";
import { executeConfirmedTransaction } from "@/lib/confirmed-transaction";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useVerificationEnvironment } from "@/components/verification-environment-provider";

type RegistryApiResponse =
  | {
      success: true;
      registry: {
        id: string;
        token: string;
        tokenSymbol?: string | null;
        tokenDecimals?: number | null;
        arbitrator: { id: string };
        challengeStakeMultiplier: string;
        winnerStakeMultiplier: string;
        loserStakeMultiplier: string;
        sharedStakeMultiplier: string;
        arbitrationSettings: Array<{ metaEvidenceURI: string; arbitratorExtraData: string }>;
      };
    }
  | { success: false; error: string };

type ItemApiResponse =
  | {
      success: true;
      item: {
        itemID: string;
        status: string;
        stake: string;
        challenges: Array<{
          disputeID: string;
          resolutionTime?: string | null;
          challenger: string;
          challengerStake: string;
          itemStake: string;
          arbitrationSetting: { arbitratorExtraData: string };
          rounds: Array<{
            appealPeriodStart: string;
            appealPeriodEnd: string;
            ruling: string;
            hasPaidRequester: boolean;
            hasPaidChallenger: boolean;
            amountPaidRequester: string;
            amountPaidChallenger: string;
          }>;
        }>;
      } | null;
    }
  | { success: false; error: string };

const PARTY_REQUESTER = 1;
const PARTY_CHALLENGER = 2;

function mulDiv(a: bigint, b: bigint, div: bigint): bigint {
  if (div === 0n) return 0n;
  return (a * b) / div;
}

function formatTokenAmount(value: bigint, decimals: number | undefined, symbol: string | undefined) {
  return `${formatUnits(value, decimals ?? 18)} ${symbol || "TOKEN"}`;
}

export function PgtcrDisputePanel(props: { itemID: string; className?: string }) {
  const { environment, deployment } = useVerificationEnvironment();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: deployment.chainId });
  const { writeContractAsync } = useWriteContract();

  const [registry, setRegistry] = React.useState<RegistryApiResponse | null>(null);
  const [item, setItem] = React.useState<ItemApiResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [refreshTick, setRefreshTick] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const query = new URLSearchParams({ verificationEnvironment: environment });
        const itemQuery = new URLSearchParams({ itemID: props.itemID, verificationEnvironment: environment });
        const [rRes, iRes] = await Promise.all([
          fetch(`/api/pgtcr/registry?${query}`, { cache: "no-store" }),
          fetch(`/api/pgtcr/item?${itemQuery}`, { cache: "no-store" }),
        ]);
        const [rJson, iJson] = await Promise.all([
          rRes.json() as Promise<RegistryApiResponse>,
          iRes.json() as Promise<ItemApiResponse>,
        ]);
        if (cancelled) return;
        setRegistry(rJson);
        setItem(iJson);
      } catch (error) {
        if (!cancelled) {
          setRegistry({ success: false, error: error instanceof Error ? error.message : "Failed to load registry" });
          setItem({ success: false, error: error instanceof Error ? error.message : "Failed to load item" });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [environment, props.itemID, refreshTick]);

  const registryAddress = registry && registry.success ? (registry.registry.id as `0x${string}`) : undefined;
  const tokenAddress = registry && registry.success ? (registry.registry.token as `0x${string}`) : undefined;
  const arbitratorAddress = registry && registry.success ? (registry.registry.arbitrator.id as `0x${string}`) : undefined;
  const latestChallenge = item && item.success && item.item ? item.item.challenges?.[0] : null;
  const activeDispute = latestChallenge && !latestChallenge.resolutionTime ? latestChallenge : null;
  const latestRound = activeDispute?.rounds?.[0] || null;
  const challengeArbitratorExtraData = activeDispute?.arbitrationSetting?.arbitratorExtraData as
    | `0x${string}`
    | undefined;

  const tokenDecimals = useReadContract({
    chainId: deployment.chainId,
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "decimals",
    query: { enabled: Boolean(tokenAddress) },
  }).data as number | undefined;

  const tokenSymbol = useReadContract({
    chainId: deployment.chainId,
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "symbol",
    query: { enabled: Boolean(tokenAddress) },
  }).data as string | undefined;
  const resolvedTokenDecimals = tokenDecimals ?? (registry && registry.success ? registry.registry.tokenDecimals ?? undefined : undefined) ?? 18;
  const resolvedTokenSymbol = tokenSymbol || (registry && registry.success ? registry.registry.tokenSymbol || undefined : undefined) || "TOKEN";

  const multiplierDivisor = useReadContract({
    chainId: deployment.chainId,
    address: registryAddress,
    abi: PermanentGTCRAbi,
    functionName: "MULTIPLIER_DIVISOR",
    query: { enabled: Boolean(registryAddress) },
  }).data as bigint | undefined;

  const appealCost = useReadContract({
    chainId: deployment.chainId,
    address: arbitratorAddress,
    abi: IARBITRATOR_ABI,
    functionName: "appealCost",
    args:
      activeDispute && challengeArbitratorExtraData
        ? [BigInt(activeDispute.disputeID || "0"), challengeArbitratorExtraData]
        : undefined,
    query: {
      enabled: Boolean(
        activeDispute &&
          arbitratorAddress &&
          challengeArbitratorExtraData
      ),
    },
  }).data as bigint | undefined;

  const nativeBalance = useBalance({
    address,
    chainId: deployment.chainId,
    query: { enabled: Boolean(address) },
  }).data?.value;

  const itemStake = item && item.success && item.item ? BigInt(item.item.stake || "0") : 0n;
  const challengeStakeMultiplier = registry && registry.success ? BigInt(registry.registry.challengeStakeMultiplier || "0") : 0n;
  const requiredChallengeStake = React.useMemo(() => {
    if (!multiplierDivisor) return 0n;
    return mulDiv(itemStake, challengeStakeMultiplier, multiplierDivisor);
  }, [itemStake, challengeStakeMultiplier, multiplierDivisor]);

  const nowSec = Math.floor(Date.now() / 1000);

  const winnerStakeMultiplier = registry && registry.success ? BigInt(registry.registry.winnerStakeMultiplier || "0") : 0n;
  const loserStakeMultiplier = registry && registry.success ? BigInt(registry.registry.loserStakeMultiplier || "0") : 0n;
  const sharedStakeMultiplier = registry && registry.success ? BigInt(registry.registry.sharedStakeMultiplier || "0") : 0n;

  function rulingKind(r: string | undefined): "none" | "requester" | "challenger" {
    const value = String(r || "").toLowerCase();
    if (!value || value === "none" || value === "0") return "none";
    if (value === "accept" || value === "1" || value === "requester") return "requester";
    if (value === "reject" || value === "2" || value === "challenger") return "challenger";
    return "none";
  }

  function multiplierForSide(side: number): bigint {
    if (!latestRound) return sharedStakeMultiplier;
    const ruling = latestRound.ruling;
    if (ruling === "None") return sharedStakeMultiplier;

    const requesterWins = ruling === "Accept";
    const sideIsRequester = side === PARTY_REQUESTER;
    const sideWins = sideIsRequester ? requesterWins : !requesterWins;
    return sideWins ? winnerStakeMultiplier : loserStakeMultiplier;
  }

  function totalFeeForSide(side: number): bigint {
    if (!appealCost || !multiplierDivisor) return 0n;
    const multiplier = multiplierForSide(side);
    return appealCost + mulDiv(appealCost, multiplier, multiplierDivisor);
  }

  function sideName(side: number) {
    return side === PARTY_REQUESTER ? "Requester" : "Challenger";
  }

  function sideFundingState(side: number): { canFund: boolean; reason?: string; remaining: bigint } {
    if (!activeDispute || !latestRound) {
      return { canFund: false, reason: "No active appeal round.", remaining: 0n };
    }

    const start = Number(latestRound.appealPeriodStart || "0");
    const end = Number(latestRound.appealPeriodEnd || "0");
    if (!start || !end || nowSec < start) {
      return { canFund: false, reason: "Appeal period not open yet.", remaining: 0n };
    }

    const sideIsRequester = side === PARTY_REQUESTER;
    const hasPaid = sideIsRequester ? latestRound.hasPaidRequester : latestRound.hasPaidChallenger;
    if (hasPaid) {
      return { canFund: false, reason: "This side is already fully funded.", remaining: 0n };
    }

    const ruling = rulingKind(latestRound.ruling);
    const deadline =
      ruling === "none"
        ? end
        : (ruling === "requester") === sideIsRequester
          ? end
          : Math.floor(start + (end - start) / 2);

    if (nowSec >= deadline) {
      return {
        canFund: false,
        reason: ruling === "none" ? "Appeal period closed." : `Funding window closed for ${sideName(side)} side.`,
        remaining: 0n,
      };
    }

    const paid = BigInt(sideIsRequester ? latestRound.amountPaidRequester : latestRound.amountPaidChallenger);
    const total = totalFeeForSide(side);
    const remaining = total > paid ? total - paid : 0n;

    if (remaining === 0n) {
      return { canFund: false, reason: "This side is already fully funded.", remaining: 0n };
    }

    if (nativeBalance !== undefined && nativeBalance < remaining) {
      return { canFund: false, reason: "Insufficient ETH balance.", remaining };
    }

    return { canFund: true, remaining };
  }

  async function onFundAppeal(side: number) {
    if (!isConnected || !address) {
      toast.error("Connect your wallet.");
      return;
    }
    if (chainId !== deployment.chainId) {
      toast.error(`Switch to ${deployment.chainName}.`);
      return;
    }
    if (!publicClient || !registryAddress || !activeDispute) {
      toast.error("No active dispute.");
      return;
    }

    const fundingState = sideFundingState(side);
    if (!fundingState.canFund) {
      toast.error(fundingState.reason || "Funding not available for this side right now.");
      return;
    }

    setSubmitting(true);
    try {
      toast.message("Checking appeal contribution and waiting for confirmation…");
      await executeConfirmedTransaction({
        simulate: async () =>
          (
            await publicClient.simulateContract({
              account: address,
              address: registryAddress,
              abi: PermanentGTCRAbi,
              functionName: "fundAppeal",
              args: [props.itemID as `0x${string}`, side],
              value: fundingState.remaining,
            })
          ).request,
        write: (request) => writeContractAsync(request),
        wait: (hash) => publicClient.waitForTransactionReceipt({ hash }),
      });
      toast.success("Appeal contribution confirmed.");
      setRefreshTick((value) => value + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Funding failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className={cn("rounded-lg border border-border p-4 text-sm text-muted-foreground", props.className)}>
        Loading Curate dispute…
      </div>
    );
  }

  if (!activeDispute) return null;

  const requesterState = sideFundingState(PARTY_REQUESTER);
  const challengerState = sideFundingState(PARTY_CHALLENGER);

  return (
    <section className={cn("rounded-xl border border-amber-500/30 bg-amber-500/10 p-5", props.className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-amber-200">Curate dispute active</div>
          <div className="mt-1 text-xs text-amber-100/80">
            Appeal funding and dispute tracking live here instead of inside the challenge popup.
          </div>
        </div>
        <Button asChild size="sm" variant="outline" className="border-amber-400/35 bg-transparent text-amber-100 hover:bg-amber-400/10">
          <a href={`https://klerosboard.com/#!/dispute/${deployment.chainId}/${activeDispute.disputeID}`} target="_blank" rel="noreferrer">
            Klerosboard
          </a>
        </Button>
      </div>

      <div className="mt-4 grid gap-3 text-sm lg:grid-cols-2">
        <div className="rounded-lg border border-amber-400/20 bg-black/10 p-3">
          <div className="text-[11px] uppercase tracking-wide text-amber-100/70">Item ID</div>
          <div className="mt-1 break-all font-mono text-xs text-amber-50">{props.itemID}</div>
        </div>
        <div className="rounded-lg border border-amber-400/20 bg-black/10 p-3">
          <div className="text-[11px] uppercase tracking-wide text-amber-100/70">Dispute</div>
          <div className="mt-1 text-sm text-amber-50">
            #{activeDispute.disputeID} by <span className="font-mono text-xs">{activeDispute.challenger}</span>
          </div>
        </div>
        <div className="rounded-lg border border-amber-400/20 bg-black/10 p-3">
          <div className="text-[11px] uppercase tracking-wide text-amber-100/70">Challenge stake</div>
          <div className="mt-1 text-sm text-amber-50">{formatTokenAmount(requiredChallengeStake, resolvedTokenDecimals, resolvedTokenSymbol)}</div>
        </div>
        <div className="rounded-lg border border-amber-400/20 bg-black/10 p-3">
          <div className="text-[11px] uppercase tracking-wide text-amber-100/70">Latest ruling</div>
          <div className="mt-1 text-sm text-amber-50">{latestRound?.ruling || "None"}</div>
          {latestRound?.appealPeriodEnd && Number(latestRound.appealPeriodEnd) > 0 ? (
            <div className="mt-1 text-xs text-amber-100/70">
              Appeal ends {new Date(Number(latestRound.appealPeriodEnd) * 1000).toLocaleString()}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button
          size="sm"
          variant="outline"
          className="border-amber-400/35 bg-transparent text-amber-100 hover:bg-amber-400/10"
          onClick={() => void onFundAppeal(PARTY_REQUESTER)}
          disabled={submitting || !requesterState.canFund}
          title={requesterState.reason}
        >
          Fund appeal (Requester)
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-amber-400/35 bg-transparent text-amber-100 hover:bg-amber-400/10"
          onClick={() => void onFundAppeal(PARTY_CHALLENGER)}
          disabled={submitting || !challengerState.canFund}
          title={challengerState.reason}
        >
          Fund appeal (Challenger)
        </Button>
      </div>

      <div className="mt-3 space-y-1 text-xs text-amber-100/80">
        <div>Loser side can only fund during the first half of the appeal period; winner side can fund until the end.</div>
        {requesterState.remaining > 0n ? <div>Requester side remaining: {formatEther(requesterState.remaining)} ETH</div> : null}
        {challengerState.remaining > 0n ? <div>Challenger side remaining: {formatEther(challengerState.remaining)} ETH</div> : null}
        {!isConnected ? <div>Connect your wallet to fund an appeal.</div> : null}
        {isConnected && chainId !== deployment.chainId ? <div className="text-red-200">Wrong network. Switch to {deployment.chainName}.</div> : null}
        {isConnected &&
        chainId === deployment.chainId &&
        nativeBalance !== undefined &&
        (requesterState.reason === "Insufficient ETH balance." || challengerState.reason === "Insufficient ETH balance.") ? (
          <div className="text-red-200">Insufficient balance.</div>
        ) : null}
      </div>
    </section>
  );
}
