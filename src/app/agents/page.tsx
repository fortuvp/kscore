"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    Search,
    ChevronLeft,
    ChevronRight,
    Loader2,
    Database,
    Rows3,
    LayoutGrid,
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AgentCard } from "@/components/agents/agent-card";
import { AgentImage } from "@/components/agents/agent-image";
import type { Agent } from "@/types/agent";
import { truncateAddress, getDisplayName, formatDate } from "@/lib/format";
import { getAddressExplorerUrl, getAddressExplorerUrlForNetwork, getAgentNetworkFromChainId } from "@/lib/block-explorer";
import {
    AGENT_SUBGRAPH_NETWORKS,
    getAgentChainLabel,
    getAgentSubgraphLabel,
    isAgentSubgraphNetwork,
    type AgentSubgraphNetwork,
} from "@/lib/agent-networks";
import { useVerificationEnvironment } from "@/components/verification-environment-provider";

type AgentRegistryNetwork = AgentSubgraphNetwork | "all";

export default function AgentsPage() {
    return (
        <Suspense fallback={<AgentsLoading />}>
            <AgentsContent />
        </Suspense>
    );
}

function AgentsLoading() {
    return (
        <div className="container mx-auto px-6 py-10 max-w-7xl">
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        </div>
    );
}

function AgentsContent() {
    const { environment, withEnvironment } = useVerificationEnvironment();
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialQuery = searchParams.get("q") || "";
    const initialNetworkParam = searchParams.get("network");
    const initialNetwork: AgentRegistryNetwork = isAgentSubgraphNetwork(initialNetworkParam)
        ? initialNetworkParam
        : "all";
    const requestedSort = searchParams.get("sort") || "";
    const initialSort = ["createdAt:desc", "updatedAt:desc", "lastActivity:desc", "totalFeedback:desc"].includes(requestedSort)
        ? requestedSort
        : "createdAt:desc";
    const initialProtocol = ["all", "mcp", "a2a"].includes(searchParams.get("protocol") || "")
        ? searchParams.get("protocol") || "all"
        : "all";
    const initialCollateral = ["all", "collateralized", "notCollateralized"].includes(
        searchParams.get("collateral") || ""
    )
        ? (searchParams.get("collateral") as "all" | "collateralized" | "notCollateralized")
        : "all";

    const [agents, setAgents] = useState<Agent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState(initialQuery);
    const [appliedQuery, setAppliedQuery] = useState(initialQuery);
    const [network, setNetwork] = useState<AgentRegistryNetwork>(initialNetwork);
    const [sortBy, setSortBy] = useState(initialSort);
    const [protocolFilter, setProtocolFilter] = useState(initialProtocol);
    const [currentPage, setCurrentPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [perPage, setPerPage] = useState("12");
    const [viewMode, setViewMode] = useState<"list" | "card">("list");
    const [collateralFilter, setCollateralFilter] = useState<"all" | "collateralized" | "notCollateralized">(initialCollateral);

    const resolveAgentNetwork = useCallback(
        (agent: Agent): AgentSubgraphNetwork => getAgentNetworkFromChainId(agent.chainId) || (network === "all" ? "sepolia" : network),
        [network]
    );

    const fetchAgents = useCallback(async (page: number = 1, query = "", signal?: AbortSignal) => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                pageSize: perPage,
                sort: sortBy,
            });
            params.set("network", network);
            params.set("verificationEnvironment", environment);
            if (query) params.set("q", query);
            if (protocolFilter !== "all") params.set("protocol", protocolFilter);
            if (collateralFilter !== "all") params.set("collateralFilter", collateralFilter);

            const response = await fetch(`/api/agents?${params}`, { signal });
            const data = await response.json();

            if (data.success) {
                setAgents(data.items);
                setHasMore(Boolean(data.hasMore));
                setCurrentPage(page);
            }
        } catch (error) {
            if (signal?.aborted) return;
            console.error("Failed to fetch agents:", error);
        } finally {
            if (!signal?.aborted) setIsLoading(false);
        }
    }, [perPage, sortBy, protocolFilter, network, collateralFilter, environment]);

    useEffect(() => {
        const controller = new AbortController();
        void fetchAgents(1, appliedQuery, controller.signal);
        return () => {
            controller.abort();
        };
    }, [appliedQuery, fetchAgents]);

    useEffect(() => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("network", network);
        params.set("verificationEnvironment", environment);
        if (appliedQuery) params.set("q", appliedQuery);
        else params.delete("q");
        if (protocolFilter !== "all") params.set("protocol", protocolFilter);
        else params.delete("protocol");
        if (collateralFilter !== "all") params.set("collateral", collateralFilter);
        else params.delete("collateral");
        if (sortBy !== "createdAt:desc") params.set("sort", sortBy);
        else params.delete("sort");

        const next = params.toString();
        if (next !== searchParams.toString()) router.replace(`/agents?${next}`, { scroll: false });
    }, [appliedQuery, collateralFilter, environment, network, protocolFilter, router, searchParams, sortBy]);

    const filteredAgents = agents;
    const handleSearch = () => setAppliedQuery(searchQuery.trim());
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") handleSearch();
    };

    return (
        <div className="container mx-auto px-6 py-10 max-w-7xl">
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <Database className="h-6 w-6 text-primary" />
                    <h1 className="text-3xl font-bold tracking-tight">Agent Registry</h1>
                </div>
                <p className="text-muted-foreground">
                    Discover and explore autonomous agents on the ERC-8004 registry
                </p>
            </div>

            <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-4 mb-6">
                <div className="flex flex-col gap-4">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Search by agent number"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={handleKeyDown}
                                className="h-11 w-full rounded-lg border border-border/50 bg-background pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                            />
                        </div>
                        <Button type="button" className="h-11" onClick={handleSearch}>
                            <Search className="mr-2 h-4 w-4" />
                            Search
                        </Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Select value={sortBy} onValueChange={setSortBy}>
                            <SelectTrigger className="w-[160px] h-11">
                                <SelectValue placeholder="Sort by" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="createdAt:desc">Newest</SelectItem>
                                <SelectItem value="updatedAt:desc">Last Updated</SelectItem>
                                <SelectItem value="lastActivity:desc">Most Active</SelectItem>
                                <SelectItem value="totalFeedback:desc">Most Feedback</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select
                            value={network}
                            onValueChange={(value) => {
                                if (value === "all") {
                                    setNetwork("all");
                                    return;
                                }
                                if (isAgentSubgraphNetwork(value)) setNetwork(value);
                            }}
                        >
                            <SelectTrigger className="w-[150px] h-11">
                                <SelectValue placeholder="Chain" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All networks</SelectItem>
                                {AGENT_SUBGRAPH_NETWORKS.map((networkKey) => (
                                    <SelectItem key={networkKey} value={networkKey}>
                                        {getAgentSubgraphLabel(networkKey)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={protocolFilter} onValueChange={setProtocolFilter}>
                            <SelectTrigger className="w-[130px] h-11">
                                <SelectValue placeholder="Protocol" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Protocols</SelectItem>
                                <SelectItem value="mcp">MCP</SelectItem>
                                <SelectItem value="a2a">A2A</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select
                            value={collateralFilter}
                            onValueChange={(value: "all" | "collateralized" | "notCollateralized") => setCollateralFilter(value)}
                        >
                            <SelectTrigger className="w-[170px] h-11">
                                <SelectValue placeholder="Collateral" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All collateral</SelectItem>
                                <SelectItem value="collateralized">Collateralized only</SelectItem>
                                <SelectItem value="notCollateralized">Not collateralized</SelectItem>
                            </SelectContent>
                        </Select>

                        <div className="inline-flex items-center rounded-lg border border-border/50 bg-background/50 p-1">
                            <Button
                                type="button"
                                size="sm"
                                variant={viewMode === "list" ? "secondary" : "ghost"}
                                className="h-9 px-3"
                                onClick={() => setViewMode("list")}
                            >
                                <Rows3 className="mr-1.5 h-4 w-4" />
                                List
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant={viewMode === "card" ? "secondary" : "ghost"}
                                className="h-9 px-3"
                                onClick={() => setViewMode("card")}
                            >
                                <LayoutGrid className="mr-1.5 h-4 w-4" />
                                Card
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {viewMode === "list" ? (
                <div className="rounded-xl border border-border/50 overflow-hidden bg-card/30 backdrop-blur-sm">
                    <Table>
                        <TableHeader>
                                <TableRow className="hover:bg-transparent border-border/50">
                                    <TableHead className="w-[300px] font-semibold">Name</TableHead>
                                    <TableHead className="font-semibold">Agent ID</TableHead>
                                    <TableHead className="text-center font-semibold">Collateralized</TableHead>
                                    <TableHead className="font-semibold">Chain</TableHead>
                                    <TableHead className="font-semibold">Owner</TableHead>
                                    <TableHead className="font-semibold">Created</TableHead>
                                </TableRow>
                            </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-32 text-center">
                                        <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                                    </TableCell>
                                </TableRow>
                            ) : filteredAgents.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                        No agents found
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredAgents.map((agent) => {
                                    const agentNetwork = resolveAgentNetwork(agent);
                                    const ownerExplorerUrl =
                                        getAddressExplorerUrl(agent.owner, agent.chainId) ||
                                        getAddressExplorerUrlForNetwork(agent.owner, agentNetwork);
                                    const agentHref = withEnvironment(`/agents/${encodeURIComponent(agent.id)}?network=${agentNetwork}`);

                                    return (
                                        <TableRow
                                            key={`${agentNetwork}:${agent.id}`}
                                            className="cursor-pointer border-border/30 transition-colors hover:bg-muted/30"
                                            role="link"
                                            tabIndex={0}
                                            onClick={() => router.push(agentHref)}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter" || event.key === " ") {
                                                    event.preventDefault();
                                                    router.push(agentHref);
                                                }
                                            }}
                                        >
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted overflow-hidden shrink-0">
                                                        <AgentImage
                                                            src={agent.registrationFile?.image}
                                                            alt={getDisplayName(agent)}
                                                            className="h-9 w-9 object-cover"
                                                            fallbackClassName="text-sm"
                                                        />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <span className="font-medium truncate block max-w-[200px]">
                                                            {getDisplayName(agent)}
                                                        </span>
                                                        {agent.registrationFile?.description && (
                                                            <span className="text-xs text-muted-foreground truncate block max-w-[200px]">
                                                                {agent.registrationFile.description.slice(0, 40)}...
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <span className="font-mono text-sm text-foreground">{agent.agentId}</span>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {agent.collateralized ? (
                                                    <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">Yes</Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-muted-foreground">No</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant="outline"
                                                    className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-medium"
                                                >
                                                    {getAgentChainLabel(agent.chainId, agentNetwork)}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {ownerExplorerUrl ? (
                                                    <a
                                                        href={ownerExplorerUrl}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="font-mono text-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                                                        onClick={(event) => event.stopPropagation()}
                                                    >
                                                        {truncateAddress(agent.owner)}
                                                    </a>
                                                ) : (
                                                    <span className="font-mono text-sm text-muted-foreground">
                                                        {truncateAddress(agent.owner)}
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-sm text-muted-foreground">
                                                    {Number(agent.createdAt) > 0 ? formatDate(agent.createdAt) : "-"}
                                                </span>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            ) : (
                <div className="rounded-xl border border-border/50 bg-card/30 p-4 backdrop-blur-sm">
                    {isLoading ? (
                        <div className="flex h-32 items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : filteredAgents.length === 0 ? (
                        <div className="flex h-32 items-center justify-center text-muted-foreground">No agents found</div>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {filteredAgents.map((agent) => {
                                const agentNetwork = resolveAgentNetwork(agent);
                                return <AgentCard key={`${agentNetwork}:${agent.id}`} agent={agent} network={agentNetwork} />;
                            })}
                        </div>
                    )}
                </div>
            )}

            <div className="mt-6 flex flex-col items-center justify-between gap-4 sm:flex-row">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Showing {filteredAgents.length} of {agents.length} agents</span>
                    <span className="text-border">|</span>
                    <span>Per page:</span>
                    <Select value={perPage} onValueChange={setPerPage}>
                        <SelectTrigger className="h-8 w-[70px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="12">12</SelectItem>
                            <SelectItem value="24">24</SelectItem>
                            <SelectItem value="48">48</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage === 1 || isLoading}
                        onClick={() => fetchAgents(currentPage - 1, appliedQuery)}
                        className="rounded-lg"
                    >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Previous
                    </Button>
                    <span className="px-3 text-sm text-muted-foreground">Page {currentPage}</span>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!hasMore || isLoading}
                        onClick={() => fetchAgents(currentPage + 1, appliedQuery)}
                        className="rounded-lg"
                    >
                        Next
                        <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                </div>
            </div>
        </div>
    );
}

