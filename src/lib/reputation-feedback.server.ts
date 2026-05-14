import "server-only";

import { GraphQLClient, gql } from "graphql-request";
import { createPublicClient, http, parseAbi, parseAbiItem, type Chain } from "viem";
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
  feedbackUris: Map<string, string>;
  endpoints: Map<string, string>;
};

type FullFeedbackSnapshot = {
  feedback: Feedback[];
  totalFeedback: number;
  newestActivityAt: number | null;
  txHashes: Map<string, string>;
  feedbackUris: Map<string, string>;
  endpoints: Map<string, string>;
};

type FeedbackLogMetadata = {
  newestActivityAt: number | null;
  createdAts: Map<string, string>;
  txHashes: Map<string, string>;
  feedbackUris: Map<string, string>;
  endpoints: Map<string, string>;
};

type FeedbackFilePayload = NonNullable<Feedback["feedbackFile"]>;

type NewFeedbackLogArgs = {
  agentId?: bigint;
  clientAddress?: `0x${string}`;
  feedbackIndex?: bigint;
  value?: bigint;
  valueDecimals?: number;
  tag1?: string;
  tag2?: string;
  endpoint?: string;
  feedbackURI?: string;
};

type FeedbackRevokedLogArgs = {
  agentId?: bigint;
  clientAddress?: `0x${string}`;
  feedbackIndex?: bigint;
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
const MIN_LOG_CHUNK_SIZE = 1_000n;
const TX_BACKFILL_MAX_BLOCKS = 200_000n;
const FEEDBACK_FETCH_TIMEOUT_MS = 6_000;
const IPFS_GATEWAY_BASE_URL = "https://cdn.kleros.link/ipfs/";
const FULL_FEEDBACK_CACHE_TTL_MS = 60_000;
const FULL_FEEDBACK_LOOKBACK_BLOCKS = 20_000n;

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

const REPUTATION_READ_ABI = parseAbi([
  "function readAllFeedback(uint256 agentId, address[] clientAddresses, string tag1, string tag2, bool includeRevoked) view returns (address[] clients, uint64[] feedbackIndexes, int128[] values, uint8[] valueDecimals, string[] tag1s, string[] tag2s, bool[] revokedStatuses)",
]);

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

const publicClientsByRpcUrl = new Map<string, ReturnType<typeof createPublicClient>>();
const subgraphClientsByNetwork = new Map<AgentSubgraphNetwork, GraphQLClient>();
const headCacheByNetwork = new Map<AgentSubgraphNetwork, CachedBigInt>();
const indexedBlockCacheByNetwork = new Map<AgentSubgraphNetwork, CachedBigInt>();
const fullFeedbackCacheByKey = new Map<string, { expiresAt: number; value: FullFeedbackSnapshot | null }>();

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

function getRpcUrls(network: AgentSubgraphNetwork): string[] {
  const config = REPUTATION_FALLBACK_CONFIGS[network];
  const urls: string[] = [];

  for (const envKey of config.rpcEnvKeys) {
    const value = process.env[envKey]?.trim();
    if (value && !urls.includes(value)) urls.push(value);
  }

  for (const value of config.chain.rpcUrls.default.http) {
    if (value && !urls.includes(value)) urls.push(value);
  }

  return urls;
}

function getPublicClient(network: AgentSubgraphNetwork) {
  const clients = getPublicClients(network);
  return clients?.[0] || null;
}

function getPublicClients(network: AgentSubgraphNetwork) {
  if (!isReputationFallbackEnabled(network)) return null;

  const config = REPUTATION_FALLBACK_CONFIGS[network];
  const clients = getRpcUrls(network)
    .map((rpcUrl) => {
      const existing = publicClientsByRpcUrl.get(rpcUrl);
      if (existing) return existing;

      const client = createPublicClient({
        chain: config.chain,
        transport: http(rpcUrl),
      });
      publicClientsByRpcUrl.set(rpcUrl, client);
      return client;
    })
    .filter(Boolean);

  return clients.length > 0 ? clients : null;
}

function getSubgraphClient(network: AgentSubgraphNetwork) {
  const existing = subgraphClientsByNetwork.get(network);
  if (existing) return existing;

  const client = new GraphQLClient(getAgentSubgraphUrl(network));
  subgraphClientsByNetwork.set(network, client);
  return client;
}

function isLogRangeLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return (
    normalized.includes("eth_getlogs is limited") ||
    normalized.includes("maximum allowed number of requested blocks") ||
    normalized.includes("request exceeds defined limit") ||
    normalized.includes("log response size exceeded") ||
    normalized.includes("413")
  );
}

type GetLogsRequest = Omit<
  Parameters<ReturnType<typeof createPublicClient>["getLogs"]>[0],
  "fromBlock" | "toBlock"
>;

async function getLogsWithAdaptiveChunking(
  publicClient: ReturnType<typeof createPublicClient>,
  request: GetLogsRequest,
  fromBlock: bigint,
  toBlock: bigint
) {
  const logs: Awaited<ReturnType<typeof publicClient.getLogs>> = [];

  for (let cursor = fromBlock; cursor <= toBlock;) {
    let chunkSize = LOG_CHUNK_SIZE;
    let batch: Awaited<ReturnType<typeof publicClient.getLogs>> | null = null;

    while (batch === null) {
      const batchToBlock = cursor + chunkSize > toBlock ? toBlock : cursor + chunkSize;
      try {
        batch = await (publicClient.getLogs as (...args: unknown[]) => Promise<typeof logs> )({
          ...(request as object),
          fromBlock: cursor,
          toBlock: batchToBlock,
        });
        cursor = batchToBlock + 1n;
      } catch (error) {
        if (!isLogRangeLimitError(error) || chunkSize <= MIN_LOG_CHUNK_SIZE) {
          throw error;
        }
        chunkSize /= 2n;
        if (chunkSize < MIN_LOG_CHUNK_SIZE) chunkSize = MIN_LOG_CHUNK_SIZE;
      }
    }

    logs.push(...batch);
  }

  return logs;
}

async function getHeadBlock(network: AgentSubgraphNetwork): Promise<bigint | null> {
  const cache = getCache(headCacheByNetwork, network);
  const now = Date.now();
  if (cache.value !== null && cache.expiresAt > now) {
    return cache.value;
  }

  const clients = getPublicClients(network);
  if (!clients?.length) return null;

  for (const publicClient of clients) {
    try {
      const value = await publicClient.getBlockNumber();
      cache.value = value;
      cache.expiresAt = now + HEAD_CACHE_TTL_MS;
      return value;
    } catch {
      // Try the next configured RPC if this one is temporarily unavailable or rate limited.
    }
  }

  return null;
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

function shouldAttemptFullFeedbackSnapshot(network: AgentSubgraphNetwork, agent: AgentWithDetails): boolean {
  const enabled = parseBooleanFlag(process.env.FEATURE_REPUTATION_FULL_FEEDBACK_SNAPSHOT) ?? true;
  if (!enabled) return false;
  if (network !== "sepolia") return false;
  return agent.feedback.length === 0 || (Number.parseInt(agent.totalFeedback, 10) || 0) === 0;
}

function shouldHydrateFullFeedbackMetadata(): boolean {
  return parseBooleanFlag(process.env.FEATURE_REPUTATION_FULL_FEEDBACK_METADATA) ?? false;
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

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readStringish(value: unknown): string | null {
  if (typeof value === "string") return readOptionalString(value);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "bigint") return value.toString();
  return null;
}

function readOptionalStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createFeedbackTextPayload(text: string | null): FeedbackFilePayload | null {
  if (!text) return null;
  return {
    text,
    mcpTool: null,
    mcpPrompt: null,
    mcpResource: null,
    a2aSkills: [],
    a2aContextId: null,
    a2aTaskId: null,
  };
}

function readReputationOracleEvidenceText(value: Record<string, unknown>): string | null {
  if (readOptionalString(value.schema) !== "kleros-reputation-oracle/v1") return null;

  const agentId = readStringish(value.agentId);
  const tag1 = readOptionalString(value.tag1);
  if (!agentId || !tag1) return null;

  const kleros = isRecord(value.kleros) ? value.kleros : null;
  const pgtcrAddress = readOptionalString(kleros?.pgtcrAddress);
  const registrySuffix = pgtcrAddress ? ` (${pgtcrAddress})` : "";
  const stakeAmount = readStringish(kleros?.stakeAmount);
  const stakeToken = readOptionalString(kleros?.stakeToken);
  const stakeSuffix = stakeAmount && stakeToken ? ` with ${stakeAmount} ${stakeToken} staked` : "";

  if (tag1 === "verified") {
    return `Agent ${agentId} is actively collateralized in the Kleros Verified Agents Registry${registrySuffix}${stakeSuffix}. No active disputes.`;
  }

  if (tag1 === "removed") {
    const disputeId = readStringish(kleros?.disputeId);
    if (disputeId) {
      return `Agent ${agentId} was removed from the Kleros Verified Agents Registry${registrySuffix} after Kleros dispute #${disputeId}. Challenger prevailed.`;
    }
    return `Agent ${agentId} was removed from the Kleros Verified Agents Registry${registrySuffix}.`;
  }

  return null;
}

function readFeedbackText(value: unknown): string | null {
  if (!isRecord(value)) return readOptionalString(value);

  return (
    readOptionalString(value.text) ||
    readOptionalString(value.content) ||
    readOptionalString(value.message) ||
    readOptionalString(value.description) ||
    readOptionalString(value.comment) ||
    readOptionalString(value.review) ||
    readOptionalString(value.body) ||
    readOptionalString(value.feedback) ||
    readReputationOracleEvidenceText(value)
  );
}

function splitFeedbackUriReference(uri: string) {
  const trimmed = uri.trim();
  if (!trimmed) return { fetchUri: "", fragment: null as string | null };

  const hashIndex = trimmed.indexOf("#");
  if (hashIndex === -1) return { fetchUri: trimmed, fragment: null as string | null };

  const fetchUri = trimmed.slice(0, hashIndex);
  const rawFragment = trimmed.slice(hashIndex + 1).trim();
  let fragment = rawFragment || null;
  if (fragment) {
    try {
      fragment = decodeURIComponent(fragment);
    } catch {
      // Keep the raw fragment if decoding fails.
    }
  }

  return { fetchUri, fragment };
}

function getFeedbackUriFetchUrl(uri: string): string | null {
  const trimmed = uri.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("ipfs://")) return `${IPFS_GATEWAY_BASE_URL}${trimmed.slice("ipfs://".length)}`;
  if (trimmed.startsWith("/ipfs/")) return `https://cdn.kleros.link${trimmed}`;
  if (trimmed.startsWith("Qm") || trimmed.startsWith("baf")) return `${IPFS_GATEWAY_BASE_URL}${trimmed}`;

  return null;
}

function normalizeFeedbackFilePayload(payload: unknown): FeedbackFilePayload | null {
  if (typeof payload === "string") {
    return createFeedbackTextPayload(readOptionalString(payload));
  }

  if (!isRecord(payload)) return null;

  const mcp = isRecord(payload.mcp) ? payload.mcp : null;
  const a2a = isRecord(payload.a2a) ? payload.a2a : null;
  const text = readFeedbackText(payload);
  const mcpTool = readOptionalString(mcp?.tool) ?? readOptionalString(payload.mcpTool);
  const mcpPrompt = readOptionalString(mcp?.prompt) ?? readOptionalString(payload.mcpPrompt);
  const mcpResource = readOptionalString(mcp?.resource) ?? readOptionalString(payload.mcpResource);
  const a2aSkills = readOptionalStringArray(a2a?.skills ?? payload.a2aSkills);
  const a2aContextId = readOptionalString(a2a?.contextId) ?? readOptionalString(payload.a2aContextId);
  const a2aTaskId = readOptionalString(a2a?.taskId) ?? readOptionalString(payload.a2aTaskId);

  if (!text && !mcpTool && !mcpPrompt && !mcpResource && a2aSkills.length === 0 && !a2aContextId && !a2aTaskId) {
    return null;
  }

  return {
    text,
    mcpTool,
    mcpPrompt,
    mcpResource,
    a2aSkills,
    a2aContextId,
    a2aTaskId,
  };
}

function resolveFeedbackPayloadFromFragment(payload: unknown, fragment: string | null): unknown {
  const normalized = fragment?.trim();
  if (!normalized) return payload;

  const queue: unknown[] = [payload];
  const visited = new Set<unknown>();
  const identityFields = ["id", "key", "slug", "name", "ref", "anchor"];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    if (Array.isArray(current)) {
      for (const item of current) queue.push(item);
      continue;
    }

    if (!isRecord(current)) continue;

    if (Object.prototype.hasOwnProperty.call(current, normalized)) {
      return current[normalized];
    }

    for (const field of identityFields) {
      if (readOptionalString(current[field]) === normalized) {
        return current;
      }
    }

    for (const value of Object.values(current)) {
      if (Array.isArray(value) || isRecord(value)) queue.push(value);
    }
  }

  return payload;
}

function parseDataUriPayload(uri: string): unknown | null {
  const trimmed = uri.trim();
  if (!trimmed.startsWith("data:")) return null;

  const separatorIndex = trimmed.indexOf(",");
  if (separatorIndex === -1) return null;

  const metadata = trimmed.slice(5, separatorIndex).toLowerCase();
  const payload = trimmed.slice(separatorIndex + 1);
  const decoded = metadata.includes(";base64")
    ? Buffer.from(payload, "base64").toString("utf8")
    : decodeURIComponent(payload);

  if (metadata.includes("application/json") || metadata.includes("+json")) {
    return JSON.parse(decoded) as unknown;
  }

  try {
    return JSON.parse(decoded) as unknown;
  } catch {
    return decoded;
  }
}

async function fetchFeedbackFileFromUri(uri: string): Promise<FeedbackFilePayload | null> {
  const { fetchUri, fragment } = splitFeedbackUriReference(uri);

  try {
    const dataUriPayload = parseDataUriPayload(fetchUri);
    if (dataUriPayload !== null) {
      const resolvedPayload = resolveFeedbackPayloadFromFragment(dataUriPayload, fragment);
      return normalizeFeedbackFilePayload(resolvedPayload) ?? normalizeFeedbackFilePayload(dataUriPayload);
    }
  } catch {
    return null;
  }

  const url = getFeedbackUriFetchUrl(fetchUri);
  if (!url) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FEEDBACK_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json, text/plain;q=0.9, */*;q=0.1" },
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type")?.toLowerCase() || "";
    if (contentType.includes("text/html")) return null;

    const body = await response.text();
    if (!body.trim()) return null;

    if (contentType.includes("text/plain")) {
      return createFeedbackTextPayload(readOptionalString(body));
    }

    try {
      const payload = JSON.parse(body) as unknown;
      const resolvedPayload = resolveFeedbackPayloadFromFragment(payload, fragment);
      return normalizeFeedbackFilePayload(resolvedPayload) ?? normalizeFeedbackFilePayload(payload);
    } catch {
      return createFeedbackTextPayload(readOptionalString(body));
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function mergeFeedbackFiles(
  existing: Feedback["feedbackFile"],
  fallback: Feedback["feedbackFile"]
): Feedback["feedbackFile"] {
  if (!fallback) return existing;
  if (!existing) return fallback;

  const merged = {
    text: existing.text ?? fallback.text,
    mcpTool: existing.mcpTool ?? fallback.mcpTool,
    mcpPrompt: existing.mcpPrompt ?? fallback.mcpPrompt,
    mcpResource: existing.mcpResource ?? fallback.mcpResource,
    a2aSkills: existing.a2aSkills.length > 0 ? existing.a2aSkills : fallback.a2aSkills,
    a2aContextId: existing.a2aContextId ?? fallback.a2aContextId,
    a2aTaskId: existing.a2aTaskId ?? fallback.a2aTaskId,
  };

  if (
    !merged.text &&
    !merged.mcpTool &&
    !merged.mcpPrompt &&
    !merged.mcpResource &&
    merged.a2aSkills.length === 0 &&
    !merged.a2aContextId &&
    !merged.a2aTaskId
  ) {
    return null;
  }

  return merged;
}

async function hydrateFeedbackFiles(
  feedback: Feedback[],
  overlayUris: Map<string, string>
): Promise<Feedback[]> {
  const uriCache = new Map<string, Promise<Feedback["feedbackFile"]>>();

  return Promise.all(
    feedback.map(async (item) => {
      if (item.feedbackFile?.text) return item;

      const feedbackUri = item.feedbackURI?.trim() || overlayUris.get(item.id)?.trim() || "";
      if (!feedbackUri) return item;

      let request = uriCache.get(feedbackUri);
      if (!request) {
        request = fetchFeedbackFileFromUri(feedbackUri);
        uriCache.set(feedbackUri, request);
      }

      const feedbackFile = await request;
      if (!feedbackFile) return item;

      return {
        ...item,
        feedbackURI: item.feedbackURI || feedbackUri,
        feedbackFile: mergeFeedbackFiles(item.feedbackFile, feedbackFile),
      };
    })
  );
}

async function finalizeAgentFeedback(
  agent: AgentWithDetails,
  feedbackFirst: number,
  overlayUris: Map<string, string>
): Promise<AgentWithDetails> {
  const trimmed = trimFeedback(agent, feedbackFirst);
  const hydratedFeedback = await hydrateFeedbackFiles(trimmed.feedback, overlayUris);
  return {
    ...trimmed,
    feedback: hydratedFeedback,
  };
}

async function collectNewFeedbackLogMetadata(
  publicClient: ReturnType<typeof createPublicClient>,
  network: AgentSubgraphNetwork,
  numericAgentId: bigint,
  fromBlock: bigint,
  toBlock: bigint,
  getBlockTimestamp: (blockNumber: bigint) => Promise<number>,
  targetFeedbackIds?: Set<string>
): Promise<FeedbackLogMetadata> {
  const config = REPUTATION_FALLBACK_CONFIGS[network];
  const createdAts = new Map<string, string>();
  const txHashes = new Map<string, string>();
  const feedbackUris = new Map<string, string>();
  const endpoints = new Map<string, string>();
  let newestActivityAt = 0;

  const logs = await getLogsWithAdaptiveChunking(
    publicClient,
    {
      address: config.reputationRegistryAddress,
      event: LOG_NEW_FEEDBACK,
      args: { agentId: numericAgentId },
    },
    fromBlock,
    toBlock
  );

  for (const log of logs) {
    const {
      agentId: eventAgentId,
      clientAddress,
      feedbackIndex,
      endpoint,
      feedbackURI,
    } = (log as typeof log & { args: NewFeedbackLogArgs }).args;
    if (eventAgentId === undefined || clientAddress === undefined || feedbackIndex === undefined) {
      continue;
    }

    const feedbackId = buildFeedbackId(network, eventAgentId, clientAddress, feedbackIndex);
    if (targetFeedbackIds && !targetFeedbackIds.has(feedbackId)) continue;

    if (log.transactionHash) txHashes.set(feedbackId, log.transactionHash);
    if (endpoint) endpoints.set(feedbackId, endpoint);
    if (feedbackURI) feedbackUris.set(feedbackId, feedbackURI);
    if (log.blockNumber === null) continue;

    const createdAt = await getBlockTimestamp(log.blockNumber);
    createdAts.set(feedbackId, createdAt.toString());
    if (createdAt > newestActivityAt) newestActivityAt = createdAt;
  }

  return {
    newestActivityAt: newestActivityAt > 0 ? newestActivityAt : null,
    createdAts,
    txHashes,
    feedbackUris,
    endpoints,
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
  const feedbackUris = new Map<string, string>();
  const endpoints = new Map<string, string>();
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
        getLogsWithAdaptiveChunking(
          publicClient,
          {
            address: config.reputationRegistryAddress,
            event: LOG_NEW_FEEDBACK,
            args: { agentId: numericAgentId },
          },
          cursor,
          toBlock
        ),
        getLogsWithAdaptiveChunking(
          publicClient,
          {
            address: config.reputationRegistryAddress,
            event: LOG_FEEDBACK_REVOKED,
            args: { agentId: numericAgentId },
          },
          cursor,
          toBlock
        ),
      ]);

      for (const log of newFeedbackLogs) {
        const args = (log as typeof log & { args: NewFeedbackLogArgs }).args;
        const {
          agentId: eventAgentId,
          clientAddress,
          feedbackIndex,
          value,
          valueDecimals,
          tag1,
          tag2,
          endpoint,
          feedbackURI,
        } = args;
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
        if (endpoint) endpoints.set(feedbackId, endpoint);
        if (feedbackURI) feedbackUris.set(feedbackId, feedbackURI);
        if (log.blockNumber === null) continue;

        const createdAt = await getBlockTimestamp(log.blockNumber);
        if (createdAt > newestActivityAt) newestActivityAt = createdAt;

        activeWindowFeedback.set(feedbackId, {
          id: feedbackId,
          value: formatFeedbackValue(value, Number(valueDecimals)),
          tag1: tag1 || null,
          tag2: tag2 || null,
          endpoint: endpoint || null,
          clientAddress: clientAddress.toLowerCase(),
          createdAt: createdAt.toString(),
          feedbackURI: feedbackURI || null,
          txHash: log.transactionHash || null,
          feedbackFile: null,
        });
      }

      for (const log of revokedLogs) {
        const { agentId: eventAgentId, clientAddress, feedbackIndex } = (log as typeof log & {
          args: FeedbackRevokedLogArgs;
        }).args;
        if (eventAgentId === undefined || clientAddress === undefined || feedbackIndex === undefined) {
          continue;
        }

        const feedbackId = buildFeedbackId(network, eventAgentId, clientAddress, feedbackIndex);
        revokedIds.add(feedbackId);
        activeWindowFeedback.delete(feedbackId);
        if (log.blockNumber === null) continue;

        const revokedAt = await getBlockTimestamp(log.blockNumber);
        if (revokedAt > newestActivityAt) newestActivityAt = revokedAt;
      }
    }
  }

  const unresolvedTxIds = new Set(Array.from(targetFeedbackIds).filter((id) => !txHashes.has(id)));
  let searchToBlock = indexedBlock !== null && indexedBlock < headBlock ? indexedBlock : headBlock;
  const minBackfillBlock =
    searchToBlock > config.reputationStartBlock + TX_BACKFILL_MAX_BLOCKS
      ? searchToBlock - TX_BACKFILL_MAX_BLOCKS
      : config.reputationStartBlock;

  try {
    while (unresolvedTxIds.size > 0 && searchToBlock >= minBackfillBlock) {
      const candidateStart = searchToBlock > LOG_CHUNK_SIZE ? searchToBlock - LOG_CHUNK_SIZE : 0n;
      const fromBlock = candidateStart < minBackfillBlock ? minBackfillBlock : candidateStart;

      const logs = await getLogsWithAdaptiveChunking(
        publicClient,
        {
          address: config.reputationRegistryAddress,
          event: LOG_NEW_FEEDBACK,
          args: { agentId: numericAgentId },
        },
        fromBlock,
        searchToBlock
      );

      for (let index = logs.length - 1; index >= 0; index -= 1) {
        const log = logs[index];
        const { agentId: eventAgentId, clientAddress, feedbackIndex, endpoint, feedbackURI } = (log as typeof log & {
          args: NewFeedbackLogArgs;
        }).args;
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
        if (endpoint) endpoints.set(feedbackId, endpoint);
        if (feedbackURI) feedbackUris.set(feedbackId, feedbackURI);
        unresolvedTxIds.delete(feedbackId);
        if (unresolvedTxIds.size === 0) break;
      }

      if (fromBlock === minBackfillBlock) break;
      searchToBlock = fromBlock - 1n;
    }
  } catch {
    // Older transaction hashes are optional metadata; keep the feedback payload even if backfill fails.
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
    feedbackUris,
    endpoints,
  };
}

async function fetchFullFeedbackSnapshot(
  network: AgentSubgraphNetwork,
  agent: AgentWithDetails
): Promise<FullFeedbackSnapshot | null> {
  const cacheKey = `${network}:${agent.agentId}`;
  const cached = fullFeedbackCacheByKey.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  if (!isReputationFallbackEnabled(network) || network !== "sepolia") {
    fullFeedbackCacheByKey.set(cacheKey, { expiresAt: now + FULL_FEEDBACK_CACHE_TTL_MS, value: null });
    return null;
  }

  const numericAgentId = parseNumericAgentId(agent.agentId);
  if (numericAgentId === null) {
    fullFeedbackCacheByKey.set(cacheKey, { expiresAt: now + FULL_FEEDBACK_CACHE_TTL_MS, value: null });
    return null;
  }

  const clients = getPublicClients(network);
  if (!clients?.length) {
    fullFeedbackCacheByKey.set(cacheKey, { expiresAt: now + FULL_FEEDBACK_CACHE_TTL_MS, value: null });
    return null;
  }

  const config = REPUTATION_FALLBACK_CONFIGS[network];
  const createdAtTarget = BigInt(Math.max(0, Number.parseInt(agent.createdAt || "0", 10) || 0));
  let lastSnapshotError: unknown = null;

  for (const publicClient of clients) {
    try {
      const readAllFeedbackResult = await publicClient.readContract({
        address: config.reputationRegistryAddress,
        abi: REPUTATION_READ_ABI,
        functionName: "readAllFeedback",
        args: [numericAgentId, [], "", "", false],
      });

      const [clientsList, feedbackIndexes, values, valueDecimals, tag1s, tag2s] = readAllFeedbackResult;
      const headBlock = await publicClient.getBlockNumber();
      const blockTimestampCache = new Map<bigint, number>();
      async function getBlockTimestamp(blockNumber: bigint): Promise<number> {
        const existing = blockTimestampCache.get(blockNumber);
        if (existing !== undefined) return existing;
        const block = await publicClient.getBlock({ blockNumber });
        const value = Number(block.timestamp);
        blockTimestampCache.set(blockNumber, value);
        return value;
      }

      let snapshotStartBlock = config.reputationStartBlock;
      if (createdAtTarget > 0n && headBlock > config.reputationStartBlock) {
        const startTimestamp = BigInt(await getBlockTimestamp(config.reputationStartBlock));
        const headTimestamp = BigInt(await getBlockTimestamp(headBlock));
        if (createdAtTarget > startTimestamp && createdAtTarget < headTimestamp) {
          let low = config.reputationStartBlock;
          let high = headBlock;

          while (low < high) {
            const mid = low + (high - low) / 2n;
            const midTimestamp = BigInt(await getBlockTimestamp(mid));
            if (midTimestamp < createdAtTarget) low = mid + 1n;
            else high = mid;
          }

          snapshotStartBlock =
            low > FULL_FEEDBACK_LOOKBACK_BLOCKS
              ? low - FULL_FEEDBACK_LOOKBACK_BLOCKS
              : config.reputationStartBlock;
          if (snapshotStartBlock < config.reputationStartBlock) {
            snapshotStartBlock = config.reputationStartBlock;
          }
        }
      }

      if (clientsList.length > 0) {
        const fallbackTimestamp = String(
          Math.max(
            Number.parseInt(agent.lastActivity, 10) || 0,
            Number.parseInt(agent.createdAt, 10) || 0
          )
        );
        const baseFeedback = clientsList.map((clientAddress, index) => {
          const feedbackIndex = BigInt(feedbackIndexes[index] ?? 0);
          const rawValue = BigInt(values[index] ?? 0);
          const decimals = Number(valueDecimals[index] ?? 0);
          return {
            id: buildFeedbackId(network, numericAgentId, clientAddress, feedbackIndex),
            value: formatFeedbackValue(rawValue, decimals),
            tag1: tag1s[index] || null,
            tag2: tag2s[index] || null,
            endpoint: null,
            clientAddress: clientAddress.toLowerCase(),
            createdAt: fallbackTimestamp,
            feedbackURI: null,
            txHash: null,
            feedbackFile: null,
          } satisfies Feedback;
        });

        const targetFeedbackIds = new Set(baseFeedback.map((item) => item.id));
        if (!shouldHydrateFullFeedbackMetadata()) {
          const snapshot: FullFeedbackSnapshot = {
            feedback: baseFeedback.sort(compareFeedbackDesc),
            totalFeedback: clientsList.length,
            newestActivityAt: Number.parseInt(fallbackTimestamp, 10) || null,
            txHashes: new Map<string, string>(),
            feedbackUris: new Map<string, string>(),
            endpoints: new Map<string, string>(),
          };
          fullFeedbackCacheByKey.set(cacheKey, {
            expiresAt: now + FULL_FEEDBACK_CACHE_TTL_MS,
            value: snapshot,
          });
          return snapshot;
        }

        let metadata: FeedbackLogMetadata = {
          newestActivityAt: null,
          createdAts: new Map<string, string>(),
          txHashes: new Map<string, string>(),
          feedbackUris: new Map<string, string>(),
          endpoints: new Map<string, string>(),
        };

        try {
          metadata = await collectNewFeedbackLogMetadata(
            publicClient,
            network,
            numericAgentId,
            snapshotStartBlock,
            headBlock,
            getBlockTimestamp,
            targetFeedbackIds
          );
        } catch {
          // Numeric feedback remains usable even when an RPC provider cannot serve the older event range.
        }

        const feedback = baseFeedback
          .map((item) => ({
            ...item,
            endpoint: metadata.endpoints.get(item.id) || item.endpoint || null,
            createdAt: metadata.createdAts.get(item.id) || item.createdAt,
            feedbackURI: metadata.feedbackUris.get(item.id) || item.feedbackURI || null,
            txHash: metadata.txHashes.get(item.id) || item.txHash || null,
          }))
          .sort(compareFeedbackDesc);

        const snapshot: FullFeedbackSnapshot = {
          feedback,
          totalFeedback: clientsList.length,
          newestActivityAt: metadata.newestActivityAt || Number.parseInt(fallbackTimestamp, 10) || null,
          txHashes: metadata.txHashes,
          feedbackUris: metadata.feedbackUris,
          endpoints: metadata.endpoints,
        };
        fullFeedbackCacheByKey.set(cacheKey, {
          expiresAt: now + FULL_FEEDBACK_CACHE_TTL_MS,
          value: snapshot,
        });
        return snapshot;
      }

      const newFeedbackLogs = await getLogsWithAdaptiveChunking(
        publicClient,
        {
          address: config.reputationRegistryAddress,
          event: LOG_NEW_FEEDBACK,
          args: { agentId: numericAgentId },
        },
        snapshotStartBlock,
        headBlock
      );
      const revokedLogs =
        newFeedbackLogs.length > 0
          ? await getLogsWithAdaptiveChunking(
              publicClient,
              {
                address: config.reputationRegistryAddress,
                event: LOG_FEEDBACK_REVOKED,
                args: { agentId: numericAgentId },
              },
              snapshotStartBlock,
              headBlock
            )
          : [];

      const events = [
        ...newFeedbackLogs.map((log) => ({ kind: "new" as const, log })),
        ...revokedLogs.map((log) => ({ kind: "revoked" as const, log })),
      ].sort((left, right) => {
        const leftBlock = left.log.blockNumber ?? 0n;
        const rightBlock = right.log.blockNumber ?? 0n;
        if (leftBlock !== rightBlock) return leftBlock < rightBlock ? -1 : 1;
        const leftIndex = left.log.logIndex ?? 0;
        const rightIndex = right.log.logIndex ?? 0;
        return leftIndex - rightIndex;
      });

      const activeFeedback = new Map<string, Feedback>();
      const txHashes = new Map<string, string>();
      const feedbackUris = new Map<string, string>();
      const endpoints = new Map<string, string>();
      let newestActivityAt = 0;

      for (const event of events) {
        if (event.kind === "new") {
          const log = event.log;
          const {
            agentId: eventAgentId,
            clientAddress,
            feedbackIndex,
            value,
            valueDecimals,
            tag1,
            tag2,
            endpoint,
            feedbackURI,
          } = (log as typeof log & { args: NewFeedbackLogArgs }).args;

          if (
            eventAgentId === undefined ||
            clientAddress === undefined ||
            feedbackIndex === undefined ||
            value === undefined ||
            valueDecimals === undefined ||
            log.blockNumber === null
          ) {
            continue;
          }

          const feedbackId = buildFeedbackId(network, eventAgentId, clientAddress, feedbackIndex);
          const createdAt = await getBlockTimestamp(log.blockNumber);
          if (createdAt > newestActivityAt) newestActivityAt = createdAt;
          if (log.transactionHash) txHashes.set(feedbackId, log.transactionHash);
          if (endpoint) endpoints.set(feedbackId, endpoint);
          if (feedbackURI) feedbackUris.set(feedbackId, feedbackURI);

          activeFeedback.set(feedbackId, {
            id: feedbackId,
            value: formatFeedbackValue(value, Number(valueDecimals)),
            tag1: tag1 || null,
            tag2: tag2 || null,
            endpoint: endpoint || null,
            clientAddress: clientAddress.toLowerCase(),
            createdAt: createdAt.toString(),
            feedbackURI: feedbackURI || null,
            txHash: log.transactionHash || null,
            feedbackFile: null,
          });
          continue;
        }

        const log = event.log;
        const { agentId: eventAgentId, clientAddress, feedbackIndex } = (log as typeof log & {
          args: FeedbackRevokedLogArgs;
        }).args;
        if (
          eventAgentId === undefined ||
          clientAddress === undefined ||
          feedbackIndex === undefined ||
          log.blockNumber === null
        ) {
          continue;
        }

        const feedbackId = buildFeedbackId(network, eventAgentId, clientAddress, feedbackIndex);
        activeFeedback.delete(feedbackId);
        const revokedAt = await getBlockTimestamp(log.blockNumber);
        if (revokedAt > newestActivityAt) newestActivityAt = revokedAt;
      }

      const snapshot: FullFeedbackSnapshot = {
        feedback: Array.from(activeFeedback.values()).sort(compareFeedbackDesc),
        totalFeedback: activeFeedback.size,
        newestActivityAt: newestActivityAt > 0 ? newestActivityAt : null,
        txHashes,
        feedbackUris,
        endpoints,
      };
      fullFeedbackCacheByKey.set(cacheKey, {
        expiresAt: now + FULL_FEEDBACK_CACHE_TTL_MS,
        value: snapshot,
      });
      return snapshot;
    } catch (error) {
      lastSnapshotError = error;
      // Move to the next configured RPC when a provider is rate limited or constrains log windows.
    }
  }

  if (lastSnapshotError) {
    console.error("[Reputation full snapshot] Failed for", network, agent.agentId, lastSnapshotError);
  }
  fullFeedbackCacheByKey.set(cacheKey, { expiresAt: now + FULL_FEEDBACK_CACHE_TTL_MS, value: null });
  return null;
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
  let mergedAgent: AgentWithDetails = trimFeedback(agent, feedbackFirst);
  let overlayUris = new Map<string, string>();
  const wantsFullSnapshot = shouldAttemptFullFeedbackSnapshot(network, agent);

  async function buildFromFullSnapshot() {
    const snapshot = await fetchFullFeedbackSnapshot(network, agent);
    if (!snapshot) return null;
    const lastActivityBase = Number.parseInt(agent.lastActivity, 10) || 0;
    overlayUris = snapshot.feedbackUris;
    return {
      ...agent,
      totalFeedback: String(snapshot.totalFeedback),
      lastActivity: String(Math.max(lastActivityBase, snapshot.newestActivityAt || 0) || lastActivityBase),
      feedback: snapshot.feedback.map((item) => ({
        ...item,
        endpoint: snapshot.endpoints.get(item.id) || item.endpoint || null,
        feedbackURI: snapshot.feedbackUris.get(item.id) || item.feedbackURI || null,
        txHash: snapshot.txHashes.get(item.id) || item.txHash || null,
      })),
    } satisfies AgentWithDetails;
  }

  try {
    if (wantsFullSnapshot) {
      const fullSnapshotAgent = await buildFromFullSnapshot();
      if (fullSnapshotAgent) {
        return finalizeAgentFeedback(fullSnapshotAgent, feedbackFirst, overlayUris);
      }
    }

    const targetFeedbackIds = new Set(agent.feedback.map((item) => item.id));
    const overlay = await fetchFeedbackOverlay(network, agent.agentId, targetFeedbackIds);
    if (!overlay) {
      return finalizeAgentFeedback(mergedAgent, feedbackFirst, overlayUris);
    }

    const merged = new Map<string, Feedback>();
    for (const item of agent.feedback) {
      const txHash = overlay.txHashes.get(item.id);
      const endpoint = overlay.endpoints.get(item.id);
      const feedbackURI = overlay.feedbackUris.get(item.id);
      merged.set(
        item.id,
        txHash || feedbackURI || endpoint
          ? {
              ...item,
              endpoint: endpoint || item.endpoint || null,
              txHash: txHash || item.txHash || null,
              feedbackURI: feedbackURI || item.feedbackURI || null,
            }
          : item
      );
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
              endpoint: item.endpoint || existing.endpoint || null,
              feedbackURI: item.feedbackURI || existing.feedbackURI || null,
              txHash: item.txHash || existing.txHash || null,
              feedbackFile: mergeFeedbackFiles(existing.feedbackFile, item.feedbackFile),
            }
          : item
      );
    }

    overlayUris = overlay.feedbackUris;
    const mergedFeedback = Array.from(merged.values()).sort(compareFeedbackDesc);
    const totalFeedbackBase = Number.parseInt(agent.totalFeedback, 10) || 0;
    const lastActivityBase = Number.parseInt(agent.lastActivity, 10) || 0;
    const lastActivity = Math.max(lastActivityBase, overlay.newestActivityAt || 0);

    mergedAgent = {
      ...agent,
      totalFeedback: String(Math.max(0, totalFeedbackBase + overlay.totalDelta)),
      lastActivity: String(lastActivity || lastActivityBase),
      feedback: mergedFeedback,
    };
  } catch {
    if (wantsFullSnapshot) {
      try {
        const fullSnapshotAgent = await buildFromFullSnapshot();
        if (fullSnapshotAgent) {
          return finalizeAgentFeedback(fullSnapshotAgent, feedbackFirst, overlayUris);
        }
      } catch {
        // fall back to the original agent payload below
      }
    }
    mergedAgent = trimFeedback(agent, feedbackFirst);
  }

  try {
    return await finalizeAgentFeedback(mergedAgent, feedbackFirst, overlayUris);
  } catch {
    return trimFeedback(mergedAgent, feedbackFirst);
  }
}
