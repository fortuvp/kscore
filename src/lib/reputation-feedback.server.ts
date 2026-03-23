import "server-only";

import { GraphQLClient, gql } from "graphql-request";
import { createPublicClient, http, parseAbiItem, type Chain } from "viem";
import { base, bsc, mainnet, polygon, sepolia } from "viem/chains";
import type { AgentWithDetails, Feedback } from "@/types/agent";
import { getAgentSubgraphUrl } from "@/lib/agent-subgraphs.server";
import type { AgentSubgraphNetwork } from "@/lib/agent-networks";

type CachedBigInt = {
  expiresAt: number;
  value: bigint | null;
};

type FeedbackOverlay = {
  feedback: Feedback[];
  revokedIds: string[];
  totalDelta: number;
  newestActivityAt: number | null;
  txHashes: Map<string, string>;
};

type ReputationFallbackConfig = {
  chain: Chain;
  chainId: bigint;
  reputationRegistryAddress: `0x${string}`;
  reputationStartBlock: bigint;
  rpcEnvKeys: string[];
  flagEnv: string;
};

const REPUTATION_FEEDBACK_OVERFETCH = 40;
const HEAD_CACHE_TTL_MS = 15_000;
const SUBGRAPH_META_CACHE_TTL_MS = 60_000;
const LOG_CHUNK_SIZE = 50_000n;

const GET_SUBGRAPH_META = gql`
  query GetAgentSubgraphMeta {
    _meta {
      block {
        number
      }
    }
  }
`;

const LOG_NEW_FEEDBACK = parseAbiItem(
  "event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)"
);

const LOG_FEEDBACK_REVOKED = parseAbiItem(
  "event FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex)"
);

const REPUTATION_FALLBACK_CONFIGS: Record<AgentSubgraphNetwork, ReputationFallbackConfig> = {
  sepolia: {
    chain: sepolia,
    chainId: 11155111n,
    reputationRegistryAddress: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
    reputationStartBlock: 10107135n,
    rpcEnvKeys: ["SEPOLIA_RPC_URL", "NEXT_PUBLIC_SEPOLIA_RPC_URL"],
    flagEnv: "FEATURE_REPUTATION_RPC_FALLBACK_SEPOLIA",
  },
  ethereum: {
    chain: mainnet,
    chainId: 1n,
    reputationRegistryAddress: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
    reputationStartBlock: 24339924n,
    rpcEnvKeys: ["ETHEREUM_RPC_URL", "NEXT_PUBLIC_ETHEREUM_RPC_URL"],
    flagEnv: "FEATURE_REPUTATION_RPC_FALLBACK_ETHEREUM",
  },
  base: {
    chain: base,
    chainId: 8453n,
    reputationRegistryAddress: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
    reputationStartBlock: 41663801n,
    rpcEnvKeys: ["BASE_RPC_URL", "NEXT_PUBLIC_BASE_RPC_URL"],
    flagEnv: "FEATURE_REPUTATION_RPC_FALLBACK_BASE",
  },
  bsc: {
    chain: bsc,
    chainId: 56n,
    reputationRegistryAddress: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
    reputationStartBlock: 79031676n,
    rpcEnvKeys: ["BSC_RPC_URL", "NEXT_PUBLIC_BSC_RPC_URL"],
    flagEnv: "FEATURE_REPUTATION_RPC_FALLBACK_BSC",
  },
  polygon: {
    chain: polygon,
    chainId: 137n,
    reputationRegistryAddress: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
    reputationStartBlock: 82458532n,
    rpcEnvKeys: ["POLYGON_RPC_URL", "NEXT_PUBLIC_POLYGON_RPC_URL"],
    flagEnv: "FEATURE_REPUTATION_RPC_FALLBACK_POLYGON",
  },
};

const publicClientsByNetwork = new Map<AgentSubgraphNetwork, ReturnType<typeof createPublicClient>>();
const subgraphClientsByNetwork = new Map<AgentSubgraphNetwork, GraphQLClient>();
const headCacheByNetwork = new Map<AgentSubgraphNetwork, CachedBigInt>();
const indexedBlockCacheByNetwork = new Map<AgentSubgraphNetwork, CachedBigInt>();

function getCache(map: Map<AgentSubgraphNetwork, CachedBigInt>, network: AgentSubgraphNetwork) {
  const existing = map.get(network);
  if (existing) return existing;
  const created = { expiresAt: 0, value: null };
  map.set(network, created);
  return created;
}

function parseBooleanFlag(value: string | undefined): boolean | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

function isReputationFallbackEnabled(network: AgentSubgraphNetwork): boolean {
  const config = REPUTATION_FALLBACK_CONFIGS[network];
  const specific = parseBooleanFlag(process.env[config.flagEnv]);
  if (specific !== null) return specific;

  const global = parseBooleanFlag(process.env.FEATURE_REPUTATION_RPC_FALLBACK);
  if (global !== null) return global;

  return true;
}

function getRpcUrl(network: AgentSubgraphNetwork): string | null {
  const config = REPUTATION_FALLBACK_CONFIGS[network];
  for (const envKey of config.rpcEnvKeys) {
    const value = process.env[envKey]?.trim();
    if (value) return value;
  }

  return config.chain.rpcUrls.default.http[0] || null;
}

function getPublicClient(network: AgentSubgraphNetwork) {
  if (!isReputationFallbackEnabled(network)) return null;

  const existing = publicClientsByNetwork.get(network);
  if (existing) return existing;

  const rpcUrl = getRpcUrl(network);
  if (!rpcUrl) return null;

  const config = REPUTATION_FALLBACK_CONFIGS[network];
  const client = createPublicClient({
    chain: config.chain,
    transport: http(rpcUrl),
  });
  publicClientsByNetwork.set(network, client);
  return client;
}

function getSubgraphClient(network: AgentSubgraphNetwork) {
  const existing = subgraphClientsByNetwork.get(network);
  if (existing) return existing;

  const client = new GraphQLClient(getAgentSubgraphUrl(network));
  subgraphClientsByNetwork.set(network, client);
  return client;
}

async function getHeadBlock(network: AgentSubgraphNetwork): Promise<bigint | null> {
  const cache = getCache(headCacheByNetwork, network);
  const now = Date.now();
  if (cache.value !== null && cache.expiresAt > now) {
    return cache.value;
  }

  const client = getPublicClient(network);
  if (!client) return null;
  const publicClient = client;

  const value = await publicClient.getBlockNumber();
  cache.value = value;
  cache.expiresAt = now + HEAD_CACHE_TTL_MS;
  return value;
}

async function getIndexedBlock(network: AgentSubgraphNetwork): Promise<bigint | null> {
  const cache = getCache(indexedBlockCacheByNetwork, network);
  const now = Date.now();
  if (cache.value !== null && cache.expiresAt > now) {
    return cache.value;
  }

  const response = await getSubgraphClient(network).request<{
    _meta?: { block?: { number?: number | string | null } | null } | null;
  }>(GET_SUBGRAPH_META);

  const raw = response?._meta?.block?.number;
  if (raw === null || raw === undefined) return null;

  const value = BigInt(raw);
  cache.value = value;
  cache.expiresAt = now + SUBGRAPH_META_CACHE_TTL_MS;
  return value;
}

function parseNumericAgentId(agentId: string): bigint | null {
  const trimmed = agentId.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) return BigInt(trimmed);

  if (trimmed.startsWith("eip155:")) {
    const parts = trimmed.split(":");
    const tail = parts[parts.length - 1];
    if (tail && /^\d+$/.test(tail)) return BigInt(tail);
  }

  return null;
}

function formatFeedbackValue(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;

  if (!decimals) {
    return `${negative ? "-" : ""}${absolute.toString()}`;
  }

  const scale = 10n ** BigInt(decimals);
  const whole = absolute / scale;
  const fraction = absolute % scale;
  const paddedFraction = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  const rendered = paddedFraction ? `${whole.toString()}.${paddedFraction}` : whole.toString();
  return `${negative ? "-" : ""}${rendered}`;
}

function buildFeedbackId(
  network: AgentSubgraphNetwork,
  agentId: bigint,
  clientAddress: string,
  feedbackIndex: bigint
): string {
  const chainId = REPUTATION_FALLBACK_CONFIGS[network].chainId;
  return `${chainId.toString()}:${agentId.toString()}:${clientAddress.toLowerCase()}:${feedbackIndex.toString()}`;
}

function compareFeedbackDesc(left: Feedback, right: Feedback): number {
  const leftCreatedAt = Number.parseInt(left.createdAt, 10) || 0;
  const rightCreatedAt = Number.parseInt(right.createdAt, 10) || 0;
  if (rightCreatedAt !== leftCreatedAt) return rightCreatedAt - leftCreatedAt;
  return right.id.localeCompare(left.id);
}

function trimFeedback(agent: AgentWithDetails, feedbackFirst: number): AgentWithDetails {
  return {
    ...agent,
    feedback: [...agent.feedback].sort(compareFeedbackDesc).slice(0, feedbackFirst),
  };
}

async function fetchFeedbackOverlay(
  network: AgentSubgraphNetwork,
  agentId: string,
  targetFeedbackIds: Set<string>
): Promise<FeedbackOverlay | null> {
  if (!isReputationFallbackEnabled(network)) return null;

  const numericAgentId = parseNumericAgentId(agentId);
  if (numericAgentId === null) return null;

  const client = getPublicClient(network);
  if (!client) return null;
  const publicClient = client;

  const [indexedBlock, headBlock] = await Promise.all([
    getIndexedBlock(network),
    getHeadBlock(network),
  ]);

  if (headBlock === null) return null;

  const config = REPUTATION_FALLBACK_CONFIGS[network];
  const needsOverlay = indexedBlock !== null && headBlock > indexedBlock;
  const txHashes = new Map<string, string>();
  if (!needsOverlay && targetFeedbackIds.size === 0) return null;

  const blockTimestampCache = new Map<bigint, number>();
  async function getBlockTimestamp(blockNumber: bigint): Promise<number> {
    const cached = blockTimestampCache.get(blockNumber);
    if (cached !== undefined) return cached;
    const block = await publicClient.getBlock({ blockNumber });
    const value = Number(block.timestamp);
    blockTimestampCache.set(blockNumber, value);
    return value;
  }

  const activeWindowFeedback = new Map<string, Feedback>();
  const createdIds = new Set<string>();
  const revokedIds = new Set<string>();
  let newestActivityAt = 0;

  if (needsOverlay && indexedBlock !== null) {
    let fromBlock = indexedBlock + 1n;
    if (fromBlock < config.reputationStartBlock) {
      fromBlock = config.reputationStartBlock;
    }

    for (let cursor = fromBlock; cursor <= headBlock; cursor += LOG_CHUNK_SIZE + 1n) {
      const toBlock = cursor + LOG_CHUNK_SIZE > headBlock ? headBlock : cursor + LOG_CHUNK_SIZE;
      const [newFeedbackLogs, revokedLogs] = await Promise.all([
        publicClient.getLogs({
          address: config.reputationRegistryAddress,
          event: LOG_NEW_FEEDBACK,
          args: { agentId: numericAgentId },
          fromBlock: cursor,
          toBlock,
        }),
        publicClient.getLogs({
          address: config.reputationRegistryAddress,
          event: LOG_FEEDBACK_REVOKED,
          args: { agentId: numericAgentId },
          fromBlock: cursor,
          toBlock,
        }),
      ]);

      for (const log of newFeedbackLogs) {
        const { agentId: eventAgentId, clientAddress, feedbackIndex, value, valueDecimals, tag1, tag2 } = log.args;
        if (
          eventAgentId === undefined ||
          clientAddress === undefined ||
          feedbackIndex === undefined ||
          value === undefined ||
          valueDecimals === undefined
        ) {
          continue;
        }

        const feedbackId = buildFeedbackId(network, eventAgentId, clientAddress, feedbackIndex);
        createdIds.add(feedbackId);
        if (log.transactionHash) txHashes.set(feedbackId, log.transactionHash);

        const createdAt = await getBlockTimestamp(log.blockNumber);
        if (createdAt > newestActivityAt) newestActivityAt = createdAt;

        activeWindowFeedback.set(feedbackId, {
          id: feedbackId,
          value: formatFeedbackValue(value, Number(valueDecimals)),
          tag1: tag1 || null,
          tag2: tag2 || null,
          clientAddress: clientAddress.toLowerCase(),
          createdAt: createdAt.toString(),
          txHash: log.transactionHash || null,
          feedbackFile: null,
        });
      }

      for (const log of revokedLogs) {
        const { agentId: eventAgentId, clientAddress, feedbackIndex } = log.args;
        if (eventAgentId === undefined || clientAddress === undefined || feedbackIndex === undefined) {
          continue;
        }

        const feedbackId = buildFeedbackId(network, eventAgentId, clientAddress, feedbackIndex);
        revokedIds.add(feedbackId);
        activeWindowFeedback.delete(feedbackId);

        const revokedAt = await getBlockTimestamp(log.blockNumber);
        if (revokedAt > newestActivityAt) newestActivityAt = revokedAt;
      }
    }
  }

  const unresolvedTxIds = new Set(Array.from(targetFeedbackIds).filter((id) => !txHashes.has(id)));
  let searchToBlock = indexedBlock !== null && indexedBlock < headBlock ? indexedBlock : headBlock;

  while (unresolvedTxIds.size > 0 && searchToBlock >= config.reputationStartBlock) {
    const candidateStart = searchToBlock > LOG_CHUNK_SIZE ? searchToBlock - LOG_CHUNK_SIZE : 0n;
    const fromBlock = candidateStart < config.reputationStartBlock ? config.reputationStartBlock : candidateStart;

    const logs = await publicClient.getLogs({
      address: config.reputationRegistryAddress,
      event: LOG_NEW_FEEDBACK,
      args: { agentId: numericAgentId },
      fromBlock,
      toBlock: searchToBlock,
    });

    for (let index = logs.length - 1; index >= 0; index -= 1) {
      const log = logs[index];
      const { agentId: eventAgentId, clientAddress, feedbackIndex } = log.args;
      if (
        eventAgentId === undefined ||
        clientAddress === undefined ||
        feedbackIndex === undefined ||
        !log.transactionHash
      ) {
        continue;
      }

      const feedbackId = buildFeedbackId(network, eventAgentId, clientAddress, feedbackIndex);
      if (!unresolvedTxIds.has(feedbackId)) continue;
      txHashes.set(feedbackId, log.transactionHash);
      unresolvedTxIds.delete(feedbackId);
      if (unresolvedTxIds.size === 0) break;
    }

    if (fromBlock === config.reputationStartBlock) break;
    searchToBlock = fromBlock - 1n;
  }

  let totalDelta = 0;
  for (const feedbackId of createdIds) {
    if (!revokedIds.has(feedbackId)) totalDelta += 1;
  }
  for (const feedbackId of revokedIds) {
    if (!createdIds.has(feedbackId)) totalDelta -= 1;
  }

  return {
    feedback: Array.from(activeWindowFeedback.values()).sort(compareFeedbackDesc),
    revokedIds: Array.from(revokedIds),
    totalDelta,
    newestActivityAt: newestActivityAt > 0 ? newestActivityAt : null,
    txHashes,
  };
}

export function getReputationFeedbackRequestSize(
  network: AgentSubgraphNetwork,
  feedbackFirst: number
): number {
  return isReputationFallbackEnabled(network)
    ? Math.max(feedbackFirst, REPUTATION_FEEDBACK_OVERFETCH)
    : feedbackFirst;
}

export async function refreshAgentFeedbackFromChain(
  network: AgentSubgraphNetwork,
  agent: AgentWithDetails,
  feedbackFirst: number
): Promise<AgentWithDetails> {
  try {
    const targetFeedbackIds = new Set(agent.feedback.map((item) => item.id));
    const overlay = await fetchFeedbackOverlay(network, agent.agentId, targetFeedbackIds);
    if (!overlay) return trimFeedback(agent, feedbackFirst);

    const merged = new Map<string, Feedback>();
    for (const item of agent.feedback) {
      const txHash = overlay.txHashes.get(item.id);
      merged.set(item.id, txHash ? { ...item, txHash } : item);
    }

    for (const feedbackId of overlay.revokedIds) {
      merged.delete(feedbackId);
    }

    for (const item of overlay.feedback) {
      const existing = merged.get(item.id);
      merged.set(
        item.id,
        existing
          ? {
              ...existing,
              ...item,
              txHash: item.txHash || existing.txHash || null,
              feedbackFile: existing.feedbackFile || item.feedbackFile,
            }
          : item
      );
    }

    const mergedFeedback = Array.from(merged.values()).sort(compareFeedbackDesc).slice(0, feedbackFirst);
    const totalFeedbackBase = Number.parseInt(agent.totalFeedback, 10) || 0;
    const lastActivityBase = Number.parseInt(agent.lastActivity, 10) || 0;
    const lastActivity = Math.max(lastActivityBase, overlay.newestActivityAt || 0);

    return {
      ...agent,
      totalFeedback: String(Math.max(0, totalFeedbackBase + overlay.totalDelta)),
      lastActivity: String(lastActivity || lastActivityBase),
      feedback: mergedFeedback,
    };
  } catch {
    return trimFeedback(agent, feedbackFirst);
  }
}
