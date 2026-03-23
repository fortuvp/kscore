"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
    ArrowLeft,
    Share2,
    MessageSquare,
    Clock,
    Copy,
    Calendar,
    RefreshCw,
    Loader2,
    Shield,
    ShieldAlert,
    ShieldCheck,
    History,
    ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { AgentWithDetails } from "@/types/agent";
import { truncateAddress, getDisplayName, formatDateTime, formatRelativeTime } from "@/lib/format";
import { KlerosCurateVerification } from "@/components/kleros-verification";
import { CurateLinkButton } from "@/components/pgtcr/curate-link-button";
import { PgtcrDisputePanel } from "@/components/pgtcr/dispute-panel";
import { EvidenceSection } from "@/components/pgtcr/evidence-section";
import { CreateOfferDialog } from "@/components/marketplace/create-offer-dialog";
import { useOffersForAgent } from "@/lib/marketplace/use-offers-for-agent";
import { formatEther } from "viem";
import {
    type AbuseFlag,
    getFlagsForAgent,
    isAgentFlagged,
} from "@/lib/reality/abuse-flags";
import { useRealityQuestions } from "@/lib/reality/use-questions";
import { bytes32ToYesNo } from "@/lib/reality/encoding";
import { doesQuestionMatchAgent } from "@/lib/reality/question-match";
import { getAgentChainLabel, isAgentSubgraphNetwork } from "@/lib/agent-networks";
import { getAddressExplorerUrl, getAddressExplorerUrlForNetwork, getTxExplorerUrl, getTxExplorerUrlForNetwork, truncateHash } from "@/lib/block-explorer";

type Tab = "overview" | "metadata";

function looksLikeAgentId(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith("eip155:")) return true;
    return /^\d+$/.test(trimmed);
}

export default function AgentDetailPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const id = params.id as string;
    const rawNetwork = searchParams.get("network");
    const network = isAgentSubgraphNetwork(rawNetwork) ? rawNetwork : "sepolia";
    const lookup = searchParams.get("lookup");
    const backToAgentsHref = `/agents?network=${network}`;

    const [agent, setAgent] = useState<AgentWithDetails | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [curateFallbackUrl, setCurateFallbackUrl] = useState<string | null>(null);
    const [fallbackItemId, setFallbackItemId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>("overview");
    const [flaggedReports, setFlaggedReports] = useState<AbuseFlag[]>([]);
    const [curateItemId, setCurateItemId] = useState<string | null>(null);
    const [pgtcrRegistryAddress, setPgtcrRegistryAddress] = useState<`0x${string}` | null>(null);
    const [pgtcrItem, setPgtcrItem] = useState<{
        status?: string;
        itemID?: string;
        submitter?: string;
        includedAt?: string;
        stake?: string;
        withdrawingTimestamp?: string;
        challenges?: Array<{ createdAt?: string; resolutionTime?: string | null; challenger?: string; disputeID?: string }>;
        evidences?: Array<{ timestamp?: string; txHash?: string; party?: string }>;
    } | null>(null);
    const [historyTx, setHistoryTx] = useState<{ createdTxHash: string | null; updatedTxHash: string | null } | null>(null);

    const offers = useOffersForAgent(agent?.agentId ? String(agent.agentId) : "");
    const realityQuestions = useRealityQuestions();
    const flagged = agent?.agentId ? isAgentFlagged(String(agent.agentId)) : false;

    useEffect(() => {
        async function fetchAgent() {
            setIsLoading(true);
            setError(null);
            setCurateFallbackUrl(null);
            setFallbackItemId(null);
            try {
                const shouldTryAgentIdFirst = lookup === "agentId" || looksLikeAgentId(id);
                const primaryUrl = shouldTryAgentIdFirst
                    ? `/api/agents/by-agent-id?agentId=${encodeURIComponent(id)}&network=${encodeURIComponent(network)}`
                    : `/api/agents/${encodeURIComponent(id)}?network=${encodeURIComponent(network)}`;

                const primaryResponse = await fetch(primaryUrl);
                const primaryData = await primaryResponse.json();

                if (primaryData?.success && (primaryData?.agent || primaryData?.item)) {
                    setAgent((primaryData.agent || primaryData.item) as AgentWithDetails);
                    return;
                }

                const fallbackUrl = shouldTryAgentIdFirst
                    ? `/api/agents/${encodeURIComponent(id)}?network=${encodeURIComponent(network)}`
                    : `/api/agents/by-agent-id?agentId=${encodeURIComponent(id)}&network=${encodeURIComponent(network)}`;
                const fallbackResponse = await fetch(fallbackUrl);
                const fallbackData = await fallbackResponse.json();

                if (fallbackData?.success && (fallbackData?.agent || fallbackData?.item)) {
                    setAgent((fallbackData.agent || fallbackData.item) as AgentWithDetails);
                } else {
                    setError(fallbackData?.error || primaryData?.error || "Failed to load agent");
                    if (shouldTryAgentIdFirst) {
                        try {
                            const vRes = await fetch(`/api/kleros/verification?agentId=${encodeURIComponent(id)}&network=${encodeURIComponent(network)}`);
                            const vJson = await vRes.json();
                            if (vJson?.success && vJson?.curateItemUrl) setCurateFallbackUrl(vJson.curateItemUrl);
                            if (vJson?.success && vJson?.itemID) setFallbackItemId(vJson.itemID);
                        } catch {}
                    }
                }
            } catch {
                setError("Failed to fetch agent details");
                if (lookup === "agentId") {
                    try {
                        const vRes = await fetch(`/api/kleros/verification?agentId=${encodeURIComponent(id)}&network=${encodeURIComponent(network)}`);
                        const vJson = await vRes.json();
                        if (vJson?.success && vJson?.curateItemUrl) setCurateFallbackUrl(vJson.curateItemUrl);
                        if (vJson?.success && vJson?.itemID) setFallbackItemId(vJson.itemID);
                    } catch {}
                }
            } finally {
                setIsLoading(false);
            }
        }
        if (id) fetchAgent();
    }, [id, network, lookup]);

    useEffect(() => {
        if (!agent?.agentId) {
            setCurateItemId(null);
            setPgtcrRegistryAddress(null);
            setPgtcrItem(null);
            return;
        }
        const agentId = String(agent.agentId);
        let cancelled = false;
        async function hydrateCurate() {
            try {
                const [regRes, verRes] = await Promise.all([
                    fetch("/api/pgtcr/registry", { cache: "no-store" }),
                    fetch(`/api/kleros/verification?agentId=${encodeURIComponent(agentId)}&network=${network}`, { cache: "no-store" }),
                ]);
                const regJson = (await regRes.json()) as { success: boolean; registry?: { id: string }; error?: string };
                const verJson = (await verRes.json()) as { success: boolean; itemID?: string | null; error?: string };
                if (cancelled) return;
                if (regJson.success && regJson.registry?.id) {
                    setPgtcrRegistryAddress(regJson.registry.id as `0x${string}`);
                } else {
                    setPgtcrRegistryAddress(null);
                }
                if (verJson.success && verJson.itemID) {
                    setCurateItemId(verJson.itemID);
                } else {
                    setCurateItemId(null);
                }

                if (verJson.success && verJson.itemID) {
                    try {
                        const itemRes = await fetch(`/api/pgtcr/item?itemID=${encodeURIComponent(verJson.itemID)}`, { cache: "no-store" });
                        const itemJson = await itemRes.json();
                        if (cancelled) return;
                        if (itemJson?.success && itemJson?.item) setPgtcrItem(itemJson.item);
                        else setPgtcrItem(null);
                    } catch {
                        if (!cancelled) setPgtcrItem(null);
                    }
                } else {
                    setPgtcrItem(null);
                }
            } catch {
                if (!cancelled) {
                    setPgtcrRegistryAddress(null);
                    setCurateItemId(null);
                    setPgtcrItem(null);
                }
            }
        }
        void hydrateCurate();
        return () => { cancelled = true; };
    }, [agent?.agentId, network]);

    useEffect(() => {
        if (!agent?.agentId) {
            setFlaggedReports([]);
            return;
        }

        const refreshReports = () => setFlaggedReports(getFlagsForAgent(String(agent.agentId)));
        refreshReports();
        window.addEventListener("storage", refreshReports);
        return () => window.removeEventListener("storage", refreshReports);
    }, [agent?.agentId]);

    useEffect(() => {
        if (!agent?.owner || !agent?.chainId || !agent?.createdAt) {
            setHistoryTx(null);
            return;
        }
        const currentAgent = agent;

        let cancelled = false;
        async function loadHistoryTx() {
            try {
                const params = new URLSearchParams({
                    chainId: String(currentAgent.chainId),
                    owner: String(currentAgent.owner),
                    createdAt: String(currentAgent.createdAt),
                    updatedAt: String(currentAgent.updatedAt || currentAgent.createdAt),
                });
                const res = await fetch(`/api/agents/history-tx?${params.toString()}`, { cache: "no-store" });
                const json = await res.json();
                if (cancelled) return;
                if (json?.success) {
                    setHistoryTx({
                        createdTxHash: json.createdTxHash || null,
                        updatedTxHash: json.updatedTxHash || null,
                    });
                } else {
                    setHistoryTx(null);
                }
            } catch {
                if (!cancelled) setHistoryTx(null);
            }
        }

        void loadHistoryTx();
        return () => {
            cancelled = true;
        };
    }, [agent?.owner, agent?.chainId, agent?.createdAt, agent?.updatedAt]);

    const copyToClipboard = async (text: string, label?: string) => {
        const value = text?.trim();
        if (!value) {
            toast.error(`No ${label || "text"} available to copy`);
            return;
        }

        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(value);
            } else {
                const input = document.createElement("textarea");
                input.value = value;
                input.setAttribute("readonly", "true");
                input.style.position = "absolute";
                input.style.left = "-9999px";
                document.body.appendChild(input);
                input.select();
                const copied = document.execCommand("copy");
                document.body.removeChild(input);
                if (!copied) throw new Error("Fallback copy failed");
            }

            toast.success(label ? `${label} copied to clipboard` : "Copied to clipboard");
        } catch {
            toast.error(`Failed to copy ${label || "text"}`);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (error || !agent) {
        return (
            <div className="min-h-screen">
                <div className="border-b border-border">
                    <div className="container mx-auto px-4 py-4 sm:px-6">
                        <Link
                            href={backToAgentsHref}
                            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Back to Agents
                        </Link>
                    </div>
                </div>
                <div className="container mx-auto px-4 py-16 text-center sm:px-6">
                    <h1 className="text-2xl font-bold">Agent Not Found</h1>
                    <p className="mt-2 text-muted-foreground">
                        {error || "The agent you're looking for doesn't exist."}
                    </p>
                    {curateFallbackUrl ? (
                        <div className="mt-4">
                            <Button asChild variant="outline">
                                <Link href={fallbackItemId ? `/submissions/${encodeURIComponent(fallbackItemId)}` : curateFallbackUrl} target={fallbackItemId ? undefined : "_blank"} rel="noreferrer">Open submission details</Link>
                            </Button>
                        </div>
                    ) : null}
                </div>
            </div>
        );
    }

    const totalFeedback = parseInt(agent.totalFeedback) || 0;
    const onChainReports = realityQuestions.data.filter((q) => {
        return doesQuestionMatchAgent(q.question, String(agent.agentId), network);
    });
    const flaggedReportsForNetwork = flaggedReports.filter((report) =>
        realityQuestions.data.some(
            (q) => q.questionId.toLowerCase() === report.questionId.toLowerCase() && doesQuestionMatchAgent(q.question, String(agent.agentId), network)
        )
    );
    const confirmedOnChainReports = onChainReports.filter(
        (q) => q.finalized && q.bestAnswer && bytes32ToYesNo(q.bestAnswer) === "YES"
    );
    const hasModerationReports = flaggedReportsForNetwork.length > 0 || onChainReports.length > 0;
    const curateViewUrl =
        curateItemId && pgtcrRegistryAddress
            ? `https://curate.kleros.io/tcr/11155111/${pgtcrRegistryAddress}/${curateItemId}`
            : null;
    const ownerExplorerUrl =
        getAddressExplorerUrl(agent.owner, agent.chainId) ||
        getAddressExplorerUrlForNetwork(agent.owner, network);
    const createdTxUrl =
        historyTx?.createdTxHash && getTxExplorerUrl(historyTx.createdTxHash, agent.chainId)
            ? getTxExplorerUrl(historyTx.createdTxHash, agent.chainId)
            : null;
    const updatedTxUrl =
        historyTx?.updatedTxHash && getTxExplorerUrl(historyTx.updatedTxHash, agent.chainId)
            ? getTxExplorerUrl(historyTx.updatedTxHash, agent.chainId)
            : null;

    const timeline: Array<{
        ts: number;
        badge: string;
        title: string;
        detail: string;
        tone: "neutral" | "good" | "warn";
        actor?: string;
        txHash?: string;
        href?: string;
    }> = [];
    const pushEvent = (
        tsRaw: string | number | null | undefined,
        badge: string,
        title: string,
        detail: string,
        tone: "neutral" | "good" | "warn" = "neutral",
        extra?: { actor?: string; txHash?: string; href?: string }
    ) => {
        const ts = Number(tsRaw);
        if (!Number.isFinite(ts) || ts <= 0) return;
        timeline.push({ ts, badge, title, detail, tone, actor: extra?.actor, txHash: extra?.txHash, href: extra?.href });
    };
    pushEvent(
        agent.createdAt,
        "Created",
        "Agent created",
        `${getAgentChainLabel(agent.chainId, network)} registry creation`,
        "good",
        { href: createdTxUrl || undefined }
    );
    pushEvent(
        agent.updatedAt,
        "Update",
        "Agent metadata updated",
        "Registration metadata or settings changed",
        "neutral",
        { href: updatedTxUrl || undefined }
    );
    if (agent.registrationFile?.active === false) {
        pushEvent(agent.updatedAt, "Retired", "Agent retired / inactive", "Marked inactive in registration", "warn");
    }
    if (pgtcrItem?.includedAt) {
        const collateral = pgtcrItem.stake ? `${formatEther(BigInt(pgtcrItem.stake))} ETH` : "Collateral submitted";
        pushEvent(
            pgtcrItem.includedAt,
            "Verified",
            "Collateral submitted",
            `${collateral}. This stake acts as an economic safety bond for this agent.`,
            "good",
            { actor: pgtcrItem.submitter, href: curateItemId && pgtcrRegistryAddress ? `https://curate.kleros.io/tcr/11155111/${pgtcrRegistryAddress}/${curateItemId}` : undefined }
        );
    }
    if (pgtcrItem?.withdrawingTimestamp && Number(pgtcrItem.withdrawingTimestamp) > 0) {
        pushEvent(
            pgtcrItem.withdrawingTimestamp,
            "Withdrawing",
            "Withdraw initiated",
            "Owner started withdrawal. Item stays registered until the withdrawal period ends.",
            "warn",
            { actor: pgtcrItem.submitter, href: curateItemId && pgtcrRegistryAddress ? `https://curate.kleros.io/tcr/11155111/${pgtcrRegistryAddress}/${curateItemId}` : undefined }
        );
    }

    (pgtcrItem?.challenges || []).forEach((challenge, index) => {
        const n = (pgtcrItem?.challenges?.length || 0) - index;
        pushEvent(
            challenge.createdAt,
            "Challenge",
            `Curate challenge #${n}`,
            "Challenge opened on Kleros Curate",
            "warn",
            {
                actor: challenge.challenger,
                href: challenge.disputeID ? `https://klerosboard.com/#!/dispute/11155111/${challenge.disputeID}` : undefined,
            }
        );
        if (challenge.resolutionTime) {
            pushEvent(challenge.resolutionTime, "Resolved", `Curate challenge #${n} resolved`, "Dispute resolution recorded", "good");
        }
    });
    (pgtcrItem?.evidences || []).forEach((evidence, index) => {
        const n = (pgtcrItem?.evidences?.length || 0) - index;
        pushEvent(evidence.timestamp, "Evidence", `Evidence submitted #${n}`, "Evidence added to Curate case", "neutral", {
            actor: evidence.party,
            txHash: evidence.txHash,
            href: evidence.txHash ? `https://sepolia.etherscan.io/tx/${evidence.txHash}` : undefined,
        });
    });
    pushEvent(agent.lastActivity, "Update", "Last observed activity", "Latest feedback/validation activity");
    timeline.sort((a, b) => b.ts - a.ts);

    const badgeClass = (tone: "neutral" | "good" | "warn") =>
        tone === "good"
            ? "border-emerald-400/40 bg-emerald-400/20 text-emerald-200 shadow-[0_0_7px_rgba(16,185,129,0.25)]"
            : tone === "warn"
              ? "border-amber-400/40 bg-amber-400/20 text-amber-100 shadow-[0_0_7px_rgba(251,191,36,0.24)]"
              : "border-cyan-400/40 bg-cyan-400/20 text-cyan-100 shadow-[0_0_7px_rgba(34,211,238,0.22)]";

    return (
        <div className="min-h-screen">
            {/* Back link */}
            <div className="border-b border-border">
                <div className="container mx-auto px-4 py-4 sm:px-6">
                    <Link
                        href={backToAgentsHref}
                        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Agents
                    </Link>
                </div>
            </div>

            {/* Agent header */}
            <div className="container mx-auto px-4 py-8 sm:px-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
                        <div className="mx-auto h-24 w-24 overflow-hidden rounded-lg bg-muted sm:mx-0">
                            {agent.registrationFile?.image ? (
                                <img
                                    src={agent.registrationFile.image}
                                    alt={getDisplayName(agent)}
                                    className="h-full w-full object-cover"
                                />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center text-4xl">🤖</div>
                            )}
                        </div>

                        <div className="min-w-0">
                            <h1 className="break-words text-2xl font-bold">{getDisplayName(agent)}</h1>
                            <div className="mt-2 flex flex-wrap items-center gap-3">
                                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                                    {getAgentChainLabel(agent.chainId, network)}
                                </Badge>
                            </div>

                            <div className="mt-3">
                                {/* Kleros Curate verification (key0 === agent.agentId) */}
                                <KlerosCurateVerification
                                    agentId={agent.agentId}
                                    agentName={getDisplayName(agent)}
                                    agentUri={agent.agentURI}
                                    owner={agent.owner}
                                    network={network}
                                />
                            </div>
                            {flagged || confirmedOnChainReports.length > 0 ? (
                                <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                                    <div className="font-medium text-amber-200">Flagged as potential abuse</div>
                                    <div className="text-amber-200/80">
                                        This agent has moderation activity with a YES abuse outcome.
                                    </div>
                                    <div className="mt-2">
                                        <Link
                                            href={`/moderation?q=${encodeURIComponent(agent.agentId)}`}
                                            className="text-amber-200 underline underline-offset-2 hover:text-amber-100"
                                        >
                                            Open moderation for this agent
                                        </Link>
                                    </div>
                                </div>
                            ) : null}

                            <p className="mt-2 max-w-2xl break-words text-muted-foreground">
                                {agent.registrationFile?.description || "No description available."}
                            </p>
                            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1.5">
                                    <MessageSquare className="h-4 w-4" />
                                    {totalFeedback} Reviews
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <Clock className="h-4 w-4" />
                                    Last active {formatRelativeTime(agent.lastActivity)}
                                </span>
                            </div>
                        </div>
                    </div>

                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full shrink-0 sm:w-auto"
                        onClick={() => void copyToClipboard(window.location.href, "Link")}
                    >
                        <Share2 className="mr-2 h-4 w-4" />
                        Share
                    </Button>
                </div>

                {/* Tabs */}
                <div className="mt-8 border-b border-border">
                    <div className="flex gap-8">
                        {(["overview", "metadata"] as Tab[]).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`pb-3 text-sm font-medium capitalize transition-colors ${
                                    activeTab === tab
                                        ? "border-b-2 border-cyan-400 text-foreground"
                                        : "text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Tab content */}
                <div className="mt-8">
                    {activeTab === "overview" && (
                        <>
                        <div className="grid gap-6 lg:grid-cols-3">
                            <div className="space-y-6 lg:col-span-2">
                                {curateItemId ? <PgtcrDisputePanel itemID={curateItemId} /> : null}

                                {/* Evidence (Curate / PGTCR) */}
                                {curateItemId && pgtcrRegistryAddress ? (
                                    <EvidenceSection itemID={curateItemId} registryAddress={pgtcrRegistryAddress} />
                                ) : (
                                    <div className="rounded-lg border border-border p-6">
                                        <h2 className="font-semibold">Evidence</h2>
                                        <p className="mt-2 text-sm text-muted-foreground">
                                            Evidence is available once the agent is collateralized in Curate.
                                        </p>
                                    </div>
                                )}

                                <div className="rounded-lg border border-border p-6">
                                    <div className="mb-4 flex items-center gap-2">
                                        <History className="h-5 w-5 text-cyan-300" />
                                        <div>
                                            <h2 className="font-semibold">History</h2>
                                            <p className="text-sm text-muted-foreground">Registry + Curate timeline</p>
                                        </div>
                                    </div>
                                    {timeline.length > 0 ? (
                                        <div className="space-y-4">
                                            {timeline.map((event, idx) => (
                                                <div key={`${event.title}-${event.ts}-${idx}`} className="flex gap-3">
                                                    <div className="mt-1 flex flex-col items-center">
                                                        {event.tone === "good" ? (
                                                            <ShieldCheck className="h-4 w-4 text-emerald-400" />
                                                        ) : event.tone === "warn" ? (
                                                            <ShieldAlert className="h-4 w-4 text-amber-300" />
                                                        ) : (
                                                            <Shield className="h-4 w-4 text-cyan-300" />
                                                        )}
                                                        {idx < timeline.length - 1 ? <div className="mt-2 h-9 w-px bg-border" /> : null}
                                                    </div>
                                                    <div className="min-w-0 flex-1 pb-2">
                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                            <div className="flex items-center gap-2">
                                                                <Badge variant="outline" className={`text-[10px] uppercase tracking-wide ${badgeClass(event.tone)}`}>{event.badge}</Badge>
                                                                <div className="text-sm font-medium">{event.title}</div>
                                                            </div>
                                                            <div className="text-xs text-muted-foreground">{formatDateTime(String(event.ts))}</div>
                                                        </div>
                                                        <div className="mt-1 text-xs text-muted-foreground">{event.detail}</div>
                                                        {event.actor ? (
                                                            <div className="mt-1 text-xs text-muted-foreground">by <span className="font-mono">{truncateAddress(event.actor)}</span></div>
                                                        ) : null}
                                                        {event.href ? (
                                                            <a href={event.href} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200">
                                                                See transaction <ExternalLink className="h-3 w-3" />
                                                            </a>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">No timeline events available yet.</p>
                                    )}
                                </div>

                                {/* Reviews */}
                                <div className="rounded-lg border border-border p-6">
                                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                        <h2 className="font-semibold">Reviews</h2>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Badge className="border-cyan-400/35 bg-cyan-400/12 text-cyan-200">
                                                {totalFeedback} total reviews
                                            </Badge>
                                            <Badge variant="outline" className="border-emerald-400/35 bg-emerald-400/10 text-emerald-200">
                                                {agent.feedback.length} loaded
                                            </Badge>
                                        </div>
                                    </div>
                                    {agent.feedback.length > 0 ? (
                                        <div className="space-y-4">
                                            {agent.feedback.map((review) => (
                                                <div key={review.id} className="rounded-lg border border-border p-4">
                                                    <div className="flex items-start justify-between">
                                                        <div>
                                                            {(() => {
                                                                const reviewTxUrl = review.txHash
                                                                    ? getTxExplorerUrl(review.txHash, agent.chainId) ||
                                                                      getTxExplorerUrlForNetwork(review.txHash, network)
                                                                    : null;
                                                                return (
                                                                    <>
                                                            <div className="flex items-center gap-2 text-sm">
                                                                {(() => {
                                                                    const reviewerExplorerUrl = getAddressExplorerUrl(
                                                                        review.clientAddress,
                                                                        agent.chainId
                                                                    ) || getAddressExplorerUrlForNetwork(review.clientAddress, network);
                                                                    return reviewerExplorerUrl ? (
                                                                        <a
                                                                            href={reviewerExplorerUrl}
                                                                            target="_blank"
                                                                            rel="noreferrer"
                                                                            className="font-mono text-muted-foreground underline-offset-2 hover:underline hover:text-foreground"
                                                                        >
                                                                            {truncateAddress(review.clientAddress)}
                                                                        </a>
                                                                    ) : (
                                                                        <span className="font-mono text-muted-foreground">
                                                                            {truncateAddress(review.clientAddress)}
                                                                        </span>
                                                                    );
                                                                })()}
                                                                <span className="text-muted-foreground">
                                                                    {formatRelativeTime(review.createdAt)}
                                                                </span>
                                                            </div>
                                                            {reviewTxUrl ? (
                                                                <a
                                                                    href={reviewTxUrl}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="mt-2 inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200"
                                                                >
                                                                    Tx {truncateHash(review.txHash!)}
                                                                    <ExternalLink className="h-3 w-3" />
                                                                </a>
                                                            ) : null}
                                                            <div className="mt-2 flex flex-wrap gap-1">
                                                                {review.tag1 && (
                                                                    <Badge variant="secondary" className="text-xs">
                                                                        {review.tag1}
                                                                    </Badge>
                                                                )}
                                                                {review.tag2 && (
                                                                    <Badge variant="secondary" className="text-xs">
                                                                        {review.tag2}
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            {review.feedbackFile?.text && (
                                                                <p className="mt-2 text-sm">
                                                                    {review.feedbackFile.text}
                                                                </p>
                                                            )}
                                                                    </>
                                                                );
                                                            })()}
                                                        </div>
                                                        <div className="rounded-lg bg-emerald-500/20 px-3 py-2 text-center">
                                                            <div className="text-lg font-bold text-emerald-400">
                                                                {review.value}
                                                            </div>
                                                            <div className="text-xs text-emerald-400/70">/100</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">No reviews yet.</p>
                                    )}
                                </div>

                                <div className="rounded-lg border border-border p-6">
                                    <div className="mb-4 flex items-center gap-2">
                                        <span className="text-xl">🔗</span>
                                        <div>
                                            <h2 className="font-semibold">Endpoints</h2>
                                            <p className="text-sm text-muted-foreground">Agent service endpoints</p>
                                        </div>
                                    </div>
                                    {agent.registrationFile?.mcpEndpoint || agent.registrationFile?.a2aEndpoint ? (
                                        <div className="space-y-3">
                                            {agent.registrationFile.mcpEndpoint && (
                                                <EndpointCard
                                                    type="MCP"
                                                    endpoint={agent.registrationFile.mcpEndpoint}
                                                    onCopy={() => void copyToClipboard(agent.registrationFile!.mcpEndpoint!, "MCP endpoint")}
                                                />
                                            )}
                                            {agent.registrationFile.a2aEndpoint && (
                                                <EndpointCard
                                                    type="A2A"
                                                    endpoint={agent.registrationFile.a2aEndpoint}
                                                    onCopy={() => void copyToClipboard(agent.registrationFile!.a2aEndpoint!, "A2A endpoint")}
                                                />
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">No endpoints configured.</p>
                                    )}
                                </div>
                            </div>

                            {/* Sidebar */}
                            <div className="space-y-6">
                                <div className="rounded-lg border border-border p-6">
                                    <h2 className="font-semibold mb-4">Basic Information</h2>
                                    <div className="space-y-4">
                                        <InfoRow
                                            label="AGENT ID"
                                            value={agent.agentId}
                                            onCopy={() => void copyToClipboard(agent.agentId, "Agent ID")}
                                        />
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-muted-foreground">OWNER</span>
                                            <div className="flex items-center gap-2">
                                                {ownerExplorerUrl ? (
                                                    <a
                                                        href={ownerExplorerUrl}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="font-mono text-sm underline-offset-2 hover:underline hover:text-foreground"
                                                    >
                                                        {truncateAddress(agent.owner)}
                                                    </a>
                                                ) : (
                                                    <span className="font-mono text-sm">{truncateAddress(agent.owner)}</span>
                                                )}
                                                <button
                                                    onClick={() => void copyToClipboard(agent.owner, "Owner address")}
                                                    className="text-muted-foreground hover:text-foreground"
                                                >
                                                    <Copy className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                        {agent.agentURI && (
                                            <InfoRow
                                                label="AGENT URI"
                                                value={agent.agentURI}
                                                truncate
                                                onCopy={() => void copyToClipboard(agent.agentURI!, "Agent URI")}
                                            />
                                        )}
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-muted-foreground">CREATED</span>
                                            <div className="flex items-center gap-2 text-sm">
                                                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                                {formatDateTime(agent.createdAt)}
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-muted-foreground">LAST UPDATED</span>
                                            <div className="flex items-center gap-2 text-sm">
                                                <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                                                {formatRelativeTime(agent.updatedAt)}
                                            </div>
                                        </div>
                                        {agent.registrationFile?.active !== null && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-muted-foreground">STATUS</span>
                                                <Badge
                                                    className={
                                                        agent.registrationFile?.active
                                                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                                            : "bg-red-500/20 text-red-400 border-red-500/30"
                                                    }
                                                >
                                                    {agent.registrationFile?.active ? "Active" : "Inactive"}
                                                </Badge>
                                            </div>
                                        )}
                                        {agent.registrationFile?.x402Support && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-muted-foreground">X402 SUPPORT</span>
                                                <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30">
                                                    Enabled
                                                </Badge>
                                            </div>
                                        )}

                                        <div className="pt-2">
                                            <CreateOfferDialog
                                                agentId={String(agent.agentId)}
                                                agentName={getDisplayName(agent)}
                                                agentUri={agent.agentURI}
                                                owner={agent.owner as `0x${string}`}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-lg border border-border p-6">
                                    <h2 className="font-semibold mb-2">Offers received</h2>
                                    <p className="text-sm text-muted-foreground">
                                        Offers received by this agent.
                                    </p>

                                    <div className="mt-4 space-y-3">
                                        {offers.status === "loading" ? (
                                            <div className="text-sm text-muted-foreground">Loading offers…</div>
                                        ) : offers.status === "error" ? (
                                            <div className="text-sm text-red-300">{offers.error}</div>
                                        ) : offers.data.length === 0 ? (
                                            <div className="text-sm text-muted-foreground">No offers yet.</div>
                                        ) : (
                                            offers.data.map((o) => (
                                                <div key={o.transactionId.toString()} className="rounded-md border border-border p-3">
                                                    <div className="text-xs text-muted-foreground">Agent ID</div>
                                                    <div className="font-mono text-sm">{agent.agentId}</div>
                                                    <div className="mt-2 text-xs text-muted-foreground font-mono">
                                                        from{" "}
                                                        {(() => {
                                                            const senderExplorerUrl = getAddressExplorerUrl(
                                                                o.sender,
                                                                agent.chainId
                                                            ) || getAddressExplorerUrlForNetwork(o.sender, network);
                                                            return senderExplorerUrl ? (
                                                                <a
                                                                    href={senderExplorerUrl}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="underline-offset-2 hover:underline hover:text-foreground"
                                                                >
                                                                    {truncateAddress(o.sender)}
                                                                </a>
                                                            ) : (
                                                                truncateAddress(o.sender)
                                                            );
                                                        })()}
                                                    </div>
                                                    <div className="mt-1 text-sm">
                                                        {formatEther(o.amount)} <span className="text-muted-foreground">ETH</span>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {hasModerationReports && (
                                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-6">
                                        <h2 className="font-semibold mb-2">Moderation reports</h2>
                                        <p className="text-sm text-muted-foreground">
                                            Reports linked to this agent on Reality.eth.
                                        </p>

                                        <div className="mt-4 space-y-3">
                                            {onChainReports.map((report) => (
                                                <div key={report.questionId} className="rounded-md border border-amber-500/20 bg-background/70 p-3">
                                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                                        <a
                                                            href={`https://reality.eth.limo/app/#!/question/${report.questionId}`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="font-mono text-xs underline-offset-2 hover:underline"
                                                        >
                                                            {truncateHash(report.questionId)}
                                                        </a>
                                                        <div className="text-xs text-muted-foreground">
                                                            {report.created ? new Date(Number(report.created) * 1000).toLocaleString() : "Unknown time"}
                                                        </div>
                                                    </div>
                                                    <div className="mt-2 text-xs text-muted-foreground">
                                                        Status:{" "}
                                                        {report.finalized
                                                            ? report.bestAnswer
                                                                ? bytes32ToYesNo(report.bestAnswer)
                                                                : "FINALIZED"
                                                            : "OPEN"}
                                                    </div>
                                                </div>
                                            ))}

                                            {onChainReports.length === 0 &&
                                                flaggedReportsForNetwork.map((report) => (
                                                    <div
                                                        key={`${report.questionId}-${report.flaggedAt}`}
                                                        className="rounded-md border border-amber-500/20 bg-background/70 p-3"
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <a
                                                                href={`https://reality.eth.limo/app/#!/question/${report.questionId}`}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="font-mono text-xs underline-offset-2 hover:underline"
                                                            >
                                                                {truncateHash(report.questionId)}
                                                            </a>
                                                            <span className="text-xs text-muted-foreground">
                                                                {new Date(report.flaggedAt).toLocaleString()}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                        </div>

                                        <div className="mt-4">
                                            <Button asChild size="sm" variant="outline">
                                                <Link href={`/moderation?q=${encodeURIComponent(agent.agentId)}`}>
                                                    Open moderation board
                                                </Link>
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        {curateViewUrl ? (
                            <div className="mt-6 rounded-xl border border-cyan-400/25 bg-cyan-500/5 p-4">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <div className="text-sm font-semibold text-cyan-200">Curate Item</div>
                                        <div className="text-xs text-muted-foreground">
                                            Open the canonical Curate record for this submission.
                                        </div>
                                    </div>
                                    <CurateLinkButton href={curateViewUrl}>
                                        View on Curate
                                    </CurateLinkButton>
                                </div>
                            </div>
                        ) : null}
                        </>
                    )}

                    {activeTab === "metadata" && (
                        <div className="rounded-lg border border-border p-6">
                            <div className="mb-4">
                                <h2 className="font-semibold">Offchain Content</h2>
                                <p className="text-sm text-muted-foreground">Parsed offchain metadata JSON</p>
                            </div>
                            <pre className="overflow-x-auto rounded-lg bg-muted/50 p-4 text-sm">
                                <code>{JSON.stringify(agent.registrationFile, null, 2)}</code>
                            </pre>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

const ENDPOINT_COLORS = {
    MCP: {
        border: "border-emerald-500/30",
        bg: "bg-emerald-500/5",
        badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    },
    A2A: {
        border: "border-blue-500/30",
        bg: "bg-blue-500/5",
        badge: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    },
} as const;

// Helper components

function EndpointCard({ type, endpoint, onCopy }: { type: "MCP" | "A2A"; endpoint: string; onCopy: () => void }) {
    const colors = ENDPOINT_COLORS[type];
    return (
        <div className={`flex items-center justify-between rounded-lg border ${colors.border} ${colors.bg} p-3`}>
            <div>
                <Badge className={`${colors.badge} mb-1`}>{type}</Badge>
                <p className="text-sm font-mono">{endpoint}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={onCopy}>
                <Copy className="h-4 w-4" />
            </Button>
        </div>
    );
}

function InfoRow({
    label,
    value,
    truncate,
    onCopy,
}: {
    label: string;
    value: string;
    truncate?: boolean;
    onCopy: () => void;
}) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{label}</span>
            <div className="flex items-center gap-2">
                <span className={`font-mono text-sm ${truncate ? "truncate max-w-[120px]" : ""}`}>{value}</span>
                <button onClick={onCopy} className="text-muted-foreground hover:text-foreground">
                    <Copy className="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
    );
}
