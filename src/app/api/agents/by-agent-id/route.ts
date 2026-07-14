import { NextResponse } from "next/server";
import { getAgentByAgentId } from "@/lib/subgraph.handler";
import {
  AGENT_SUBGRAPH_NETWORKS,
  AGENT_NETWORK_CHAIN_IDS,
  isAgentSubgraphNetwork,
  type AgentSubgraphNetwork,
} from "@/lib/agent-networks";
import { getCurateFallbackAgentByAgentId } from "@/lib/curate-agent-fallback.server";
import { getSepoliaIdentityRegistryFallbackAgentByAgentId } from "@/lib/identity-registry-fallback.server";
import type { AgentWithDetails } from "@/types/agent";
import { mergeAgentMetadataSources } from "@/lib/agent-metadata";
import { getVerificationEnvironmentFromSearchParams } from "@/lib/verification-environment";
import { getPgtcrDeployment } from "@/lib/curate-config";

const SUBGRAPH_LOOKUP_TIMEOUT_MS = 6000;
const FAST_LOOKUP_TIMEOUT_MS = 3000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), timeoutMs);
    }),
  ]);
}

function parseFreshParam(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function getFeedbackScore(agent: AgentWithDetails | null | undefined): number {
  if (!agent) return -1;
  const totalFeedback = Number.parseInt(agent.totalFeedback || "0", 10) || 0;
  return Math.max(totalFeedback, agent.feedback?.length || 0);
}

function buildAgentIdCandidates(agentIdParam: string, network: AgentSubgraphNetwork): string[] {
  const trimmed = agentIdParam.trim();
  if (!trimmed) return [];

  const candidates = new Set<string>();
  candidates.add(trimmed);

  if (trimmed.startsWith("eip155:")) {
    const parts = trimmed.split(":");
    if (parts.length >= 3 && parts[2]) candidates.add(parts[2]);
  } else if (/^\d+:\d+$/.test(trimmed)) {
    const tail = trimmed.split(":").pop();
    if (tail) candidates.add(tail);
  } else if (/^\d+$/.test(trimmed)) {
    candidates.add(`eip155:${AGENT_NETWORK_CHAIN_IDS[network]}:${trimmed}`);
  }

  return Array.from(candidates);
}

function getNetworkSearchOrder(
  requestedNetwork: AgentSubgraphNetwork | null
): AgentSubgraphNetwork[] {
  if (!requestedNetwork) return [...AGENT_SUBGRAPH_NETWORKS];
  return [requestedNetwork];
}

async function resolveAgentByAgentId(
  agentIdParam: string,
  requestedNetwork: AgentSubgraphNetwork | null,
  fresh = false
) {
  const checked: Array<{ network: AgentSubgraphNetwork; agentId: string }> = [];
  const seen = new Set<string>();

  for (const network of getNetworkSearchOrder(requestedNetwork)) {
    for (const candidate of buildAgentIdCandidates(agentIdParam, network)) {
      const key = `${network}:${candidate}`;
      if (seen.has(key)) continue;
      seen.add(key);
      checked.push({ network, agentId: candidate });

      try {
        const agent = await withTimeout(
          getAgentByAgentId(candidate, network, 10, !fresh),
          fresh ? SUBGRAPH_LOOKUP_TIMEOUT_MS : FAST_LOOKUP_TIMEOUT_MS,
          null
        );
        if (agent) {
          return { agent, network, agentId: candidate, checked };
        }
      } catch {
        // Keep scanning other configured networks instead of failing the whole lookup.
      }
    }
  }

  return { agent: null, network: null, agentId: agentIdParam, checked };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const verificationEnvironment = getVerificationEnvironmentFromSearchParams(url.searchParams);
  const verificationChainId = getPgtcrDeployment(verificationEnvironment).chainId;
  try {
    const agentIdParam = url.searchParams.get("agentId")?.trim();
    const rawNetwork = url.searchParams.get("network");
    const fresh = parseFreshParam(url.searchParams.get("fresh"));

    let requestedNetwork: AgentSubgraphNetwork | null = null;
    if (rawNetwork) {
      if (!isAgentSubgraphNetwork(rawNetwork)) {
        return NextResponse.json(
          { success: false, error: `Invalid network '${rawNetwork}'`, verificationEnvironment, verificationChainId },
          { status: 400 }
        );
      }
      requestedNetwork = rawNetwork;
    }

    if (!agentIdParam) {
      return NextResponse.json(
        { success: false, error: "Missing agentId", verificationEnvironment, verificationChainId },
        { status: 400 }
      );
    }

    const [resolved, curateFallback] = await Promise.all([
      resolveAgentByAgentId(agentIdParam, requestedNetwork, fresh),
      withTimeout(
        getCurateFallbackAgentByAgentId(agentIdParam, requestedNetwork, 10, {
          skipChainRefresh: !fresh,
          verificationEnvironment,
        }),
        fresh ? SUBGRAPH_LOOKUP_TIMEOUT_MS : FAST_LOOKUP_TIMEOUT_MS,
        null
      ),
    ]);

    const curateHasBetterFeedback =
      curateFallback?.agent && getFeedbackScore(curateFallback.agent) > getFeedbackScore(resolved.agent);
    const preferredAgent = curateHasBetterFeedback ? curateFallback?.agent || null : resolved.agent;
    const secondaryAgent = curateHasBetterFeedback ? resolved.agent : curateFallback?.agent || null;
    const bestResolvedAgent = preferredAgent
      ? mergeAgentMetadataSources(preferredAgent, secondaryAgent)
      : null;
    const bestResolvedNetwork =
      curateHasBetterFeedback
        ? curateFallback.network
        : resolved.network;
    const bestResolvedAgentId =
      curateHasBetterFeedback
        ? curateFallback.agent.agentId
        : resolved.agentId;

    if (bestResolvedAgent && bestResolvedNetwork) {
      return NextResponse.json({
        success: true,
        found: true,
        network: bestResolvedNetwork,
        requestedNetwork,
        agentId: bestResolvedAgentId,
        item: bestResolvedAgent,
        verificationEnvironment,
        verificationChainId,
      });
    }

    if (curateFallback?.agent && curateFallback.network) {
      return NextResponse.json({
        success: true,
        found: true,
        network: curateFallback.network,
        requestedNetwork,
        agentId: curateFallback.agent.agentId,
        item: curateFallback.agent,
        verificationEnvironment,
        verificationChainId,
      });
    }

    const sepoliaFallback =
      requestedNetwork && requestedNetwork !== "sepolia"
        ? null
        : await withTimeout(
            getSepoliaIdentityRegistryFallbackAgentByAgentId(agentIdParam, { skipChainRefresh: !fresh }),
            fresh ? SUBGRAPH_LOOKUP_TIMEOUT_MS : FAST_LOOKUP_TIMEOUT_MS,
            null
          );

    if (sepoliaFallback) {
      return NextResponse.json({
        success: true,
        found: true,
        network: "sepolia",
        requestedNetwork,
        agentId: sepoliaFallback.agentId,
        item: sepoliaFallback,
        verificationEnvironment,
        verificationChainId,
      });
    }

    return NextResponse.json({
      success: true,
      found: false,
      network: requestedNetwork,
      requestedNetwork,
      agentId: agentIdParam,
      item: null,
      verificationEnvironment,
      verificationChainId,
      checked: resolved.checked,
    });
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        error: e instanceof Error ? e.message : "Unknown error",
        verificationEnvironment,
        verificationChainId,
      },
      { status: 500 }
    );
  }
}
