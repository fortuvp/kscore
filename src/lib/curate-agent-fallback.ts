import { AGENT_NETWORK_CHAIN_IDS, type AgentSubgraphNetwork } from "@/lib/agent-networks";
import { getAgentNetworkFromChainId, parseChainId } from "@/lib/block-explorer";
import {
  createEmptyRegistrationFile,
  loadAgentRegistrationFile,
  normalizeAgentRegistrationFile,
  parseAgentRegistrationFileUri,
} from "@/lib/agent-metadata";
import type { AgentRegistrationFile, AgentWithDetails } from "@/types/agent";

const EMPTY_OWNER_ADDRESS = "0x0000000000000000000000000000000000000000";

export function normalizeCurateRegistrationFile(payload: unknown): AgentRegistrationFile {
  return normalizeAgentRegistrationFile(payload);
}

export function parseCurateRegistrationFile(uri: string | null | undefined): AgentRegistrationFile | null {
  return parseAgentRegistrationFileUri(uri);
}

export async function loadCurateRegistrationFile(
  uri: string | null | undefined,
  timeoutMs?: number
): Promise<AgentRegistrationFile | null> {
  return loadAgentRegistrationFile(uri, timeoutMs);
}

export function extractCurateAgentNumber(agentIdLike: string): string {
  const trimmed = agentIdLike.trim();
  if (!trimmed) return trimmed;
  if (/^\d+$/.test(trimmed)) return trimmed;
  if (trimmed.startsWith("eip155:")) {
    const tail = trimmed.split(":").pop()?.trim();
    if (tail && /^\d+$/.test(tail)) return tail;
  }
  return trimmed;
}

export function parseCaip10Owner(value: string | null | undefined): {
  owner: string | null;
  chainId: string | null;
  network: AgentSubgraphNetwork | null;
} {
  const trimmed = value?.trim();
  if (!trimmed?.startsWith("eip155:")) {
    return { owner: null, chainId: null, network: null };
  }

  const parts = trimmed.split(":");
  const chainId = parts[1]?.trim() || null;
  const owner = parts.slice(2).join(":").trim() || null;
  const network = getAgentNetworkFromChainId(chainId);
  return { owner, chainId, network };
}

export function buildCurateFallbackAgent(params: {
  agentId: string;
  agentUri: string | null;
  key2: string | null;
  network: AgentSubgraphNetwork;
  includedAt: string | number | null | undefined;
  registrationFile?: AgentRegistrationFile | null;
}): AgentWithDetails {
  const registrationFile = params.registrationFile || createEmptyRegistrationFile();
  const caip10 = parseCaip10Owner(params.key2);
  const chainId = parseChainId(caip10.chainId) || AGENT_NETWORK_CHAIN_IDS[params.network];
  const timestamp = Number(params.includedAt) || Math.floor(Date.now() / 1000);

  return {
    id: params.agentId,
    agentId: params.agentId,
    chainId: String(chainId),
    owner: caip10.owner || EMPTY_OWNER_ADDRESS,
    operators: [],
    agentURI: params.agentUri,
    createdAt: String(timestamp),
    updatedAt: String(timestamp),
    totalFeedback: "0",
    lastActivity: String(timestamp),
    registrationFile,
    feedback: [],
    stats: null,
  };
}
