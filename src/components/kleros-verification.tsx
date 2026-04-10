"use client";

import { useEffect, useState } from "react";
import { useAccount, useChainId, useReadContract, useWriteContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import { formatUnits } from "viem";

import { Badge } from "@/components/ui/badge";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { getAddressExplorerUrlForNetwork } from "@/lib/block-explorer";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReportAbuseDialog } from "@/components/reality/report-abuse-dialog";
import { CollateralizeAgentDialog } from "@/components/pgtcr/collateralize-agent-dialog";
import { ChallengeAgentDialog } from "@/components/pgtcr/challenge-agent-dialog";
import { CurateLinkButton } from "@/components/pgtcr/curate-link-button";
import { ERC20_ABI } from "@/lib/abi/erc20";
import PermanentGTCRAbi from "@/lib/abi/PermanentGTCR.json";
import type { AgentSubgraphNetwork } from "@/lib/agent-networks";

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
      }
    | { success: false; error: string };

type PgtcrItemApiResponse =
    | { success: true; item: { stake: string; arbitrationDeposit: string; submitter?: string | null; status?: string; withdrawingTimestamp?: string } | null }
    | { success: false; error: string };

type PgtcrRegistryApiResponse =
    | { success: true; registry: { id: string; token: string; tokenSymbol?: string | null; tokenDecimals?: number | null } }
    | { success: false; error: string };

export function KlerosCurateVerification(props: {
    agentId: string | number;
    agentName?: string;
    agentUri?: string | null;
    owner?: string;
    network?: AgentSubgraphNetwork;
}) {
    const agentId = String(props.agentId);

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
                const res = await fetch(`/api/kleros/verification?${params.toString()}`);
                const json = (await res.json()) as VerificationResponse;
                if (cancelled) return;
                setData(json);

                // If we have a PGTCR itemID, hydrate stake/deposit for UX (collateral display).
                if (json.success && json.itemID) {
                    try {
                        const [itemRes, regRes] = await Promise.all([
                            fetch(`/api/pgtcr/item?itemID=${encodeURIComponent(json.itemID)}`, { cache: "no-store" }),
                            fetch(`/api/pgtcr/registry`, { cache: "no-store" }),
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
    }, [agentId, props.network]);

    // IMPORTANT: hooks must be called unconditionally (before any early returns).
    const { address, isConnected } = useAccount();
    const chainId = useChainId();
    const { writeContractAsync } = useWriteContract();

    const tokenDecimals = useReadContract({
        address: (pgtcrToken ?? undefined) as `0x${string}` | undefined,
        abi: ERC20_ABI,
        functionName: "decimals",
        query: { enabled: Boolean(pgtcrToken) },
    }).data as number | undefined;

    const tokenSymbol = useReadContract({
        address: (pgtcrToken ?? undefined) as `0x${string}` | undefined,
        abi: ERC20_ABI,
        functionName: "symbol",
        query: { enabled: Boolean(pgtcrToken) },
    }).data as string | undefined;

    const resolvedTokenDecimals = tokenDecimals ?? pgtcrTokenMeta.decimals ?? 18;
    const resolvedTokenSymbol = tokenSymbol || pgtcrTokenMeta.symbol || "";


    const submitter = pgtcrItem && pgtcrItem.success && pgtcrItem.item?.submitter ? pgtcrItem.item.submitter : null;
    const itemStatus = pgtcrItem && pgtcrItem.success ? (pgtcrItem.item?.status || null) : null;
    const withdrawingTimestampStr = pgtcrItem && pgtcrItem.success ? (pgtcrItem.item?.withdrawingTimestamp || "0") : "0";
    const withdrawingTimestamp = Number(withdrawingTimestampStr || "0");

    const withdrawingPeriod = useReadContract({
        address: (pgtcrRegistryAddress ?? undefined) as `0x${string}` | undefined,
        abi: PermanentGTCRAbi,
        functionName: "withdrawingPeriod",
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
        itemStatus &&
        itemStatus !== "Absent" &&
        itemStatus !== "Disputed"
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
        if (!pgtcrRegistryAddress) return;
        if (!isConnected || !address) return;
        if (chainId !== sepolia.id) return;

        setWithdrawing(true);
        try {
            if (withdrawingTimestamp === 0) {
                await writeContractAsync({
                    address: pgtcrRegistryAddress,
                    abi: PermanentGTCRAbi,
                    functionName: "startWithdrawItem",
                    args: [data.itemID as `0x${string}`],
                });
            } else {
                await writeContractAsync({
                    address: pgtcrRegistryAddress,
                    abi: PermanentGTCRAbi,
                    functionName: "withdrawItem",
                    args: [data.itemID as `0x${string}`],
                });
            }
            window.setTimeout(() => window.location.reload(), 1200);
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

    const collateralized = Boolean(data.found && data.itemID);
    const isDisputed = Boolean(data.disputed || itemStatus === "Disputed");
    const isWithdrawn = itemStatus === "Absent" && withdrawingTimestamp > 0;

    if (collateralized && data.itemID) {
        const stake =
            pgtcrItem && pgtcrItem.success && pgtcrItem.item
                ? BigInt(pgtcrItem.item.stake || "0")
                : null;

        return (
            <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge className={isWithdrawn ? "bg-red-500/15 text-red-200 border-red-500/30" : isDisputed ? "bg-amber-500/15 text-amber-200 border-amber-500/30" : data.verified ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-amber-500/15 text-amber-200 border-amber-500/30"}>
                        {isWithdrawn ? "Withdrawn" : isDisputed ? "Collateralized - currently disputed" : data.verified ? "Collateral verified" : "Collateral submitted"}
                    </Badge>

                    {stake !== null ? (
                        <Badge variant="outline" className={`font-mono ${isWithdrawn ? "line-through opacity-70" : ""}`}>
                            Collateralized:{" "}
                            {formatUnits(stake, resolvedTokenDecimals)} {resolvedTokenSymbol}
                        </Badge>
                    ) : null}

                    {!isDisputed && !isWithdrawn ? <ChallengeAgentDialog itemID={data.itemID} /> : null}

                    {canStartWithdraw ? (
                        <Button size="sm" variant="outline" onClick={() => (withdrawingTimestamp === 0 ? setWithdrawConfirmOpen(true) : void onWithdrawItem())} disabled={withdrawing || chainId !== sepolia.id}>
                            {withdrawing ? "Starting…" : "Start withdraw"}
                        </Button>
                    ) : null}

                    {canFinalizeWithdraw ? (
                        <Button size="sm" variant="outline" onClick={() => void onWithdrawItem()} disabled={withdrawing || chainId !== sepolia.id}>
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
                            href={getAddressExplorerUrlForNetwork(submitter, props.network || "sepolia") || "#"}
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
                            <p><span className="font-medium text-foreground">Once you start the withdrawal process,</span> this item will be removed from the registry after the withdrawal period. This action cannot be undone.</p>
                            <p><span className="font-medium text-foreground">Withdrawal Timing.</span> Withdrawing an item takes <span className="font-mono">{withdrawingPeriodLabel}</span>. After starting the withdrawal, you must wait for this period to complete before the item is permanently removed from the registry.</p>
                            <p>Are you sure you want to withdraw this agent from the registry? This will initiate the withdrawal period after which the item will be permanently removed.</p>
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setWithdrawConfirmOpen(false)}>Cancel</Button>
                            <Button
                                onClick={() => {
                                    setWithdrawConfirmOpen(false);
                                    void onWithdrawItem();
                                }}
                                disabled={withdrawing || chainId !== sepolia.id}
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

            <CollateralizeAgentDialog agentId={agentId} />

            <ReportAbuseDialog
                agentId={agentId}
                agentName={props.agentName}
                agentUri={props.agentUri}
                owner={props.owner}
                network={props.network}
            />

            <CurateLinkButton href="/verified" external={false} size="sm">
                View Registry
            </CurateLinkButton>
        </div>
    );
}
