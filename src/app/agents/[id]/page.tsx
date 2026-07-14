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
import { getAgentChainLabel, isAgentSubgraphNetwork } from "@/lib/agent-networks";
import { getAddressExplorerUrl, getAddressExplorerUrlForNetwork, getTxExplorerUrl, getTxExplorerUrlForNetwork, truncateHash } from "@/lib/block-explorer";
import { ipfsToGatewayUrl } from "@/lib/ipfs";
import { AgentImage } from "@/components/agents/agent-image";
import { mergeAgentRegistrationFiles } from "@/lib/agent-metadata";
import type { AgentHistoryEvent } from "@/types/agent-history";
import { useVerificationEnvironment } from "@/components/verification-environment-provider";

type Tab = "overview" | "metadata";
type TimelineTone = "neutral" | "good" | "warn" | "bad";
type TimelineEvent = {
    ts: number;
    badge: string;
    title: string;
    detail: string;
    tone: TimelineTone;
    actor?: string;
    txHash?: string;
    href?: string;
};

function looksLikeAgentId(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith("eip155:")) return true;
    return /^\d+$/.test(trimmed);
}

function getFeedbackSourceUrl(uri: string | null | undefined): string | null {
    const trimmed = uri?.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
    if (
        trimmed.startsWith("ipfs://") ||
        trimmed.startsWith("/ipfs/") ||
        trimmed.startsWith("Qm") ||
        trimmed.startsWith("baf")
    ) {
        return ipfsToGatewayUrl(trimmed);
    }
    return null;
}

function getFeedbackEndpointUrl(endpoint: string | null | undefined): string | null {
    const trimmed = endpoint?.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
    return null;
}

function mergeFreshAgent(existing: AgentWithDetails, fresh: AgentWithDetails): AgentWithDetails {
    const existingLastActivity = Number(existing.lastActivity || "0");
    const freshLastActivity = Number(fresh.lastActivity || "0");

    return {
        ...fresh,
        id: existing.id,
        agentId: existing.agentId,
        chainId: existing.chainId,
        owner: existing.owner,
        operators: existing.operators,
        agentURI: existing.agentURI,
        registrationFile: mergeAgentRegistrationFiles(fresh.registrationFile, existing.registrationFile),
        createdAt: existing.createdAt,
        updatedAt: existing.updatedAt,
        lastActivity:
            Number.isFinite(freshLastActivity) && freshLastActivity > existingLastActivity
                ? fresh.lastActivity
                : existing.lastActivity,
    };
}

function describeHistoryEvent(event: AgentHistoryEvent): Omit<TimelineEvent, "ts" | "actor" | "txHash" | "href"> {
    const detail = event.details;
    switch (event.kind) {
        case "registered":
            return { badge: "Created", title: "Agent registered", detail: "ERC-8004 identity created on chain", tone: "good" };
        case "uri_updated":
            return { badge: "URI", title: "Agent URI updated", detail: String(detail.newURI || "Registration URI changed"), tone: "neutral" };
        case "metadata_set":
            return { badge: "Metadata", title: "On-chain metadata updated", detail: detail.metadataKey ? `Field: ${detail.metadataKey}` : "A metadata field changed", tone: "neutral" };
        case "ownership_transferred":
            return { badge: "Transfer", title: "Ownership transferred", detail: detail.to ? `New owner ${detail.to}` : "The ERC-8004 token changed owner", tone: "neutral" };
        case "feedback_received": {
            const tags = [detail.tag1, detail.tag2].filter(Boolean).join(" / ");
            return {
                badge: "Feedback",
                title: "Feedback submitted",
                detail: `${detail.value !== null && detail.value !== undefined ? `Score ${detail.value}` : "On-chain feedback"}${tags ? ` · ${tags}` : ""}`,
                tone: "good",
            };
        }
        case "feedback_revoked":
            return { badge: "Revoked", title: "Feedback revoked", detail: `Feedback #${detail.feedbackIndex || "-"} was revoked`, tone: "warn" };
        case "feedback_response":
            return { badge: "Response", title: "Feedback response appended", detail: `Response to feedback #${detail.feedbackIndex || "-"}`, tone: "neutral" };
        case "validation_requested":
            return { badge: "Validation", title: "Validation requested", detail: "An ERC-8004 validator was asked to assess this agent", tone: "neutral" };
        case "validation_responded":
            return { badge: "Validated", title: "Validation response recorded", detail: detail.tag ? `Tag: ${detail.tag}` : `Response: ${detail.response ?? "recorded"}`, tone: "good" };
        case "curate_submitted":
            return { badge: "Verified", title: "Collateral submitted", detail: "Submission added to the Verified Agents Stake Curate registry", tone: "good" };
        case "curate_challenged":
            return { badge: "Challenge", title: "Verification challenged", detail: detail.disputeID ? `Kleros dispute #${detail.disputeID}` : "A Curate challenge was opened", tone: "warn" };
        case "curate_resolved": {
            const ruling = String(detail.ruling || "").toLowerCase();
            const lost = ruling === "reject" || ruling === "2" || ruling === "challenger";
            return { badge: "Resolved", title: "Verification dispute resolved", detail: ruling ? `Ruling: ${detail.ruling}` : "Dispute resolution recorded", tone: lost ? "bad" : "good" };
        }
        case "curate_evidence":
            return { badge: "Evidence", title: "Evidence submitted", detail: `Evidence #${detail.evidenceNumber || "-"} added to the Curate case`, tone: "neutral" };
        case "curate_appealed":
            return { badge: "Appeal", title: "Verification ruling appealed", detail: detail.disputeID ? `Kleros dispute #${detail.disputeID}` : "Appeal funding recorded", tone: "warn" };
        case "curate_withdrawal_started":
            return { badge: "Withdrawing", title: "Withdrawal initiated", detail: "The stake remains locked until the registry waiting period ends and withdrawal is finalized", tone: "warn" };
        case "curate_withdrawn":
            return { badge: "Withdrawn", title: "Stake withdrawn", detail: "The submission is no longer collateralized in Curate", tone: "warn" };
    }
}

export default function AgentDetailPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const { environment: verificationEnvironment, deployment, withEnvironment } = useVerificationEnvironment();
    const id = params.id as string;
    const rawNetwork = searchParams.get("network");
    const network = isAgentSubgraphNetwork(rawNetwork) ? rawNetwork : "sepolia";
    const lookup = searchParams.get("lookup");
    const backToAgentsHref = withEnvironment(`/agents?network=${network}`);

    const [agent, setAgent] = useState<AgentWithDetails | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshingFeedback, setIsRefreshingFeedback] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [curateFallbackUrl, setCurateFallbackUrl] = useState<string | null>(null);
    const [fallbackItemId, setFallbackItemId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>("overview");
    const [curateItemId, setCurateItemId] = useState<string | null>(null);
    const [pgtcrRegistryAddress, setPgtcrRegistryAddress] = useState<`0x${string}` | null>(null);
    const [historyEvents, setHistoryEvents] = useState<AgentHistoryEvent[]>([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        async function fetchAgent() {
            setIsLoading(true);
            setIsRefreshingFeedback(false);
            setError(null);
            setCurateFallbackUrl(null);
            setFallbackItemId(null);
            try {
                const resolvePayloadAgent = async (payload: { agent?: AgentWithDetails; item?: AgentWithDetails } | null | undefined) => {
                    const resolved = (payload?.agent || payload?.item) as AgentWithDetails | undefined;
                    if (!resolved) return null;

                    const detailId = resolved.id?.trim();
                    if (!detailId) return resolved;

                    try {
                        const detailResponse = await fetch(
                            withEnvironment(`/api/agents/${encodeURIComponent(detailId)}?network=${encodeURIComponent(network)}`),
                            { cache: "no-store" }
                        );
                        const detailData = await detailResponse.json();
                        if (cancelled) return null;
                        if (detailData?.success && detailData?.agent) {
                            return detailData.agent as AgentWithDetails;
                        }
                    } catch {
                        // fall back to the already-resolved payload below
                    }

                    return resolved;
                };

                const shouldTryAgentIdFirst = lookup === "agentId" || looksLikeAgentId(id);
                const primaryUrl = shouldTryAgentIdFirst
                    ? withEnvironment(`/api/agents/by-agent-id?agentId=${encodeURIComponent(id)}&network=${encodeURIComponent(network)}`)
                    : withEnvironment(`/api/agents/${encodeURIComponent(id)}?network=${encodeURIComponent(network)}`);

                const primaryResponse = await fetch(primaryUrl, { cache: "no-store" });
                const primaryData = await primaryResponse.json();
                if (cancelled) return;

                if (primaryData?.success && (primaryData?.agent || primaryData?.item)) {
                    const resolvedAgent = await resolvePayloadAgent(primaryData);
                    setAgent(resolvedAgent);
                    return;
                }

                const fallbackUrl = shouldTryAgentIdFirst
                    ? withEnvironment(`/api/agents/${encodeURIComponent(id)}?network=${encodeURIComponent(network)}`)
                    : withEnvironment(`/api/agents/by-agent-id?agentId=${encodeURIComponent(id)}&network=${encodeURIComponent(network)}`);
                const fallbackResponse = await fetch(fallbackUrl, { cache: "no-store" });
                const fallbackData = await fallbackResponse.json();
                if (cancelled) return;

                if (fallbackData?.success && (fallbackData?.agent || fallbackData?.item)) {
                    const resolvedAgent = await resolvePayloadAgent(fallbackData);
                    setAgent(resolvedAgent);
                } else {
                    setError(fallbackData?.error || primaryData?.error || "Failed to load agent");
                    if (shouldTryAgentIdFirst) {
                        try {
                            const vRes = await fetch(withEnvironment(`/api/kleros/verification?agentId=${encodeURIComponent(id)}&network=${encodeURIComponent(network)}`));
                            const vJson = await vRes.json();
                            if (cancelled) return;
                            if (vJson?.success && vJson?.curateItemUrl) setCurateFallbackUrl(vJson.curateItemUrl);
                            if (vJson?.success && vJson?.itemID) setFallbackItemId(vJson.itemID);
                        } catch {}
                    }
                }
            } catch {
                if (cancelled) return;
                setError("Failed to fetch agent details");
                if (lookup === "agentId") {
                    try {
                        const vRes = await fetch(withEnvironment(`/api/kleros/verification?agentId=${encodeURIComponent(id)}&network=${encodeURIComponent(network)}`));
                        const vJson = await vRes.json();
                        if (cancelled) return;
                        if (vJson?.success && vJson?.curateItemUrl) setCurateFallbackUrl(vJson.curateItemUrl);
                        if (vJson?.success && vJson?.itemID) setFallbackItemId(vJson.itemID);
                    } catch {}
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }
        if (id) fetchAgent();
        return () => {
            cancelled = true;
        };
    }, [id, network, lookup, verificationEnvironment, withEnvironment]);

    useEffect(() => {
        if (!agent?.agentId) {
            setCurateItemId(null);
            setPgtcrRegistryAddress(null);
            return;
        }
        const agentId = String(agent.agentId);
        let cancelled = false;
        async function hydrateCurate() {
            try {
                const [regRes, verRes] = await Promise.all([
                    fetch(withEnvironment("/api/pgtcr/registry"), { cache: "no-store" }),
                    fetch(withEnvironment(`/api/kleros/verification?agentId=${encodeURIComponent(agentId)}&network=${network}`), { cache: "no-store" }),
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

            } catch {
                if (!cancelled) {
                    setPgtcrRegistryAddress(null);
                    setCurateItemId(null);
                }
            }
        }
        void hydrateCurate();
        return () => { cancelled = true; };
    }, [agent?.agentId, network, verificationEnvironment, withEnvironment]);

    useEffect(() => {
        const currentAgentId = agent?.agentId ? String(agent.agentId) : "";
        if (!currentAgentId) {
            setIsRefreshingFeedback(false);
            return;
        }

        let cancelled = false;
        async function refreshFreshAgentByAgentId() {
            setIsRefreshingFeedback(true);
            try {
                const res = await fetch(
                    withEnvironment(`/api/agents/by-agent-id?agentId=${encodeURIComponent(currentAgentId)}&network=${encodeURIComponent(network)}&fresh=1`),
                    { cache: "no-store" }
                );
                const json = await res.json();
                if (cancelled) return;
                if (json?.success && json?.item && String(json.item.agentId || "") === currentAgentId) {
                    setAgent((existing) => {
                        if (!existing) return json.item as AgentWithDetails;
                        if (String(existing.agentId || "") !== currentAgentId) return existing;
                        return mergeFreshAgent(existing, json.item as AgentWithDetails);
                    });
                }
            } catch {
                // Keep the initially loaded payload when the follow-up refresh fails.
            } finally {
                if (!cancelled) setIsRefreshingFeedback(false);
            }
        }

        void refreshFreshAgentByAgentId();
        return () => {
            cancelled = true;
        };
    }, [agent?.agentId, network, verificationEnvironment, withEnvironment]);

    useEffect(() => {
        const currentAgentId = agent?.agentId?.trim();
        if (!currentAgentId) {
            setHistoryEvents([]);
            setIsHistoryLoading(false);
            return;
        }

        let cancelled = false;
        async function loadHistory() {
            setIsHistoryLoading(true);
            try {
                const params = new URLSearchParams({
                    agentId: currentAgentId || "",
                    network,
                    verificationEnvironment,
                });
                const response = await fetch(`/api/agents/history?${params.toString()}`, { cache: "no-store" });
                const payload = (await response.json()) as { success?: boolean; events?: AgentHistoryEvent[] };
                if (!cancelled) setHistoryEvents(payload.success && Array.isArray(payload.events) ? payload.events : []);
            } catch {
                if (!cancelled) setHistoryEvents([]);
            } finally {
                if (!cancelled) setIsHistoryLoading(false);
            }
        }

        void loadHistory();
        return () => {
            cancelled = true;
        };
    }, [agent?.agentId, network, verificationEnvironment]);

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
                                <Link href={fallbackItemId ? withEnvironment(`/submissions/${encodeURIComponent(fallbackItemId)}`) : curateFallbackUrl} target={fallbackItemId ? undefined : "_blank"} rel="noreferrer">Open submission details</Link>
                            </Button>
                        </div>
                    ) : null}
                </div>
            </div>
        );
    }

    const totalFeedback = parseInt(agent.totalFeedback) || 0;
    const reviewsPending = isRefreshingFeedback && totalFeedback === 0 && agent.feedback.length === 0;
    const curateViewUrl =
        curateItemId && pgtcrRegistryAddress
            ? `https://curate.kleros.io/tcr/${deployment.chainId}/${pgtcrRegistryAddress}/${curateItemId}`
            : null;
    const ownerExplorerUrl =
        getAddressExplorerUrl(agent.owner, agent.chainId) ||
        getAddressExplorerUrlForNetwork(agent.owner, network);
    const timeline: TimelineEvent[] = historyEvents.map((event) => ({
        ts: event.timestamp,
        ...describeHistoryEvent(event),
        actor: event.actor || undefined,
        txHash: event.transactionHash || undefined,
        href: event.externalUrl || undefined,
    }));
    const hasExactCreation = historyEvents.some((event) => event.kind === "registered");
    const hasExactMetadataUpdate = historyEvents.some(
        (event) => event.kind === "uri_updated" || event.kind === "metadata_set"
    );
    const createdAt = Number(agent.createdAt || 0);
    const updatedAt = Number(agent.updatedAt || 0);
    if (!hasExactCreation && Number.isFinite(createdAt) && createdAt > 0) {
        timeline.push({
            ts: createdAt,
            badge: "Created",
            title: "Agent created",
            detail: `${getAgentChainLabel(agent.chainId, network)} indexed registry timestamp`,
            tone: "good",
        });
    }
    if (
        !hasExactMetadataUpdate &&
        Number.isFinite(updatedAt) &&
        updatedAt > 0 &&
        updatedAt !== createdAt
    ) {
        timeline.push({
            ts: updatedAt,
            badge: "Update",
            title: "Agent metadata updated",
            detail: "Indexed metadata update timestamp",
            tone: "neutral",
        });
    }
    if (agent.registrationFile?.active === false) {
        if (Number.isFinite(updatedAt) && updatedAt > 0) {
            timeline.push({ ts: updatedAt, badge: "Retired", title: "Agent retired / inactive", detail: "Marked inactive in registration", tone: "warn" });
        }
    }
    timeline.sort((a, b) => b.ts - a.ts);

    const badgeClass = (tone: "neutral" | "good" | "warn" | "bad") =>
        tone === "good"
            ? "border-emerald-400/40 bg-emerald-400/20 text-emerald-200 shadow-[0_0_7px_rgba(16,185,129,0.25)]"
            : tone === "bad"
              ? "border-red-400/40 bg-red-400/20 text-red-100 shadow-[0_0_7px_rgba(248,113,113,0.24)]"
            : tone === "warn"
              ? "border-orange-400/40 bg-orange-400/20 text-orange-100 shadow-[0_0_7px_rgba(251,146,60,0.24)]"
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
                            <AgentImage
                                src={agent.registrationFile?.image}
                                alt={getDisplayName(agent)}
                                className="h-full w-full object-cover"
                                fallbackClassName="text-2xl"
                            />
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
                            <p className="mt-2 max-w-2xl break-words text-muted-foreground">
                                {agent.registrationFile?.description || "No description available."}
                            </p>
                            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1.5">
                                    <MessageSquare className="h-4 w-4" />
                                    {reviewsPending ? "Updating reviews..." : `${totalFeedback} Reviews`}
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
                                        <h2 className="font-semibold">History</h2>
                                    </div>
                                    {timeline.length > 0 ? (
                                        <div className="space-y-4">
                                            {timeline.map((event, idx) => (
                                                <div key={`${event.title}-${event.ts}-${idx}`} className="flex gap-3">
                                                    <div className="mt-1 flex flex-col items-center">
                                                        {event.tone === "good" ? (
                                                            <ShieldCheck className="h-4 w-4 text-emerald-400" />
                                                        ) : event.tone === "bad" ? (
                                                            <ShieldAlert className="h-4 w-4 text-red-300" />
                                                        ) : event.tone === "warn" ? (
                                                            <ShieldAlert className="h-4 w-4 text-orange-300" />
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
                                                            <div className="text-xs text-muted-foreground">
                                                                {event.ts > 0 ? formatDateTime(String(event.ts)) : "Timestamp unavailable"}
                                                            </div>
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
                                    ) : isHistoryLoading ? (
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Loading on-chain history…
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
                                                {reviewsPending ? "Updating reviews" : `${totalFeedback} total reviews`}
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
                                                                const reviewEndpointUrl = getFeedbackEndpointUrl(review.endpoint);
                                                                const reviewFeedbackUrl = getFeedbackSourceUrl(review.feedbackURI);
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
                                                            {reviewTxUrl || reviewFeedbackUrl ? (
                                                                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                                                                    {reviewTxUrl ? (
                                                                        <a
                                                                            href={reviewTxUrl}
                                                                            target="_blank"
                                                                            rel="noreferrer"
                                                                            className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200"
                                                                        >
                                                                            Tx {truncateHash(review.txHash!)}
                                                                            <ExternalLink className="h-3 w-3" />
                                                                        </a>
                                                                    ) : null}
                                                                    {reviewFeedbackUrl ? (
                                                                        <a
                                                                            href={reviewFeedbackUrl}
                                                                            target="_blank"
                                                                            rel="noreferrer"
                                                                            className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200"
                                                                        >
                                                                            Feedback Source
                                                                            <ExternalLink className="h-3 w-3" />
                                                                        </a>
                                                                    ) : null}
                                                                </div>
                                                            ) : null}
                                                            <div className="mt-2 flex flex-wrap gap-1">
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
                                                            {review.endpoint && (
                                                                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                                                                    <span>via:</span>
                                                                    {reviewEndpointUrl ? (
                                                                        <a
                                                                            href={reviewEndpointUrl}
                                                                            target="_blank"
                                                                            rel="noreferrer"
                                                                            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 font-mono text-[11px] text-foreground hover:bg-muted/80"
                                                                            title={review.endpoint}
                                                                        >
                                                                            {review.endpoint}
                                                                            <ExternalLink className="h-3 w-3" />
                                                                        </a>
                                                                    ) : (
                                                                        <span
                                                                            className="rounded-full bg-muted px-2 py-1 font-mono text-[11px] text-foreground"
                                                                            title={review.endpoint}
                                                                        >
                                                                            {review.endpoint}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}
                                                                    </>
                                                                );
                                                            })()}
                                                        </div>
                                                        <div className="rounded-lg bg-emerald-500/20 px-3 py-2 text-center">
                                                            {review.tag1 && (
                                                                <div className="mb-1 text-[10px] font-semibold tracking-[0.12em] text-emerald-300/80">
                                                                    {review.tag1.toUpperCase()}
                                                                </div>
                                                            )}
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
                                        <p className="text-sm text-muted-foreground">
                                            {reviewsPending ? "Checking on-chain reviews..." : "No reviews yet."}
                                        </p>
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
                                    </div>
                                </div>

                                <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-6">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h2 className="font-semibold">Moderation</h2>
                                        <Badge className="border-amber-400/30 bg-amber-400/10 text-amber-200">Coming soon</Badge>
                                    </div>
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        Community reports and arbitration status will appear here when moderation launches.
                                    </p>
                                    <Button className="mt-4" size="sm" variant="outline" disabled>
                                        Moderation coming soon
                                    </Button>
                                </div>
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
