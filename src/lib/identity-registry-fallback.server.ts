import "server-only";

import { createPublicClient, http, parseAbi, parseAbiItem } from "viem";
import { sepolia } from "viem/chains";

import { AGENT_NETWORK_CHAIN_IDS } from "@/lib/agent-networks";
import { loadCurateRegistrationFile } from "@/lib/curate-agent-fallback";
import type { OrderBy, OrderDirection } from "@/lib/subgraph.handler";
import type { AgentRegistrationFile, AgentWithDetails } from "@/types/agent";

const SEPOLIA_REGISTRY_START_BLOCK = 9_989_509n;
const LOG_BLOCK_RANGE = 50_000n;
const INDEX_CACHE_TTL_MS = 5 * 60_000;
const LOG_REQUEST_CONCURRENCY = 4;
const SEARCH_SCAN_LIMIT = 300;

const REGISTERED_EVENT = parseAbiItem(
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)"
);

const IDENTITY_REGISTRY_ABI = parseAbi([
  "function ownerOf(uint256 agentId) view returns (address)",
  "function tokenURI(uint256 agentId) view returns (string)",
]);

type SepoliaRegistryStub = {
  agentId: string;
  owner: string;
  agentURI: string | null;
  blockNumber: bigint;
};

let registeredIndexCache:
  | {
      expiresAt: number;
      items: SepoliaRegistryStub[];
    }
  | null = null;

const registrationFileCache = new Map<string, Promise<AgentRegistrationFile | null>>();
const blockTimestampCache = new Map<string, Promise<number>>();

function getSepoliaRpcUrl() {
  return process.env.SEPOLIA_RPC_URL?.trim() || process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL?.trim() || null;
}

function getSepoliaRegistryAddress(): `0x${string}` | null {
  const value = process.env.NEXT_PUBLIC_AGENT_REGISTRY_SEPOLIA_ADDRESS?.trim();
  return value ? (value as `0x${string}`) : null;
}

function getSepoliaClient() {
  const rpcUrl = getSepoliaRpcUrl();
  if (!rpcUrl) return null;
  return createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });
}

function normalizeOptionalString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function compareBigInt(
  a: bigint,
  b: bigint,
  orderDirection: OrderDirection
) {
  if (a === b) return 0;
  if (orderDirection === "asc") return a < b ? -1 : 1;
  return a > b ? -1 : 1;
}

function compareStubs(
  a: SepoliaRegistryStub,
  b: SepoliaRegistryStub,
  orderBy: OrderBy,
  orderDirection: OrderDirection
) {
  const primary =
    orderBy === "createdAt" || orderBy === "updatedAt" || orderBy === "lastActivity" || orderBy === "totalFeedback"
      ? compareBigInt(a.blockNumber, b.blockNumber, orderDirection)
      : compareBigInt(a.blockNumber, b.blockNumber, orderDirection);
  if (primary !== 0) return primary;
  return orderDirection === "asc" ? a.agentId.localeCompare(b.agentId) : b.agentId.localeCompare(a.agentId);
}

function buildBlockRanges(head: bigint) {
  const ranges: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  for (
    let fromBlock = SEPOLIA_REGISTRY_START_BLOCK;
    fromBlock <= head;
    fromBlock += LOG_BLOCK_RANGE + 1n
  ) {
    ranges.push({
      fromBlock,
      toBlock: fromBlock + LOG_BLOCK_RANGE > head ? head : fromBlock + LOG_BLOCK_RANGE,
    });
  }
  return ranges;
}

async function getCachedRegistrationFile(uri: string | null | undefined) {
  const trimmed = normalizeOptionalString(uri);
  if (!trimmed) return null;

  const existing = registrationFileCache.get(trimmed);
  if (existing) return existing;

  const request = loadCurateRegistrationFile(trimmed);
  registrationFileCache.set(trimmed, request);
  return request;
}

async function getBlockTimestamp(
  client: ReturnType<typeof createPublicClient>,
  blockNumber: bigint
) {
  const key = String(blockNumber);
  const existing = blockTimestampCache.get(key);
  if (existing) return existing;

  const request = client.getBlock({ blockNumber }).then((block) => Number(block.timestamp));
  blockTimestampCache.set(key, request);
  return request;
}

async function fetchRegisteredIndex() {
  const client = getSepoliaClient();
  const registryAddress = getSepoliaRegistryAddress();
  if (!client || !registryAddress) return [] as SepoliaRegistryStub[];

  const head = await client.getBlockNumber();
  const ranges = buildBlockRanges(head);
  const logs: Awaited<ReturnType<typeof client.getLogs<typeof REGISTERED_EVENT>>> = [];

  for (let index = 0; index < ranges.length; index += LOG_REQUEST_CONCURRENCY) {
    const batch = await Promise.all(
      ranges.slice(index, index + LOG_REQUEST_CONCURRENCY).map(({ fromBlock, toBlock }) =>
        client.getLogs({
          address: registryAddress,
          event: REGISTERED_EVENT,
          fromBlock,
          toBlock,
        })
      )
    );
    for (const group of batch) logs.push(...group);
  }

  return logs
    .map((log) => ({
      agentId: String(log.args.agentId),
      owner: String(log.args.owner),
      agentURI: normalizeOptionalString(log.args.agentURI),
      blockNumber: log.blockNumber,
    }))
    .sort((a, b) => compareBigInt(b.blockNumber, a.blockNumber, "asc"));
}

async function getRegisteredIndex() {
  const now = Date.now();
  if (registeredIndexCache && registeredIndexCache.expiresAt > now) {
    return registeredIndexCache.items;
  }

  const items = await fetchRegisteredIndex();
  registeredIndexCache = {
    expiresAt: now + INDEX_CACHE_TTL_MS,
    items,
  };
  return items;
}

function isStructuredQuery(query: string) {
  return (
    /^\d+$/.test(query) ||
    query.startsWith("0x") ||
    query.startsWith("eip155:") ||
    query.includes("://") ||
    query.includes("/ipfs/")
  );
}

function matchesStubQuery(stub: SepoliaRegistryStub, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    stub.agentId.toLowerCase().includes(needle) ||
    stub.owner.toLowerCase().includes(needle) ||
    (stub.agentURI || "").toLowerCase().includes(needle)
  );
}

function matchesAgentQuery(agent: AgentWithDetails, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    agent.id.toLowerCase().includes(needle) ||
    agent.agentId.toLowerCase().includes(needle) ||
    agent.owner.toLowerCase().includes(needle) ||
    (agent.agentURI || "").toLowerCase().includes(needle) ||
    (agent.registrationFile?.name || "").toLowerCase().includes(needle) ||
    (agent.registrationFile?.description || "").toLowerCase().includes(needle)
  );
}

function matchesProtocol(agent: AgentWithDetails, protocol?: string) {
  if (!protocol || protocol === "all") return true;
  if (protocol === "mcp") return Boolean(agent.registrationFile?.mcpEndpoint);
  if (protocol === "a2a") return Boolean(agent.registrationFile?.a2aEndpoint);
  return true;
}

async function hydrateAgentSlice(stubs: SepoliaRegistryStub[]) {
  if (!stubs.length) return [] as AgentWithDetails[];

  const client = getSepoliaClient();
  const registryAddress = getSepoliaRegistryAddress();
  if (!client || !registryAddress) return [] as AgentWithDetails[];

  const multicallResults = await client.multicall({
    allowFailure: true,
    contracts: stubs.flatMap((stub) => [
      {
        address: registryAddress,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "ownerOf",
        args: [BigInt(stub.agentId)],
      },
      {
        address: registryAddress,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "tokenURI",
        args: [BigInt(stub.agentId)],
      },
    ]),
  });

  const timestamps = await Promise.all(
    stubs.map((stub) => getBlockTimestamp(client, stub.blockNumber))
  );

  return Promise.all(
    stubs.map(async (stub, index) => {
      const ownerResult = multicallResults[index * 2];
      const uriResult = multicallResults[index * 2 + 1];

      const owner =
        ownerResult?.status === "success" && ownerResult.result
          ? ownerResult.result
          : stub.owner;
      const agentURI =
        uriResult?.status === "success" && typeof uriResult.result === "string"
          ? normalizeOptionalString(uriResult.result) || stub.agentURI
          : stub.agentURI;
      const registrationFile = await getCachedRegistrationFile(agentURI);
      const timestamp = timestamps[index] || 0;

      return {
        id: stub.agentId,
        agentId: stub.agentId,
        chainId: String(AGENT_NETWORK_CHAIN_IDS.sepolia),
        owner,
        operators: [],
        agentURI,
        createdAt: String(timestamp),
        updatedAt: String(timestamp),
        totalFeedback: "0",
        lastActivity: String(timestamp),
        registrationFile,
        feedback: [],
        stats: null,
      } satisfies AgentWithDetails;
    })
  );
}

async function collectMatchingAgents(params: {
  query?: string;
  protocol?: string;
  first: number;
  skip: number;
  orderBy: OrderBy;
  orderDirection: OrderDirection;
}) {
  const { query, protocol, first, skip, orderBy, orderDirection } = params;
  const normalizedQuery = query?.trim().toLowerCase() || "";
  const structuredQuery = normalizedQuery ? isStructuredQuery(normalizedQuery) : false;

  const sorted = [...(await getRegisteredIndex())].sort((a, b) =>
    compareStubs(a, b, orderBy, orderDirection)
  );

  if (!normalizedQuery && (!protocol || protocol === "all")) {
    return hydrateAgentSlice(sorted.slice(skip, skip + first));
  }

  const candidates = structuredQuery
    ? sorted.filter((stub) => matchesStubQuery(stub, normalizedQuery))
    : sorted.slice(0, SEARCH_SCAN_LIMIT);

  const matches: AgentWithDetails[] = [];
  const batchSize = Math.max(first * 3, 24);

  for (let cursor = 0; cursor < candidates.length && matches.length < skip + first; cursor += batchSize) {
    const hydrated = await hydrateAgentSlice(candidates.slice(cursor, cursor + batchSize));
    for (const agent of hydrated) {
      if (!matchesProtocol(agent, protocol)) continue;
      if (!matchesAgentQuery(agent, normalizedQuery)) continue;
      matches.push(agent);
      if (matches.length >= skip + first) break;
    }
  }

  return matches.slice(skip, skip + first);
}

export async function listSepoliaIdentityRegistryFallbackAgents(params: {
  first?: number;
  skip?: number;
  orderBy?: OrderBy;
  orderDirection?: OrderDirection;
  protocol?: string;
}) {
  return collectMatchingAgents({
    first: params.first ?? 20,
    skip: params.skip ?? 0,
    orderBy: params.orderBy ?? "createdAt",
    orderDirection: params.orderDirection ?? "desc",
    protocol: params.protocol,
  });
}

export async function searchSepoliaIdentityRegistryFallbackAgents(params: {
  query: string;
  first?: number;
  skip?: number;
  orderBy?: OrderBy;
  orderDirection?: OrderDirection;
  protocol?: string;
}) {
  return collectMatchingAgents({
    query: params.query,
    first: params.first ?? 24,
    skip: params.skip ?? 0,
    orderBy: params.orderBy ?? "createdAt",
    orderDirection: params.orderDirection ?? "desc",
    protocol: params.protocol,
  });
}

export async function getSepoliaIdentityRegistryFallbackAgentByAgentId(agentIdLike: string) {
  const agentId = agentIdLike.trim();
  if (!/^\d+$/.test(agentId)) return null;

  const stub = (await getRegisteredIndex()).find((item) => item.agentId === agentId);
  if (!stub) return null;

  const [agent] = await hydrateAgentSlice([stub]);
  return agent || null;
}
