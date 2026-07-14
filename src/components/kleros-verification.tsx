"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, useChainId, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { formatUnits } from "viem";

import { Badge } from "@/components/ui/badge";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChallengeAgentDialog } from "@/components/pgtcr/challenge-agent-dialog";
import { CurateLinkButton } from "@/components/pgtcr/curate-link-button";
import { ERC20_ABI } from "@/lib/abi/erc20";
import PermanentGTCRAbi from "@/lib/abi/PermanentGTCR.json";
import type { AgentSubgraphNetwork } from "@/lib/agent-networks";
import type { PgtcrItemWithChallengesAndEvidence } from "@/lib/pgtcr-subgraph";
import { getPgtcrRemovalReason } from "@/lib/pgtcr-status";
import { useVerificationEnvironment } from "@/components/verification-environment-provider";
import type { VerificationEnvironment } from "@/lib/verification-environment";
import { executeConfirmedTransaction } from "@/lib/confirmed-transaction";

type VerificationResponse =
    | {
          success: true;
          agentId: string;
          verified: boolean;
          found: boolean;
          status: string | null;
          itemID: string | null;
          disputed: boolean | null;
          network: AgentSubgraphNetwork | null;
          curateRegistryUrl: string;
          curateItemUrl: string | null;
          verificationEnvironment: VerificationEnvironment;
          chainId: number;
      }
    | { success: false; error: string };

type PgtcrItemApiResponse =
    | { success: true; verificationEnvironment: VerificationEnvironment; chainId: number; item: PgtcrItemWithChallengesAndEvidence | null }
    | { success: false; error: string };

type PgtcrRegistryApiResponse =
    | {
          success: true;
          verificationEnvironment: VerificationEnvironment;
          chainId: number;
          registry: { id: string; token: string; tokenSymbol?: string | null; tokenDecimals?: number | null };
      }
    | { success: false; error: string };

export function KlerosCurateVerification(props: {
    agentId: string | number;
    agentName?: string;
    agentUri?: string | null;
    owner?: string;
    network?: AgentSubgraphNetwork;
}) {
    const agentId = String(props.agentId);
    const { environment, deployment, withEnvironment } = useVerificationEnvironment();

    const [data, setData] = useState<VerificationResponse | null>(null);
    const [pgtcrItem, setPgtcrItem] = useState<PgtcrItemApiResponse | null>(null);
    const [pgtcrToken, setPgtcrToken] = useState<`0x${string}` | null>(null);
    const [pgtcrRegistryAddress, setPgtcrRegistryAddress] = useState<`0x${string}` | null>(null);
    const [pgtcrTokenMeta, setPgtcrTokenMeta] = useState<{ symbol: string | null; decimals: number | null }>({
        symbol: null,
        decimals: null,
    });
    const [withdrawing, setWithdrawing] = useState(false);
    const [withdrawConfirmOpen, setWithdrawConfirmOpen] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        async function run() {
            setLoading(true);
            try {
                const params = new URLSearchParams({ agentId });
                if (props.network) params.set("network", props.network);
                params.set("verificationEnvironment", environment);
                const res = await fetch(`/api/kleros/verification?${params.toString()}`);
                const json = (await res.json()) as VerificationResponse;
                if (cancelled) return;
                setData(json);

                // If we have a PGTCR itemID, hydrate stake/deposit for UX (collateral display).
                if (json.success && json.itemID) {
                    try {
                        const [itemRes, regRes] = await Promise.all([
                            fetch(`/api/pgtcr/item?itemID=${encodeURIComponent(json.itemID)}&verificationEnvironment=${environment}`, { cache: "no-store" }),
                            fetch(`/api/pgtcr/registry?verificationEnvironment=${environment}`, { cache: "no-store" }),
                        ]);
                        const [itemJson, regJson] = await Promise.all([
                            itemRes.json() as Promise<PgtcrItemApiResponse>,
                            regRes.json() as Promise<PgtcrRegistryApiResponse>,
                        ]);
                        if (!cancelled) {
                            setPgtcrItem(itemJson);
                            setPgtcrToken(regJson.success ? (regJson.registry.token as `0x${string}`) : null);
                            setPgtcrRegistryAddress(regJson.success ? (regJson.registry.id as `0x${string}`) : null);
                            setPgtcrTokenMeta(
                                regJson.success
                                    ? {
                                          symbol: regJson.registry.tokenSymbol ?? null,
                                          decimals: regJson.registry.tokenDecimals ?? null,
                                      }
                                    : { symbol: null, decimals: null }
                            );
                        }
                    } catch {
                        if (!cancelled) {
                            setPgtcrItem(null);
                            setPgtcrToken(null);
                            setPgtcrRegistryAddress(null);
                            setPgtcrTokenMeta({ symbol: null, decimals: null });
                        }
                    }
                } else {
                    setPgtcrItem(null);
                    setPgtcrToken(null);
                    setPgtcrRegistryAddress(null);
                    setPgtcrTokenMeta({ symbol: null, decimals: null });
                }
            } catch (e) {
                if (!cancelled) setData({ success: false, error: e instanceof Error ? e.message : "Unknown error" });
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        run();
        return () => {
            cancelled = true;
        };
    }, [agentId, environment, props.network]);

    // IMPORTANT: hooks must be called unconditionally (before any early returns).
    const { address, isConnected } = useAccount();
    const chainId = useChainId();
    const publicClient = usePublicClient({ chainId: deployment.chainId });
    const { writeContractAsync } = useWriteContract();

    const tokenDecimals = useReadContract({
        address: (pgtcrToken ?? undefined) as `0x${string}` | undefined,
        abi: ERC20_ABI,
        functionName: "decimals",
        chainId: deployment.chainId,
        query: { enabled: Boolean(pgtcrToken) },
    }).data as number | undefined;

    const tokenSymbol = useReadContract({
        address: (pgtcrToken ?? undefined) as `0x${string}` | undefined,
        abi: ERC20_ABI,
        functionName: "symbol",
        chainId: deployment.chainId,
        query: { enabled: Boolean(pgtcrToken) },
    }).data as string | undefined;

    const resolvedTokenDecimals = tokenDecimals ?? pgtcrTokenMeta.decimals ?? 18;
    const resolvedTokenSymbol = tokenSymbol || pgtcrTokenMeta.symbol || "";


    const submitter = pgtcrItem && pgtcrItem.success && pgtcrItem.item?.submitter ? pgtcrItem.item.submitter : null;
    const itemStatus = pgtcrItem && pgtcrItem.success ? (pgtcrItem.item?.status || null) : null;
    const effectiveStatus = itemStatus || (data?.success ? data.status : null);
    const withdrawingTimestampStr = pgtcrItem && pgtcrItem.success ? (pgtcrItem.item?.withdrawingTimestamp || "0") : "0";
    const withdrawingTimestamp = Number(withdrawingTimestampStr || "0");
    const removalReason = getPgtcrRemovalReason({
        status: effectiveStatus,
        withdrawingTimestamp: withdrawingTimestampStr,
        challenges: pgtcrItem && pgtcrItem.success ? pgtcrItem.item?.challenges : undefined,
    });

    const withdrawingPeriod = useReadContract({
        address: (pgtcrRegistryAddress ?? undefined) as `0x${string}` | undefined,
        abi: PermanentGTCRAbi,
        functionName: "withdrawingPeriod",
        chainId: deployment.chainId,
        query: { enabled: Boolean(pgtcrRegistryAddress) },
    }).data as bigint | undefined;

    const nowSec = Math.floor(Date.now() / 1000);
    const withdrawingPeriodSec = withdrawingPeriod ? Number(withdrawingPeriod) : null;
    const withdrawingPeriodLabel = (() => {
        if (!withdrawingPeriodSec) return "the configured withdrawal period";
        const d = Math.floor(withdrawingPeriodSec / 86400);
        const h = Math.floor((withdrawingPeriodSec % 86400) / 3600);
        if (d > 0) return `${d}d ${h}h`;
        const m = Math.floor((withdrawingPeriodSec % 3600) / 60);
        return `${h}h ${m}m`;
    })();

    const canManageWithdraw = Boolean(
        data?.success &&
        data.itemID &&
        submitter &&
        address &&
        submitter.toLowerCase() === address.toLowerCase() &&
        effectiveStatus &&
        effectiveStatus !== "Absent" &&
        effectiveStatus !== "Disputed"
    );

    const canStartWithdraw = Boolean(canManageWithdraw && withdrawingTimestamp === 0);
    const canFinalizeWithdraw = Boolean(
        canManageWithdraw &&
        withdrawingTimestamp > 0 &&
        withdrawingPeriodSec !== null &&
        nowSec >= withdrawingTimestamp + withdrawingPeriodSec
    );





    async function onWithdrawItem() {
        if (!data || data.success === false || !data.itemID) return;
        if (!publicClient || !pgtcrRegistryAddress) return;
        if (!isConnected || !address) return;
        if (chainId !== deployment.chainId) return;

        setWithdrawing(true);
        try {
            const functionName = withdrawingTimestamp === 0 ? "startWithdrawItem" : "withdrawItem";
            toast.message(`Checking ${withdrawingTimestamp === 0 ? "withdrawal start" : "withdrawal"} and waiting for confirmation…`);
            await executeConfirmedTransaction({
                simulate: async () =>
                    (
                        await publicClient.simulateContract({
                            account: address,
                            address: pgtcrRegistryAddress,
                            abi: PermanentGTCRAbi,
                            functionName,
                            args: [data.itemID as `0x${string}`],
                        })
                    ).request,
                write: (request) => writeContractAsync(request),
                wait: (hash) => publicClient.waitForTransactionReceipt({ hash }),
            });
            toast.success(withdrawingTimestamp === 0 ? "Withdrawal period started." : "Withdrawal confirmed.");
            window.location.reload();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Withdrawal failed.");
        } finally {
            setWithdrawing(false);
        }
    }

    async function copyAddress(value: string) {
        try {
            await navigator.clipboard.writeText(value);
            toast.success("Address copied");
        } catch {
            toast.error("Failed to copy address");
        }
    }

    if (loading) {
        return (
            <Badge variant="secondary" className="bg-muted text-muted-foreground border-border">
                Checking collateral…
            </Badge>
        );
    }

    if (!data || data.success === false) {
        return (
            <Badge variant="secondary" className="bg-muted text-muted-foreground border-border">
                Collateral unknown
            </Badge>
        );
    }

    const hasCurateRecord = Boolean(data.found && data.itemID);
    const hasActiveCollateral = Boolean(hasCurateRecord && effectiveStatus !== "Absent");
    const isDisputed = Boolean((data.disputed || effectiveStatus === "Disputed") && removalReason === null);
    const isWithdrawn = removalReason === "withdrawn";
    const isCollateralLost = removalReason === "challengerWon" || removalReason === "removed";
    const collateralBadgeTone =
        isCollateralLost
            ? "border-red-500/30 bg-red-500/15 text-red-200"
            : isWithdrawn
              ? "border-orange-500/30 bg-orange-500/15 text-orange-200"
              : isDisputed
                ? "border-amber-500/30 bg-amber-500/15 text-amber-200"
                : data.verified
                  ? "border-emerald-500/30 bg-emerald-500/20 text-emerald-400"
                  : "border-amber-500/30 bg-amber-500/15 text-amber-200";
    const collateralBadgeLabel =
        isCollateralLost
            ? "Collateral lost"
            : isWithdrawn
              ? "Withdrawn"
              : isDisputed
                  ? "Collateralized - currently disputed"
                  : data.verified
                    ? "Collateral verified"
                    : "Collateral submitted";

    if (hasCurateRecord && data.itemID) {
        const stake =
            pgtcrItem && pgtcrItem.success && pgtcrItem.item
                ? BigInt(pgtcrItem.item.stake || "0")
                : null;

        return (
            <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge className={collateralBadgeTone}>
                        {collateralBadgeLabel}
                    </Badge>

                    {stake !== null ? (
                        <Badge
                            variant="outline"
                            className={`font-mono ${
                                isCollateralLost
                                    ? "border-red-500/30 text-red-200 line-through opacity-70"
                                    : isWithdrawn
                                      ? "border-orange-500/30 text-orange-200 line-through opacity-70"
                                      : ""
                            }`}
                        >
                            {isCollateralLost
                                ? "Collateral lost:"
                                : isWithdrawn
                                  ? "Collateral withdrawn:"
                                  : "Collateral:"}{" "}
                            {formatUnits(stake, resolvedTokenDecimals)} {resolvedTokenSymbol}
                        </Badge>
                    ) : null}

                    {hasActiveCollateral && !isDisputed ? <ChallengeAgentDialog itemID={data.itemID} /> : null}

                    {canStartWithdraw ? (
                        <Button size="sm" variant="outline" onClick={() => (withdrawingTimestamp === 0 ? setWithdrawConfirmOpen(true) : void onWithdrawItem())} disabled={withdrawing || chainId !== deployment.chainId}>
                            {withdrawing ? "Starting…" : "Start withdraw"}
                        </Button>
                    ) : null}

                    {canFinalizeWithdraw ? (
                        <Button size="sm" variant="outline" onClick={() => void onWithdrawItem()} disabled={withdrawing || chainId !== deployment.chainId}>
                            {withdrawing ? "Executing…" : "Execute withdrawal"}
                        </Button>
                    ) : null}

                    {canManageWithdraw && withdrawingTimestamp > 0 && !canFinalizeWithdraw ? (
                        <>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Badge variant="secondary">Withdraw initiated by owner</Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                    During this period, the item is still registered and the owner remains expected to keep it compliant until withdrawal can be finalized.
                                </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button size="sm" variant="outline" disabled>
                                        Execute withdrawal
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Available once the withdrawal period ends.</TooltipContent>
                            </Tooltip>
                        </>
                    ) : null}

                </div>

                {data.verified && submitter ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">Funded by:</span>
                        <a
                            href={`${deployment.explorerBaseUrl}/address/${submitter}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono underline-offset-2 hover:underline"
                        >
                            {submitter.slice(0, 6)}…{submitter.slice(-4)}
                        </a>
                        <button onClick={() => void copyAddress(submitter)} className="text-muted-foreground hover:text-foreground">
                            <Copy className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ) : null}

                <Dialog open={withdrawConfirmOpen} onOpenChange={setWithdrawConfirmOpen}>
                    <DialogContent className="max-w-lg">
                        <DialogHeader>
                            <DialogTitle>Withdraw Item Warning</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3 text-sm text-muted-foreground">
                            <p>You may start withdrawal when you no longer wish or believe you can maintain this listing&apos;s compliance.</p>
                            <p>The live waiting period is <span className="font-mono">{withdrawingPeriodLabel}</span>. The item remains registered and disputable during that time, and a successful challenge may affect the stake.</p>
                            <p>After the period ends, you must return and confirm a separate transaction to finalize withdrawal.</p>
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setWithdrawConfirmOpen(false)}>Cancel</Button>
                            <Button
                                onClick={() => {
                                    setWithdrawConfirmOpen(false);
                                    void onWithdrawItem();
                                }}
                                disabled={withdrawing || chainId !== deployment.chainId}
                            >
                                {withdrawing ? "Starting…" : "Start withdraw"}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        );
    }

    // Not collateralized
    return (
        <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-red-500/20 text-red-300 border-red-500/30">Not collateralized in Curate.</Badge>

            <Button asChild size="sm">
                <Link href={withEnvironment(`/submit/${encodeURIComponent(agentId)}?network=${props.network || "sepolia"}`)}>Submit Agent</Link>
            </Button>

            <Button size="sm" variant="outline" disabled>
                Moderate - Coming soon
            </Button>

            <CurateLinkButton href={withEnvironment("/verified")} external={false} size="sm">
                View Registry
            </CurateLinkButton>
        </div>
    );
}
