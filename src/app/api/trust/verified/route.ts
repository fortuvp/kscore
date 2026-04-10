import { NextResponse } from "next/server";
import { GraphQLClient, gql } from "graphql-request";
import { getAgentByAgentId } from "@/lib/subgraph.handler";
import { getDisplayName } from "@/lib/format";
import { AGENT_SUBGRAPH_NETWORKS, type AgentSubgraphNetwork } from "@/lib/agent-networks";
import { getAgentNetworkFromChainId, parseChainId } from "@/lib/block-explorer";
import {
  getCurateMode,
  getCurateRegistryAddress,
  getCurateSubgraphUrl,
  getGoldskyApiKey,
  type CurateMode,
} from "@/lib/curate-config";

const SUBGRAPH_LOOKUP_TIMEOUT_MS = 6000;

type CurateProp = {
  label?: string | null;
  value?: string | null;
  isIdentifier?: boolean | null;
};

type VerifiedStatus = "active" | "challenged" | "removed";

type ResolvedTrustRow = {
  id: string;
  key0: string;
  agentId: string;
  name: string;
  network: AgentSubgraphNetwork;
  sourceNetwork: AgentSubgraphNetwork | null;
  resolved: boolean;
  lookupByAgentId?: boolean;
  status: VerifiedStatus;
  curateStatus: string;
  updatedAt: number;
};

const GET_LATEST_GTCR_ITEMS = gql`
  query LatestGtcrItems($registry: String!, $limit: Int!) {
    LItem(
      where: {
        registryAddress: { _eq: $registry }
      }
      order_by: { latestRequestSubmissionTime: desc }
      limit: $limit
    ) {
      itemID
      key0
      status
      latestRequestSubmissionTime
      props {
        label
        value
        isIdentifier
      }
    }
  }
`;

const GET_LATEST_PGTCR_ITEMS = gql`
  query LatestPgtcrItems($registry: Bytes!, $limit: Int!) {
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
        key2
      }
      registry {
        submissionPeriod
        reinclusionPeriod
      }
    }
  }
`;

function makeCurateClient(mode: CurateMode) {
  const url = getCurateSubgraphUrl(mode);
  if (mode === "pgtcr") {
    const apiKey = getGoldskyApiKey();
    return new GraphQLClient(url, apiKey ? { headers: { "x-api-key": apiKey } } : undefined);
  }
  return new GraphQLClient(url);
}

function getNetworkFromCurateProps(props: CurateProp[] | null | undefined): AgentSubgraphNetwork | null {
  const key2 = props?.find((prop) => prop.label?.trim().toLowerCase() === "key2")?.value?.trim();
  if (!key2) return null;
  const chainId = parseChainId(key2);
  if (!chainId) return null;
  return getAgentNetworkFromChainId(chainId);
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

function mapGtcrStatus(status: string): VerifiedStatus {
  if (status === "Registered") return "active";
  if (status === "Absent") return "removed";
  return "challenged";
}

function mapPgtcrStatus(
  status: string,
  includedAtRaw: string | number | null | undefined,
  submissionPeriodRaw: string | number | null | undefined,
  reinclusionPeriodRaw: string | number | null | undefined
): VerifiedStatus {
  if (status === "Absent") return "removed";
  if (status === "Disputed") return "challenged";
  return isPgtcrAccepted(status, includedAtRaw, submissionPeriodRaw, reinclusionPeriodRaw) ? "active" : "challenged";
}

async function resolveAgentForCurateEntry(
  key0: string,
  hintedNetwork: AgentSubgraphNetwork | null
): Promise<{ id: string; agentId: string; name: string; network: AgentSubgraphNetwork } | null> {
  if (hintedNetwork) {
    try {
      const agent = await Promise.race([
        getAgentByAgentId(key0, hintedNetwork, 1, true),
        new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), SUBGRAPH_LOOKUP_TIMEOUT_MS);
        }),
      ]);
      if (agent) {
        return {
          id: agent.id,
          agentId: agent.agentId,
          name: getDisplayName(agent),
          network: hintedNetwork,
        };
      }
    } catch {
      // fall back to unresolved Curate metadata below
    }

    return null;
  }

  for (const network of AGENT_SUBGRAPH_NETWORKS) {
    try {
      const agent = await Promise.race([
        getAgentByAgentId(key0, network, 1, true),
        new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), SUBGRAPH_LOOKUP_TIMEOUT_MS);
        }),
      ]);
      if (!agent) continue;
      return {
        id: agent.id,
        agentId: agent.agentId,
        name: getDisplayName(agent),
        network,
      };
    } catch {
      // keep trying other networks
    }
  }
  return null;
}

async function getTrustRows(): Promise<ResolvedTrustRow[]> {
  const mode = getCurateMode();
  const registryAddress = getCurateRegistryAddress(mode).toLowerCase();
  const curateClient = makeCurateClient(mode);

  const candidates = new Map<
    string,
    {
      key0: string;
      network: AgentSubgraphNetwork | null;
      status: VerifiedStatus;
      curateStatus: string;
      updatedAt: number;
    }
  >();

  if (mode === "gtcr") {
    const response = await curateClient.request<{
      LItem: Array<{
        itemID: string;
        key0: string | null;
        status: string;
        latestRequestSubmissionTime: number;
        props?: CurateProp[];
      }>;
    }>(GET_LATEST_GTCR_ITEMS, {
      registry: registryAddress,
      limit: 160,
    });

    for (const row of response?.LItem || []) {
      const key0 = row.key0?.trim();
      if (!key0) continue;
      const network = getNetworkFromCurateProps(row.props);
      const dedupeKey = `${network || "unknown"}:${key0}`;
      if (candidates.has(dedupeKey)) continue;
      candidates.set(dedupeKey, {
        key0,
        network,
        status: mapGtcrStatus(row.status),
        curateStatus: row.status,
        updatedAt: Number(row.latestRequestSubmissionTime) || 0,
      });
      if (candidates.size >= 60) break;
    }
  } else {
    const response = await curateClient.request<{
      items: Array<{
        itemID: string;
        status: string;
        includedAt: string;
        metadata?: {
          key0?: string | null;
          key2?: string | null;
        } | null;
        registry: {
          submissionPeriod: string;
          reinclusionPeriod: string;
        };
      }>;
    }>(GET_LATEST_PGTCR_ITEMS, {
      registry: registryAddress,
      limit: 200,
    });

    for (const row of response?.items || []) {
      const key0 = row.metadata?.key0?.trim();
      if (!key0) continue;
      const network = (() => {
        const chainId = parseChainId(row.metadata?.key2 || "");
        if (!chainId) return null;
        return getAgentNetworkFromChainId(chainId);
      })();
      const dedupeKey = `${network || "unknown"}:${key0}`;
      if (candidates.has(dedupeKey)) continue;
      candidates.set(dedupeKey, {
        key0,
        network,
        status: mapPgtcrStatus(
          row.status,
          row.includedAt,
          row.registry?.submissionPeriod,
          row.registry?.reinclusionPeriod
        ),
        curateStatus: row.status,
        updatedAt: Number(row.includedAt) || 0,
      });
      if (candidates.size >= 60) break;
    }
  }

  const resolved = await Promise.all(
    Array.from(candidates.values()).map(async (entry) => {
      try {
        const agent = await resolveAgentForCurateEntry(entry.key0, entry.network);
        if (agent) {
          return {
            ...agent,
            key0: entry.key0,
            sourceNetwork: entry.network,
            resolved: true,
            status: entry.status,
            curateStatus: entry.curateStatus,
            updatedAt: entry.updatedAt,
          } satisfies ResolvedTrustRow;
        }
      } catch {
        // fall back to lightweight row below
      }

      return {
        id: entry.key0,
        key0: entry.key0,
        agentId: entry.key0,
        name: `Agent ${entry.key0}`,
        network: entry.network || "sepolia",
        sourceNetwork: entry.network,
        resolved: false,
        lookupByAgentId: true,
        status: entry.status,
        curateStatus: entry.curateStatus,
        updatedAt: entry.updatedAt,
      } satisfies ResolvedTrustRow;
    })
  );

  return resolved
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 80);
}

export async function GET() {
  try {
    const items = await getTrustRows();
    return NextResponse.json({
      success: true,
      generatedAt: new Date().toISOString(),
      items,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch trust verified stream",
        items: [],
      },
      { status: 500 }
    );
  }
}
