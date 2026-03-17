import "server-only";

import { getAgents } from "@/lib/subgraph.handler";
import {
  AGENT_SUBGRAPH_NETWORKS,
  getAgentSubgraphLabel,
  type AgentSubgraphNetwork,
} from "@/lib/agent-networks";
import { computeAgentQualityScore } from "@/lib/quality-score";

export type NetworkSummary = {
  network: AgentSubgraphNetwork;
  label: string;
  agents: number;
  active7d: number;
  new24h: number;
  reviews: number;
  averageQuality: number;
  truncated: boolean;
  subgraphStatus: "live" | "error" | "timeout" | "missing";
  error?: string;
};

type CacheRecord = {
  expiresAt: number;
  data: NetworkSummary[];
};

const PAGE_SIZE = 1000;
// The Graph gateway rejects `skip` values above 5000. Keep the scan within the
// supported range and mark large datasets as truncated instead of erroring.
const MAX_PAGES = 6;
const CACHE_TTL_MS = 2 * 60_000;
const NETWORK_TIMEOUT_MS = 15_000;

let cache: CacheRecord | null = null;

async function summarizeNetwork(network: AgentSubgraphNetwork): Promise<NetworkSummary> {
  const now = Math.floor(Date.now() / 1000);
  const last24h = now - 24 * 3600;
  const last7d = now - 7 * 24 * 3600;

  let page = 0;
  let totalAgents = 0;
  let active7d = 0;
  let new24h = 0;
  let reviews = 0;
  let qualitySum = 0;
  let truncated = false;

  while (page < MAX_PAGES) {
    const skip = page * PAGE_SIZE;
    const rows = await getAgents({
      network,
      first: PAGE_SIZE,
      skip,
      orderBy: "createdAt",
      orderDirection: "desc",
    });

    for (const row of rows) {
      totalAgents += 1;
      const createdAt = Number.parseInt(row.createdAt, 10) || 0;
      const lastActivity = Number.parseInt(row.lastActivity, 10) || 0;
      const totalFeedback = Number.parseInt(row.totalFeedback, 10) || 0;

      if (createdAt >= last24h) new24h += 1;
      if (lastActivity >= last7d) active7d += 1;
      reviews += totalFeedback;
      qualitySum += computeAgentQualityScore(row);
    }

    if (rows.length < PAGE_SIZE) break;
    page += 1;
  }

  if (page >= MAX_PAGES) truncated = true;

  return {
    network,
    label: getAgentSubgraphLabel(network),
    agents: totalAgents,
    active7d,
    new24h,
    reviews,
    averageQuality: totalAgents ? Math.round(qualitySum / totalAgents) : 0,
    truncated,
    subgraphStatus: "live",
  };
}

function emptySummary(network: AgentSubgraphNetwork, subgraphStatus: NetworkSummary["subgraphStatus"], error?: string): NetworkSummary {
  return {
    network,
    label: getAgentSubgraphLabel(network),
    agents: 0,
    active7d: 0,
    new24h: 0,
    reviews: 0,
    averageQuality: 0,
    truncated: false,
    subgraphStatus,
    error,
  };
}

async function summarizeNetworkSafe(network: AgentSubgraphNetwork): Promise<NetworkSummary> {
  try {
    return await Promise.race([
      summarizeNetwork(network),
      new Promise<NetworkSummary>((resolve) => {
        setTimeout(() => resolve(emptySummary(network, "timeout", "Timed out while querying the subgraph.")), NETWORK_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to query subgraph";
    const subgraphStatus = message.includes("Missing env var") ? "missing" : "error";
    return emptySummary(network, subgraphStatus, message);
  }
}

export async function getNetworkSummary(force = false): Promise<NetworkSummary[]> {
  if (!force && cache && cache.expiresAt > Date.now()) {
    return cache.data;
  }

  const summaries = await Promise.all(AGENT_SUBGRAPH_NETWORKS.map((network) => summarizeNetworkSafe(network)));
  const sorted = summaries.sort((a, b) => b.agents - a.agents);
  cache = {
    data: sorted,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  return sorted;
}
