import "server-only";

import { GraphQLClient, gql } from "graphql-request";
import type { AgentSubgraphNetwork } from "@/lib/agent-networks";
import { getCurateMode, getCurateRegistryAddress, getCurateSubgraphUrl, getGoldskyApiKey } from "@/lib/curate-config";
import { lookupCurateItemByAgentId } from "@/lib/kleros-curate";
import { fetchPgtcrItemByItemIdBytes } from "@/lib/pgtcr-subgraph";
import {
  buildCurateFallbackAgent,
  extractCurateAgentNumber,
  loadCurateRegistrationFile,
  parseCaip10Owner,
} from "@/lib/curate-agent-fallback";
import type { AgentWithDetails, AgentRegistrationFile } from "@/types/agent";

type CurateSearchItem = {
  itemID: string;
  status: string;
  includedAt: string;
  metadata?: {
    key0?: string | null;
    key1?: string | null;
    key2?: string | null;
  } | null;
  registry: {
    submissionPeriod: string;
    reinclusionPeriod: string;
  };
};

const GET_RECENT_PGTCR_ITEMS = gql`
  query RecentPgtcrItems($registry: Bytes!, $limit: Int!) {
    items(
      where: { registryAddress: $registry }
      orderBy: includedAt
      orderDirection: desc
      first: $limit
    ) {
      itemID
      status
      includedAt
      metadata {
        key0
        key1
        key2
      }
      registry {
        submissionPeriod
        reinclusionPeriod
      }
    }
  }
`;

const RECENT_ITEMS_CACHE_TTL_MS = 60_000;
const RECENT_ITEMS_LIMIT = 160;

let recentItemsCache:
  | {
      expiresAt: number;
      items: CurateSearchItem[];
    }
  | null = null;

const registrationFileCache = new Map<string, Promise<AgentRegistrationFile | null>>();

function makeCurateClient() {
  const url = getCurateSubgraphUrl("pgtcr");
  const apiKey = getGoldskyApiKey();
  return new GraphQLClient(url, apiKey ? { headers: { "x-api-key": apiKey } } : undefined);
}

function isPgtcrAccepted(
  status: string,
  includedAtRaw: string | number | null | undefined,
  submissionPeriodRaw: string | number | null | undefined,
  reinclusionPeriodRaw: string | number | null | undefined
) {
  const includedAt = Number(includedAtRaw);
  if (!Number.isFinite(includedAt) || includedAt <= 0) return false;

  const nowSec = Math.floor(Date.now() / 1000);
  if (status === "Submitted") {
    const period = Number(submissionPeriodRaw);
    if (!Number.isFinite(period) || period < 0) return false;
    return includedAt + period < nowSec;
  }

  if (status === "Reincluded") {
    const period = Number(reinclusionPeriodRaw);
    if (!Number.isFinite(period) || period < 0) return false;
    return includedAt + period < nowSec;
  }

  return false;
}

function matchesNetwork(item: CurateSearchItem, requestedNetwork?: AgentSubgraphNetwork | null) {
  if (!requestedNetwork) return true;
  return parseCaip10Owner(item.metadata?.key2 || null).network === requestedNetwork;
}

async function getCachedRegistrationFile(uri: string | null | undefined) {
  const trimmed = uri?.trim();
  if (!trimmed) return null;

  const existing = registrationFileCache.get(trimmed);
  if (existing) return existing;

  const request = loadCurateRegistrationFile(trimmed);
  registrationFileCache.set(trimmed, request);
  return request;
}

async function getRecentAcceptedCurateItems() {
  if (getCurateMode() !== "pgtcr") return [] as CurateSearchItem[];

  const now = Date.now();
  if (recentItemsCache && recentItemsCache.expiresAt > now) {
    return recentItemsCache.items;
  }

  const client = makeCurateClient();
  const registry = getCurateRegistryAddress("pgtcr").toLowerCase();
  const response = await client.request<{ items: CurateSearchItem[] }>(GET_RECENT_PGTCR_ITEMS, {
    registry,
    limit: RECENT_ITEMS_LIMIT,
  });

  const deduped = new Map<string, CurateSearchItem>();
  for (const item of response?.items || []) {
    if (
      !isPgtcrAccepted(
        item.status,
        item.includedAt,
        item.registry?.submissionPeriod,
        item.registry?.reinclusionPeriod
      )
    ) {
      continue;
    }

    const key0 = item.metadata?.key0?.trim();
    if (!key0) continue;

    const network = parseCaip10Owner(item.metadata?.key2 || null).network || "sepolia";
    const dedupeKey = `${network}:${key0}`;
    if (deduped.has(dedupeKey)) continue;
    deduped.set(dedupeKey, item);
  }

  const items = Array.from(deduped.values());
  recentItemsCache = {
    expiresAt: now + RECENT_ITEMS_CACHE_TTL_MS,
    items,
  };
  return items;
}

async function buildFallbackAgentFromCurateItem(item: CurateSearchItem, fallbackNetwork?: AgentSubgraphNetwork | null) {
  const agentId = item.metadata?.key0?.trim() || "";
  if (!agentId) return null;

  const network = parseCaip10Owner(item.metadata?.key2 || null).network || fallbackNetwork || "sepolia";
  const registrationFile = await getCachedRegistrationFile(item.metadata?.key1 || null);

  return buildCurateFallbackAgent({
    agentId,
    agentUri: item.metadata?.key1 || null,
    key2: item.metadata?.key2 || null,
    network,
    includedAt: item.includedAt,
    registrationFile,
  });
}

function matchesFallbackQuery(agent: AgentWithDetails, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return false;

  return (
    agent.id.toLowerCase().includes(needle) ||
    agent.agentId.toLowerCase().includes(needle) ||
    agent.owner.toLowerCase().includes(needle) ||
    (agent.agentURI || "").toLowerCase().includes(needle) ||
    (agent.registrationFile?.name || "").toLowerCase().includes(needle) ||
    (agent.registrationFile?.description || "").toLowerCase().includes(needle)
  );
}

export async function getCurateFallbackAgentByAgentId(
  agentIdLike: string,
  network?: AgentSubgraphNetwork | null
) {
  try {
    if (getCurateMode() !== "pgtcr") return null;

    const agentId = extractCurateAgentNumber(agentIdLike);
    if (!agentId) return null;

    const lookup = await lookupCurateItemByAgentId(agentId, {
      network: network || undefined,
    });
    if (!lookup.found || !lookup.itemID) return null;

    const item = await fetchPgtcrItemByItemIdBytes(lookup.itemID);
    if (!item) return null;

    const inferredNetwork = parseCaip10Owner(item.metadata?.key2 || null).network || network || "sepolia";
    const registrationFile = await getCachedRegistrationFile(item.metadata?.key1 || null);
    const fallbackAgent = buildCurateFallbackAgent({
      agentId: item.metadata?.key0?.trim() || agentId,
      agentUri: item.metadata?.key1 || null,
      key2: item.metadata?.key2 || null,
      network: inferredNetwork,
      includedAt: item.includedAt,
      registrationFile,
    });

    return {
      agent: fallbackAgent,
      itemID: lookup.itemID,
      network: inferredNetwork,
    };
  } catch {
    return null;
  }
}

export async function searchCurateFallbackAgents(params: {
  query: string;
  network?: AgentSubgraphNetwork | null;
  first?: number;
}) {
  try {
    const { query, network, first = 24 } = params;
    const items = await getRecentAcceptedCurateItems();
    const filtered = items.filter((item) => matchesNetwork(item, network));
    const agents = await Promise.all(
      filtered.map((item) => buildFallbackAgentFromCurateItem(item, network))
    );

    return agents
      .filter((agent): agent is AgentWithDetails => Boolean(agent))
      .filter((agent) => matchesFallbackQuery(agent, query))
      .slice(0, first);
  } catch {
    return [] as AgentWithDetails[];
  }
}

export async function listCurateFallbackAgents(params: {
  network?: AgentSubgraphNetwork | null;
  first?: number;
  skip?: number;
}) {
  try {
    const { network, first = 20, skip = 0 } = params;
    const items = await getRecentAcceptedCurateItems();
    const filtered = items.filter((item) => matchesNetwork(item, network));
    const paged = filtered.slice(skip, skip + first);
    const agents = await Promise.all(
      paged.map((item) => buildFallbackAgentFromCurateItem(item, network))
    );

    return agents.filter((agent): agent is AgentWithDetails => Boolean(agent));
  } catch {
    return [] as AgentWithDetails[];
  }
}
