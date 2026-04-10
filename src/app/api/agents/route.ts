import { NextRequest, NextResponse } from "next/server";
import { getAgents, searchAgents, getAgentByAgentId, OrderBy, OrderDirection } from "@/lib/subgraph.handler";
import {
    AGENT_SUBGRAPH_NETWORKS,
    AGENT_NETWORK_CHAIN_IDS,
    isAgentSubgraphNetwork,
    type AgentSubgraphNetwork,
} from "@/lib/agent-networks";
import { getAgentNetworkFromChainId } from "@/lib/block-explorer";
import {
    getCurateFallbackAgentByAgentId,
    listCurateFallbackAgents,
    searchCurateFallbackAgents,
} from "@/lib/curate-agent-fallback.server";
import type { Agent } from "@/types/agent";

const SUBGRAPH_TIMEOUT_MS = 1800;

type RouteNetwork = AgentSubgraphNetwork | null;

function withTimeout<T>(promise: Promise<T>, fallback: T, timeoutMs = SUBGRAPH_TIMEOUT_MS): Promise<T> {
    return new Promise((resolve) => {
        let settled = false;
        const timeout = setTimeout(() => {
            if (settled) return;
            settled = true;
            resolve(fallback);
        }, timeoutMs);

        promise
            .then((value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                resolve(value);
            })
            .catch(() => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                resolve(fallback);
            });
    });
}

function resolveAgentNetwork(agent: Pick<Agent, "chainId">, fallback: AgentSubgraphNetwork): AgentSubgraphNetwork {
    return getAgentNetworkFromChainId(agent.chainId) || fallback;
}

function getUniqueKey(agent: Pick<Agent, "id" | "chainId">, fallback: AgentSubgraphNetwork): string {
    return `${resolveAgentNetwork(agent, fallback)}:${agent.id}`;
}

function toNumericValue(value: string | null | undefined): number {
    const parsed = Number.parseInt(value || "0", 10);
    return Number.isFinite(parsed) ? parsed : 0;
}

function compareAgents(a: Agent, b: Agent, orderBy: OrderBy, orderDirection: OrderDirection) {
    const multiplier = orderDirection === "asc" ? 1 : -1;
    const primary =
        orderBy === "totalFeedback"
            ? toNumericValue(a.totalFeedback) - toNumericValue(b.totalFeedback)
            : orderBy === "lastActivity"
              ? toNumericValue(a.lastActivity) - toNumericValue(b.lastActivity)
              : orderBy === "updatedAt"
                ? toNumericValue(a.updatedAt) - toNumericValue(b.updatedAt)
                : toNumericValue(a.createdAt) - toNumericValue(b.createdAt);

    if (primary !== 0) return primary * multiplier;

    const createdDiff = toNumericValue(a.createdAt) - toNumericValue(b.createdAt);
    if (createdDiff !== 0) return createdDiff * -1;

    return a.id.localeCompare(b.id) * multiplier;
}

async function getListForNetwork(params: {
    network: AgentSubgraphNetwork;
    first: number;
    skip: number;
    orderBy: OrderBy;
    orderDirection: OrderDirection;
    protocol?: string;
}) {
    const primary = await withTimeout(
        getAgents({
            first: params.first,
            skip: params.skip,
            orderBy: params.orderBy,
            orderDirection: params.orderDirection,
            protocol: params.protocol,
            network: params.network,
        }),
        null as Agent[] | null
    );

    if (primary && primary.length > 0) return primary;

    const fallback = await withTimeout(
        listCurateFallbackAgents({ network: params.network, first: params.first, skip: params.skip }),
        [] as Agent[]
    );

    return fallback.length > 0 ? fallback : primary || [];
}

async function getQueryResultsForNetwork(params: {
    network: AgentSubgraphNetwork;
    query: string;
    first: number;
    orderBy: OrderBy;
    orderDirection: OrderDirection;
    protocol?: string;
}) {
    const [nameResults, directAgentResults, broadResults, curateResults] = await Promise.all([
        withTimeout(
            searchAgents({
                query: params.query,
                first: params.first,
                skip: 0,
                protocol: params.protocol,
                network: params.network,
            }).catch(() => []),
            [] as Agent[]
        ),
        Promise.all(
            buildAgentIdCandidates(params.query, params.network).map(async (agentIdCandidate) =>
                withTimeout(
                    getAgentByAgentId(agentIdCandidate, params.network).catch(async () => {
                        return (await getCurateFallbackAgentByAgentId(agentIdCandidate, params.network))?.agent || null;
                    }),
                    null as Agent | null
                )
            )
        ),
        withTimeout(
            getAgents({
                first: params.first,
                skip: 0,
                orderBy: params.orderBy,
                orderDirection: params.orderDirection,
                protocol: params.protocol,
                network: params.network,
            }).catch(() => []),
            [] as Agent[]
        ),
        withTimeout(
            searchCurateFallbackAgents({
                query: params.query,
                network: params.network,
                first: params.first,
            }),
            [] as Agent[]
        ),
    ]);

    const unique = new Map<string, Agent>();
    for (const directAgent of directAgentResults) {
        if (!directAgent?.id) continue;
        unique.set(getUniqueKey(directAgent, params.network), directAgent);
    }
    for (const byName of nameResults) {
        const key = getUniqueKey(byName, params.network);
        if (!unique.has(key)) unique.set(key, byName);
    }
    for (const candidate of broadResults) {
        if (!matchesAgentQuery(candidate, params.query)) continue;
        const key = getUniqueKey(candidate, params.network);
        if (!unique.has(key)) unique.set(key, candidate);
    }
    for (const candidate of curateResults) {
        const key = getUniqueKey(candidate, params.network);
        if (!unique.has(key)) unique.set(key, candidate);
    }

    return Array.from(unique.values());
}

async function getNetworksToSearch(network: RouteNetwork) {
    return network ? [network] : [...AGENT_SUBGRAPH_NETWORKS];
}

function buildAgentIdCandidates(query: string, network: AgentSubgraphNetwork): string[] {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const candidates = new Set<string>();
    candidates.add(trimmed);

    if (trimmed.startsWith("eip155:")) {
        const parts = trimmed.split(":");
        if (parts.length >= 3 && parts[2]) candidates.add(parts[2]);
    }

    if (/^\d+$/.test(trimmed)) {
        candidates.add(`eip155:${AGENT_NETWORK_CHAIN_IDS[network]}:${trimmed}`);
    }

    return Array.from(candidates);
}

function matchesAgentQuery(
    agent: {
        id: string;
        agentId: string;
        owner: string;
        agentURI: string | null;
        registrationFile: { name: string | null; description: string | null } | null;
    },
    query: string
) {
    const q = query.trim().toLowerCase();
    if (!q) return false;

    return (
        agent.id.toLowerCase().includes(q) ||
        agent.agentId.toLowerCase().includes(q) ||
        agent.owner.toLowerCase().includes(q) ||
        (agent.agentURI || "").toLowerCase().includes(q) ||
        (agent.registrationFile?.name || "").toLowerCase().includes(q) ||
        (agent.registrationFile?.description || "").toLowerCase().includes(q)
    );
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "12", 10);
    const query = searchParams.get("q") || undefined;
    const sort = searchParams.get("sort") || "createdAt:desc";
    const protocol = searchParams.get("protocol") || undefined;
    const rawNetwork = searchParams.get("network");
    let network: RouteNetwork = "sepolia";
    if (rawNetwork === "all") {
        network = null;
    } else if (rawNetwork) {
        if (!isAgentSubgraphNetwork(rawNetwork)) {
            return NextResponse.json(
                { success: false, error: `Invalid network '${rawNetwork}'`, items: [] },
                { status: 400 }
            );
        }
        network = rawNetwork;
    }

    const [orderBy, orderDirection] = sort.split(":") as [OrderBy, OrderDirection];
    const skip = (page - 1) * pageSize;

    try {
        if (query) {
            const perNetworkFirst = Math.max(pageSize * 4, 40);
            const groups = await Promise.allSettled(
                (await getNetworksToSearch(network)).map((networkKey) =>
                    getQueryResultsForNetwork({
                        network: networkKey,
                        query,
                        first: perNetworkFirst,
                        orderBy,
                        orderDirection,
                        protocol,
                    })
                )
            );

            const unique = new Map<string, Agent>();
            for (const group of groups) {
                if (group.status !== "fulfilled") continue;
                for (const agent of group.value) {
                    const agentNetwork = resolveAgentNetwork(agent, network || "sepolia");
                    const key = `${agentNetwork}:${agent.id}`;
                    if (!unique.has(key)) unique.set(key, agent);
                }
            }

            const merged = Array.from(unique.values());
            const results = merged.slice(skip, skip + pageSize);
            return NextResponse.json({
                success: true,
                items: results,
                page,
                pageSize,
                hasMore: merged.length > skip + pageSize,
                network: network || "all",
            });
        }

        if (network) {
            const agents = await getListForNetwork({ network, first: pageSize, skip, orderBy, orderDirection, protocol });
            return NextResponse.json({
                success: true,
                items: agents,
                page,
                pageSize,
                hasMore: agents.length === pageSize,
                network,
            });
        }

        const fetchSize = Math.max(pageSize + skip, 24);
        const groups = await Promise.allSettled(
            AGENT_SUBGRAPH_NETWORKS.map((networkKey) =>
                getListForNetwork({
                    network: networkKey,
                    first: fetchSize,
                    skip: 0,
                    orderBy,
                    orderDirection,
                    protocol,
                })
            )
        );

        const unique = new Map<string, Agent>();
        for (let index = 0; index < groups.length; index++) {
            const group = groups[index];
            if (group.status !== "fulfilled") continue;
            const fallbackNetwork = AGENT_SUBGRAPH_NETWORKS[index];
            for (const agent of group.value) {
                const key = getUniqueKey(agent, fallbackNetwork);
                if (!unique.has(key)) unique.set(key, agent);
            }
        }

        const merged = Array.from(unique.values()).sort((a, b) =>
            compareAgents(a, b, orderBy, orderDirection)
        );
        const agents = merged.slice(skip, skip + pageSize);
        return NextResponse.json({
            success: true,
            items: agents,
            page,
            pageSize,
            hasMore: merged.length > skip + pageSize,
            network: "all",
        });
    } catch (error) {
        console.error("[Agents API] Error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Unknown error", items: [] },
            { status: 500 }
        );
    }
}
