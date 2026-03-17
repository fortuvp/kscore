import "server-only";
import type { AgentSubgraphNetwork } from "@/lib/agent-networks";
import { AGENT_SUBGRAPH_ENV_KEYS } from "@/lib/agent-networks";

function getTheGraphApiKey(): string {
  const apiKey = process.env.THEGRAPH_API_KEY;
  if (!apiKey) {
    throw new Error("Missing env var THEGRAPH_API_KEY (required to query The Graph gateway)");
  }
  return apiKey;
}

export function getAgentSubgraphKey(network: AgentSubgraphNetwork): string {
  const { envVarName, subgraphId: key } = describeAgentSubgraphConfig(network);
  if (!key) {
    throw new Error(`Missing env var ${envVarName} (required subgraph key for ${network})`);
  }
  return key;
}

export function describeAgentSubgraphConfig(network: AgentSubgraphNetwork) {
  const envVarName = AGENT_SUBGRAPH_ENV_KEYS[network];
  const subgraphId = process.env[envVarName] || null;
  return {
    envVarName,
    subgraphId,
    gatewayUrl: subgraphId ? `https://gateway.thegraph.com/api/[configured]/subgraphs/id/${subgraphId}` : null,
  };
}

export function getAgentSubgraphUrl(network: AgentSubgraphNetwork): string {
  const apiKey = getTheGraphApiKey();
  const subgraphKey = getAgentSubgraphKey(network);
  return `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/${subgraphKey}`;
}
