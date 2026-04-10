import { NextResponse } from "next/server";
import { getAgentByAgentId } from "@/lib/subgraph.handler";
import {
  AGENT_SUBGRAPH_NETWORKS,
  AGENT_NETWORK_CHAIN_IDS,
  isAgentSubgraphNetwork,
  type AgentSubgraphNetwork,
} from "@/lib/agent-networks";
import { getCurateFallbackAgentByAgentId } from "@/lib/curate-agent-fallback.server";
import type { AgentWithDetails } from "@/types/agent";

const SUBGRAPH_LOOKUP_TIMEOUT_MS = 6000;

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
  requestedNetwork: AgentSubgraphNetwork | null
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
        const agent = await Promise.race([
          getAgentByAgentId(candidate, network, 10, true),
          new Promise<null>((resolve) => {
            setTimeout(() => resolve(null), SUBGRAPH_LOOKUP_TIMEOUT_MS);
          }),
        ]);
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
  try {
    const url = new URL(req.url);
    const agentIdParam = url.searchParams.get("agentId")?.trim();
    const rawNetwork = url.searchParams.get("network");

    let requestedNetwork: AgentSubgraphNetwork | null = null;
    if (rawNetwork) {
      if (!isAgentSubgraphNetwork(rawNetwork)) {
        return NextResponse.json(
          { success: false, error: `Invalid network '${rawNetwork}'` },
          { status: 400 }
        );
      }
      requestedNetwork = rawNetwork;
    }

    if (!agentIdParam) {
      return NextResponse.json(
        { success: false, error: "Missing agentId" },
        { status: 400 }
      );
    }

    const [resolved, curateFallback] = await Promise.all([
      resolveAgentByAgentId(agentIdParam, requestedNetwork),
      getCurateFallbackAgentByAgentId(agentIdParam, requestedNetwork),
    ]);

    const bestResolvedAgent =
      curateFallback?.agent && getFeedbackScore(curateFallback.agent) > getFeedbackScore(resolved.agent)
        ? curateFallback.agent
        : resolved.agent;
    const bestResolvedNetwork =
      curateFallback?.agent && getFeedbackScore(curateFallback.agent) > getFeedbackScore(resolved.agent)
        ? curateFallback.network
        : resolved.network;
    const bestResolvedAgentId =
      curateFallback?.agent && getFeedbackScore(curateFallback.agent) > getFeedbackScore(resolved.agent)
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
      });
    }

    return NextResponse.json({
      success: true,
      found: false,
      network: requestedNetwork,
      requestedNetwork,
      agentId: agentIdParam,
      item: null,
      checked: resolved.checked,
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
