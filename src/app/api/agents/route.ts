import { NextRequest, NextResponse } from "next/server";

import { getAgentNetworkFromChainId } from "@/lib/block-explorer";
import {
  getAcceptedCurateAgentIds,
  getCurateFallbackAgentByAgentId,
  listCurateFallbackAgents,
  searchCurateFallbackAgents,
} from "@/lib/curate-agent-fallback.server";
import {
  getSepoliaIdentityRegistryFallbackAgentByAgentId,
  listSepoliaIdentityRegistryFallbackAgents,
  searchSepoliaIdentityRegistryFallbackAgents,
} from "@/lib/identity-registry-fallback.server";
import {
  AGENT_NETWORK_CHAIN_IDS,
  AGENT_SUBGRAPH_NETWORKS,
  isAgentSubgraphNetwork,
  type AgentSubgraphNetwork,
} from "@/lib/agent-networks";
import {
  getAgentByAgentId,
  getAgents,
  searchAgents,
  type OrderBy,
  type OrderDirection,
} from "@/lib/subgraph.handler";
import type { Agent } from "@/types/agent";

const PRIMARY_SUBGRAPH_TIMEOUT_MS = 1800;
const CURATE_FALLBACK_TIMEOUT_MS = 5000;
const ONCHAIN_FALLBACK_TIMEOUT_MS = 7000;

type RouteNetwork = AgentSubgraphNetwork | null;
type CollateralFilter = "all" | "collateralized" | "notCollateralized";

function withTimeout<T>(promise: Promise<T>, fallback: T, timeoutMs: number): Promise<T> {
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

function getUniqueKey(agent: Pick<Agent, "id" | "agentId" | "chainId">, fallback: AgentSubgraphNetwork): string {
  return buildCollateralKey(resolveAgentNetwork(agent, fallback), agent.agentId || agent.id);
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

function normalizeAgentIdLike(agentIdLike: string) {
  const trimmed = agentIdLike.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return trimmed;
  if (/^\d+:\d+$/.test(trimmed)) return trimmed.split(":").pop() || null;
  if (trimmed.startsWith("eip155:")) {
    const tail = trimmed.split(":").pop()?.trim();
    return tail && /^\d+$/.test(tail) ? tail : null;
  }
  return null;
}

function buildCollateralKey(network: AgentSubgraphNetwork, agentIdLike: string) {
  const normalized = normalizeAgentIdLike(agentIdLike) || agentIdLike.trim();
  return `${network}:${normalized}`;
}

function getCollateralKeyForAgent(agent: Agent, fallback: AgentSubgraphNetwork) {
  return buildCollateralKey(resolveAgentNetwork(agent, fallback), agent.agentId);
}

function matchesAgentQuery(
  agent: {
    id: string;
    agentId: string;
    owner: string;
    agentURI: string | null;
    registrationFile: { name: string | null; description: string | null; mcpEndpoint?: string | null; a2aEndpoint?: string | null } | null;
  },
  query: string
) {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  return (
    agent.id.toLowerCase().includes(q) ||
    agent.agentId.toLowerCase().includes(q) ||
    agent.owner.toLowerCase().includes(q) ||
    (agent.agentURI || "").toLowerCase().includes(q) ||
    (agent.registrationFile?.name || "").toLowerCase().includes(q) ||
    (agent.registrationFile?.description || "").toLowerCase().includes(q)
  );
}

function matchesProtocol(agent: Agent, protocol?: string) {
  if (!protocol || protocol === "all") return true;
  if (protocol === "mcp") return Boolean(agent.registrationFile?.mcpEndpoint);
  if (protocol === "a2a") return Boolean(agent.registrationFile?.a2aEndpoint);
  return true;
}

function parseCollateralFilter(value: string | null): CollateralFilter | null {
  if (!value || value === "all") return "all";
  if (value === "collateralized" || value === "notCollateralized") return value;
  return null;
}

async function getNetworksToSearch(network: RouteNetwork) {
  return network ? [network] : [...AGENT_SUBGRAPH_NETWORKS];
}

async function getAcceptedCollateralKeySet(networks: readonly AgentSubgraphNetwork[]) {
  const groups = await Promise.all(
    networks.map(async (network) => [network, await getAcceptedCurateAgentIds(network)] as const)
  );

  const keys = new Set<string>();
  for (const [network, agentIds] of groups) {
    for (const agentId of agentIds) {
      keys.add(buildCollateralKey(network, agentId));
    }
  }
  return keys;
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
  if (/^\d+:\d+$/.test(trimmed)) {
    const tail = trimmed.split(":").pop();
    if (tail) candidates.add(tail);
  }

  if (/^\d+$/.test(trimmed)) {
    candidates.add(`eip155:${AGENT_NETWORK_CHAIN_IDS[network]}:${trimmed}`);
  }

  return Array.from(candidates);
}

async function getSepoliaOnchainAgentById(agentIdLike: string) {
  const normalized = normalizeAgentIdLike(agentIdLike);
  if (!normalized) return null;
  return withTimeout(
    getSepoliaIdentityRegistryFallbackAgentByAgentId(normalized).catch(() => null),
    null as Agent | null,
    ONCHAIN_FALLBACK_TIMEOUT_MS
  );
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
    null as Agent[] | null,
    PRIMARY_SUBGRAPH_TIMEOUT_MS
  );

  if (primary && primary.length > 0) return primary;

  if (params.network === "sepolia" && !params.protocol) {
    const onchainFallback = await withTimeout(
      listSepoliaIdentityRegistryFallbackAgents({
        first: params.first,
        skip: params.skip,
        orderBy: params.orderBy,
        orderDirection: params.orderDirection,
      }),
      [] as Agent[],
      ONCHAIN_FALLBACK_TIMEOUT_MS
    );

    if (onchainFallback.length > 0) return onchainFallback;
  }

  const curateFallback = await withTimeout(
    listCurateFallbackAgents({ network: params.network, first: params.first, skip: params.skip }),
    [] as Agent[],
    CURATE_FALLBACK_TIMEOUT_MS
  );

  return curateFallback.length > 0 ? curateFallback : primary || [];
}

async function getQueryResultsForNetwork(params: {
  network: AgentSubgraphNetwork;
  query: string;
  first: number;
  orderBy: OrderBy;
  orderDirection: OrderDirection;
  protocol?: string;
}) {
  const [nameResults, directAgentResults, broadResults, curateResults, onchainResults] = await Promise.all([
    withTimeout(
      searchAgents({
        query: params.query,
        first: params.first,
        skip: 0,
        protocol: params.protocol,
        network: params.network,
      }).catch(() => []),
      [] as Agent[],
      PRIMARY_SUBGRAPH_TIMEOUT_MS
    ),
    Promise.all(
      buildAgentIdCandidates(params.query, params.network).map(async (agentIdCandidate) => {
        const primary = await withTimeout(
          getAgentByAgentId(agentIdCandidate, params.network, 10, true).catch(() => null),
          null as Agent | null,
          PRIMARY_SUBGRAPH_TIMEOUT_MS
        );
        if (primary) return primary;

        if (params.network === "sepolia") {
          const onchain = await getSepoliaOnchainAgentById(agentIdCandidate);
          if (onchain) return onchain;
        }

        return withTimeout(
          getCurateFallbackAgentByAgentId(agentIdCandidate, params.network)
            .then((result) => result?.agent || null)
            .catch(() => null),
          null as Agent | null,
          CURATE_FALLBACK_TIMEOUT_MS
        );
      })
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
      [] as Agent[],
      PRIMARY_SUBGRAPH_TIMEOUT_MS
    ),
    withTimeout(
      searchCurateFallbackAgents({
        query: params.query,
        network: params.network,
        first: params.first,
      }),
      [] as Agent[],
      CURATE_FALLBACK_TIMEOUT_MS
    ),
    params.network === "sepolia" && !params.protocol
      ? withTimeout(
          searchSepoliaIdentityRegistryFallbackAgents({
            query: params.query,
            first: params.first,
            orderBy: params.orderBy,
            orderDirection: params.orderDirection,
          }),
          [] as Agent[],
          ONCHAIN_FALLBACK_TIMEOUT_MS
        )
      : Promise.resolve([] as Agent[]),
  ]);

  const unique = new Map<string, Agent>();
  for (const directAgent of directAgentResults) {
    if (!directAgent?.id) continue;
    unique.set(getUniqueKey(directAgent, params.network), directAgent);
  }
  for (const candidate of [...nameResults, ...broadResults, ...curateResults, ...onchainResults]) {
    if (!matchesProtocol(candidate, params.protocol)) continue;
    if (!matchesAgentQuery(candidate, params.query)) continue;
    const key = getUniqueKey(candidate, params.network);
    if (!unique.has(key)) unique.set(key, candidate);
  }

  return Array.from(unique.values()).sort((a, b) =>
    compareAgents(a, b, params.orderBy, params.orderDirection)
  );
}

async function getCollateralizedResultsForNetwork(params: {
  network: AgentSubgraphNetwork;
  query?: string;
  orderBy: OrderBy;
  orderDirection: OrderDirection;
  protocol?: string;
}) {
  const curateCandidates = await withTimeout(
    params.query
      ? searchCurateFallbackAgents({
          query: params.query,
          network: params.network,
          first: 200,
        })
      : listCurateFallbackAgents({
          network: params.network,
          first: 200,
          skip: 0,
        }),
    [] as Agent[],
    CURATE_FALLBACK_TIMEOUT_MS
  );

  const hydrated = await Promise.all(
    curateCandidates.map(async (fallbackAgent) => {
      const primary = await withTimeout(
        getAgentByAgentId(fallbackAgent.agentId, params.network, 10, true).catch(() => null),
        null as Agent | null,
        PRIMARY_SUBGRAPH_TIMEOUT_MS
      );
      if (primary) return primary;

      if (params.network === "sepolia") {
        const onchain = await getSepoliaOnchainAgentById(fallbackAgent.agentId);
        if (onchain) {
          return {
            ...onchain,
            agentURI: onchain.agentURI || fallbackAgent.agentURI,
            registrationFile: onchain.registrationFile || fallbackAgent.registrationFile,
          } satisfies Agent;
        }
      }

      return fallbackAgent;
    })
  );

  return hydrated
    .filter((agent) => matchesProtocol(agent, params.protocol))
    .filter((agent) => (params.query ? matchesAgentQuery(agent, params.query) : true))
    .sort((a, b) => compareAgents(a, b, params.orderBy, params.orderDirection));
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") || "12", 10);
  const query = searchParams.get("q") || undefined;
  const sort = searchParams.get("sort") || "createdAt:desc";
  const protocol = searchParams.get("protocol") || undefined;
  const rawNetwork = searchParams.get("network");
  const collateralFilter = parseCollateralFilter(searchParams.get("collateralFilter"));

  if (!collateralFilter) {
    return NextResponse.json(
      { success: false, error: "Invalid collateralFilter", items: [] },
      { status: 400 }
    );
  }

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
    const networksToSearch = await getNetworksToSearch(network);

    if (query) {
      const groups = await Promise.allSettled(
        networksToSearch.map((networkKey) =>
          collateralFilter === "collateralized"
            ? getCollateralizedResultsForNetwork({
                network: networkKey,
                query,
                orderBy,
                orderDirection,
                protocol,
              })
            : getQueryResultsForNetwork({
                network: networkKey,
                query,
                first: Math.max(pageSize * 6, 80),
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
        const fallbackNetwork = networksToSearch[index];
        for (const agent of group.value) {
          const key = getUniqueKey(agent, fallbackNetwork);
          if (!unique.has(key)) unique.set(key, agent);
        }
      }

      let merged = Array.from(unique.values()).sort((a, b) =>
        compareAgents(a, b, orderBy, orderDirection)
      );

      if (collateralFilter === "notCollateralized") {
        const acceptedKeys = await getAcceptedCollateralKeySet(networksToSearch);
        merged = merged.filter((agent) => !acceptedKeys.has(getCollateralKeyForAgent(agent, network || "sepolia")));
      }

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

    if (collateralFilter === "collateralized") {
      const groups = await Promise.allSettled(
        networksToSearch.map((networkKey) =>
          getCollateralizedResultsForNetwork({
            network: networkKey,
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
        const fallbackNetwork = networksToSearch[index];
        for (const agent of group.value) {
          const key = getUniqueKey(agent, fallbackNetwork);
          if (!unique.has(key)) unique.set(key, agent);
        }
      }

      const merged = Array.from(unique.values()).sort((a, b) =>
        compareAgents(a, b, orderBy, orderDirection)
      );
      const items = merged.slice(skip, skip + pageSize);
      return NextResponse.json({
        success: true,
        items,
        page,
        pageSize,
        hasMore: merged.length > skip + pageSize,
        network: network || "all",
      });
    }

    if (network) {
      if (collateralFilter === "notCollateralized") {
        const acceptedKeys = await getAcceptedCollateralKeySet([network]);
        const fetchSize = Math.max(pageSize + skip + acceptedKeys.size + 24, 48);
        const agents = await getListForNetwork({
          network,
          first: fetchSize,
          skip: 0,
          orderBy,
          orderDirection,
          protocol,
        });
        const filtered = agents.filter(
          (agent) => !acceptedKeys.has(getCollateralKeyForAgent(agent, network))
        );
        const items = filtered.slice(skip, skip + pageSize);
        return NextResponse.json({
          success: true,
          items,
          page,
          pageSize,
          hasMore: filtered.length > skip + pageSize,
          network,
        });
      }

      const items = await getListForNetwork({ network, first: pageSize, skip, orderBy, orderDirection, protocol });
      return NextResponse.json({
        success: true,
        items,
        page,
        pageSize,
        hasMore: items.length === pageSize,
        network,
      });
    }

    const acceptedKeys =
      collateralFilter === "notCollateralized"
        ? await getAcceptedCollateralKeySet(AGENT_SUBGRAPH_NETWORKS)
        : null;
    const fetchSize = Math.max(
      pageSize + skip + (acceptedKeys?.size || 0) + 24,
      48
    );

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

    let merged = Array.from(unique.values()).sort((a, b) =>
      compareAgents(a, b, orderBy, orderDirection)
    );

    if (acceptedKeys) {
      merged = merged.filter(
        (agent) => !acceptedKeys.has(getCollateralKeyForAgent(agent, "sepolia"))
      );
    }

    const items = merged.slice(skip, skip + pageSize);
    return NextResponse.json({
      success: true,
      items,
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
