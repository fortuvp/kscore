import { NextRequest, NextResponse } from "next/server";

import { getAcceptedCurateAgentIds } from "@/lib/curate-agent-fallback.server";
import { listSepoliaIdentityRegistryFallbackAgentsByOwner } from "@/lib/identity-registry-fallback.server";
import {
  AGENT_SUBGRAPH_NETWORKS,
  isAgentSubgraphNetwork,
  type AgentSubgraphNetwork,
} from "@/lib/agent-networks";
import { getAgentsByOwner } from "@/lib/subgraph.handler";
import type { Agent } from "@/types/agent";
import { mergeAgentMetadataSources } from "@/lib/agent-metadata";
import {
  getVerificationEnvironmentFromSearchParams,
  type VerificationEnvironment,
} from "@/lib/verification-environment";
import { getPgtcrDeployment } from "@/lib/curate-config";

const SUBGRAPH_TIMEOUT_MS = 1_800;
const ONCHAIN_TIMEOUT_MS = 5_000;
const CURATE_TIMEOUT_MS = 2_500;

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

function matchesProtocol(agent: Agent, protocol?: string) {
  if (!protocol || protocol === "all") return true;
  if (protocol === "mcp") return Boolean(agent.registrationFile?.mcpEndpoint);
  if (protocol === "a2a") return Boolean(agent.registrationFile?.a2aEndpoint);
  return true;
}

function compareAgentIdsDesc(a: Agent, b: Agent) {
  try {
    const aId = BigInt(a.agentId);
    const bId = BigInt(b.agentId);
    if (aId === bId) return 0;
    return aId > bId ? -1 : 1;
  } catch {
    return b.agentId.localeCompare(a.agentId);
  }
}

async function getOwnedAgentsForNetwork(params: {
  owner: string;
  network: AgentSubgraphNetwork;
  first: number;
  protocol?: string;
}) {
  const [subgraphItems, onchainItems] = await Promise.all([
    withTimeout(
      getAgentsByOwner({
        owner: params.owner,
        first: params.first,
        skip: 0,
        protocol: params.protocol,
        network: params.network,
      }),
      [] as Agent[],
      SUBGRAPH_TIMEOUT_MS
    ),
    params.network === "sepolia"
      ? withTimeout(
          listSepoliaIdentityRegistryFallbackAgentsByOwner(params.owner, { first: params.first, skip: 0 }),
          [] as Agent[],
          ONCHAIN_TIMEOUT_MS
        )
      : Promise.resolve([] as Agent[]),
  ]);

  const unique = new Map<string, Agent>();
  for (const agent of [...onchainItems, ...subgraphItems]) {
    if (agent.owner.toLowerCase() !== params.owner.toLowerCase()) continue;
    if (!matchesProtocol(agent, params.protocol)) continue;
    const existing = unique.get(agent.agentId);
    unique.set(agent.agentId, existing ? mergeAgentMetadataSources(existing, agent) : agent);
  }
  return Array.from(unique.values()).sort(compareAgentIdsDesc);
}

async function getAcceptedKeys(
  networks: readonly AgentSubgraphNetwork[],
  verificationEnvironment: VerificationEnvironment
) {
  const keys = new Set<string>();
  for (const network of networks) {
    const ids = await withTimeout(
      getAcceptedCurateAgentIds(network, verificationEnvironment),
      [] as string[],
      CURATE_TIMEOUT_MS
    );
    for (const id of ids) keys.add(`${network}:${id}`);
  }
  return keys;
}

export async function GET(request: NextRequest) {
  const owner = request.nextUrl.searchParams.get("owner")?.trim();
  const protocol = request.nextUrl.searchParams.get("protocol") || undefined;
  const first = Math.max(1, Math.min(200, Number.parseInt(request.nextUrl.searchParams.get("first") || "50", 10)));
  const skip = Math.max(0, Number.parseInt(request.nextUrl.searchParams.get("skip") || "0", 10));
  const rawNetwork = request.nextUrl.searchParams.get("network");
  const verificationEnvironment = getVerificationEnvironmentFromSearchParams(request.nextUrl.searchParams);
  const verificationChainId = getPgtcrDeployment(verificationEnvironment).chainId;

  if (!owner) {
    return NextResponse.json(
      { success: false, error: "Missing owner address", items: [], verificationEnvironment, verificationChainId },
      { status: 400 }
    );
  }

  let networks: readonly AgentSubgraphNetwork[] = ["sepolia"];
  if (rawNetwork === "all") {
    networks = AGENT_SUBGRAPH_NETWORKS;
  } else if (rawNetwork) {
    if (!isAgentSubgraphNetwork(rawNetwork)) {
      return NextResponse.json(
        { success: false, error: `Invalid network '${rawNetwork}'`, items: [], verificationEnvironment, verificationChainId },
        { status: 400 }
      );
    }
    networks = [rawNetwork];
  }

  try {
    const [groups, acceptedKeys] = await Promise.all([
      Promise.all(
        networks.map(async (network) => ({
          network,
          items: await getOwnedAgentsForNetwork({ owner, network, first: first + skip + 1, protocol }),
        }))
      ),
      getAcceptedKeys(networks, verificationEnvironment),
    ]);

    const merged = groups
      .flatMap(({ network, items }) =>
        items.map((agent) => ({
          ...agent,
          sourceNetwork: network,
          collateralized: acceptedKeys.has(`${network}:${agent.agentId}`),
        }))
      )
      .sort((a, b) => compareAgentIdsDesc(a, b));

    return NextResponse.json({
      success: true,
      items: merged.slice(skip, skip + first),
      network: rawNetwork || "sepolia",
      verificationEnvironment,
      verificationChainId,
      hasMore: merged.length > skip + first,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to search by owner",
        items: [],
        verificationEnvironment,
        verificationChainId,
      },
      { status: 500 }
    );
  }
}
