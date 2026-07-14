import "server-only";

import { createPublicClient, http, parseAbi } from "viem";
import { sepolia } from "viem/chains";

import { AGENT_NETWORK_CHAIN_IDS } from "@/lib/agent-networks";
import { loadCurateRegistrationFile } from "@/lib/curate-agent-fallback";
import { refreshAgentFeedbackFromChain } from "@/lib/reputation-feedback.server";
import type { OrderBy, OrderDirection } from "@/lib/subgraph.handler";
import type { AgentWithDetails } from "@/types/agent";

const IDENTITY_REGISTRY_STORAGE_SLOT =
  "0xa040f782729de4970518741823ec1276cbcd41a0c7493f62d173341566a04e00" as const;
const INDEX_CACHE_TTL_MS = 5 * 60_000;
const OWNER_INDEX_CACHE_TTL_MS = 5 * 60_000;
const REGISTRATION_FETCH_TIMEOUT_MS = 4_000;
const SEARCH_SCAN_LIMIT = 300;
const OWNER_BATCH_SIZE = 400;
const OWNER_BATCH_CONCURRENCY = 4;

const IDENTITY_REGISTRY_ABI = parseAbi([
  "function ownerOf(uint256 agentId) view returns (address)",
  "function tokenURI(uint256 agentId) view returns (string)",
]);

type SepoliaRegistryStub = {
  agentId: string;
  sequence: bigint;
};

let registeredIndexCache:
  | {
      expiresAt: number;
      items: SepoliaRegistryStub[];
    }
  | null = null;
let registeredIndexPromise: Promise<SepoliaRegistryStub[]> | null = null;

let ownerIndexCache:
  | {
      expiresAt: number;
      items: Map<string, SepoliaRegistryStub[]>;
    }
  | null = null;
let ownerIndexPromise: Promise<Map<string, SepoliaRegistryStub[]>> | null = null;

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
    transport: http(rpcUrl, { retryCount: 1, timeout: 5_000 }),
  });
}

function normalizeOptionalString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function compareBigInt(a: bigint, b: bigint, orderDirection: OrderDirection) {
  if (a === b) return 0;
  if (orderDirection === "asc") return a < b ? -1 : 1;
  return a > b ? -1 : 1;
}

function compareStubs(
  a: SepoliaRegistryStub,
  b: SepoliaRegistryStub,
  _orderBy: OrderBy,
  orderDirection: OrderDirection
) {
  const primary = compareBigInt(a.sequence, b.sequence, orderDirection);
  if (primary !== 0) return primary;
  return orderDirection === "asc" ? a.agentId.localeCompare(b.agentId) : b.agentId.localeCompare(a.agentId);
}

async function getCachedRegistrationFile(uri: string | null | undefined) {
  const trimmed = normalizeOptionalString(uri);
  if (!trimmed) return null;
  return loadCurateRegistrationFile(trimmed, REGISTRATION_FETCH_TIMEOUT_MS);
}

async function registryAgentExists(
  client: ReturnType<typeof createPublicClient>,
  registryAddress: `0x${string}`,
  agentId: bigint
) {
  try {
    await client.readContract({
      address: registryAddress,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "ownerOf",
      args: [agentId],
    });
    return true;
  } catch {
    return false;
  }
}

async function findRegistryCountByBinarySearch(
  client: ReturnType<typeof createPublicClient>,
  registryAddress: `0x${string}`
) {
  if (!(await registryAgentExists(client, registryAddress, 0n))) return 0;

  let upper = 1n;
  while (await registryAgentExists(client, registryAddress, upper)) {
    upper *= 2n;
  }

  let lower = upper / 2n;
  while (lower < upper) {
    const middle = (lower + upper) / 2n;
    if (await registryAgentExists(client, registryAddress, middle)) lower = middle + 1n;
    else upper = middle;
  }
  return Number(lower);
}

async function readRegistryCount(
  client: ReturnType<typeof createPublicClient>,
  registryAddress: `0x${string}`
) {
  try {
    const raw = await client.getStorageAt({
      address: registryAddress,
      slot: IDENTITY_REGISTRY_STORAGE_SLOT,
    });
    if (raw) {
      const value = BigInt(raw);
      if (value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(value);
    }
  } catch {
    // Older deployments can still be enumerated through ownerOf below.
  }

  return findRegistryCountByBinarySearch(client, registryAddress);
}

async function fetchRegisteredIndex() {
  const client = getSepoliaClient();
  const registryAddress = getSepoliaRegistryAddress();
  if (!client || !registryAddress) return [] as SepoliaRegistryStub[];

  const count = await readRegistryCount(client, registryAddress);
  return Array.from({ length: count }, (_, index) => ({
    agentId: String(index),
    sequence: BigInt(index),
  }));
}

async function getRegisteredIndex() {
  const now = Date.now();
  if (registeredIndexCache && registeredIndexCache.expiresAt > now) {
    return registeredIndexCache.items;
  }
  if (registeredIndexPromise) return registeredIndexPromise;

  registeredIndexPromise = fetchRegisteredIndex()
    .then((items) => {
      registeredIndexCache = {
        expiresAt: Date.now() + INDEX_CACHE_TTL_MS,
        items,
      };
      return items;
    })
    .finally(() => {
      registeredIndexPromise = null;
    });

  return registeredIndexPromise;
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
        functionName: "ownerOf" as const,
        args: [BigInt(stub.agentId)] as const,
      },
      {
        address: registryAddress,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "tokenURI" as const,
        args: [BigInt(stub.agentId)] as const,
      },
    ]),
  });

  const agents = await Promise.all(
    stubs.map(async (stub, index): Promise<AgentWithDetails | null> => {
      const ownerResult = multicallResults[index * 2];
      const uriResult = multicallResults[index * 2 + 1];
      if (ownerResult?.status !== "success" || typeof ownerResult.result !== "string") return null;

      const agentURI =
        uriResult?.status === "success" && typeof uriResult.result === "string"
          ? normalizeOptionalString(uriResult.result)
          : null;
      const registrationFile = await getCachedRegistrationFile(agentURI);

      return {
        id: stub.agentId,
        agentId: stub.agentId,
        chainId: String(AGENT_NETWORK_CHAIN_IDS.sepolia),
        owner: ownerResult.result,
        operators: [],
        agentURI,
        createdAt: "0",
        updatedAt: "0",
        totalFeedback: "0",
        lastActivity: "0",
        registrationFile,
        feedback: [],
        stats: null,
      };
    })
  );

  return agents.filter((agent): agent is AgentWithDetails => Boolean(agent));
}

async function fetchOwnerIndex() {
  const stubs = await getRegisteredIndex();
  const client = getSepoliaClient();
  const registryAddress = getSepoliaRegistryAddress();
  const result = new Map<string, SepoliaRegistryStub[]>();
  if (!client || !registryAddress || !stubs.length) return result;

  const batches: SepoliaRegistryStub[][] = [];
  for (let index = 0; index < stubs.length; index += OWNER_BATCH_SIZE) {
    batches.push(stubs.slice(index, index + OWNER_BATCH_SIZE));
  }

  for (let index = 0; index < batches.length; index += OWNER_BATCH_CONCURRENCY) {
    const groups = await Promise.all(
      batches.slice(index, index + OWNER_BATCH_CONCURRENCY).map(async (batch) => {
        const owners = await client.multicall({
          allowFailure: true,
          contracts: batch.map((stub) => ({
            address: registryAddress,
            abi: IDENTITY_REGISTRY_ABI,
            functionName: "ownerOf" as const,
            args: [BigInt(stub.agentId)] as const,
          })),
        });
        return { batch, owners };
      })
    );

    for (const { batch, owners } of groups) {
      owners.forEach((ownerResult, ownerIndex) => {
        if (ownerResult.status !== "success" || typeof ownerResult.result !== "string") return;
        const key = ownerResult.result.toLowerCase();
        const current = result.get(key) || [];
        current.push(batch[ownerIndex]);
        result.set(key, current);
      });
    }
  }

  return result;
}

async function getOwnerIndex() {
  const now = Date.now();
  if (ownerIndexCache && ownerIndexCache.expiresAt > now) return ownerIndexCache.items;
  if (ownerIndexPromise) return ownerIndexPromise;

  ownerIndexPromise = fetchOwnerIndex()
    .then((items) => {
      ownerIndexCache = {
        expiresAt: Date.now() + OWNER_INDEX_CACHE_TTL_MS,
        items,
      };
      return items;
    })
    .finally(() => {
      ownerIndexPromise = null;
    });

  return ownerIndexPromise;
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
  const sorted = [...(await getRegisteredIndex())].sort((a, b) =>
    compareStubs(a, b, orderBy, orderDirection)
  );

  if (!normalizedQuery && (!protocol || protocol === "all")) {
    return hydrateAgentSlice(sorted.slice(skip, skip + first));
  }

  let candidates: SepoliaRegistryStub[];
  if (/^0x[a-f0-9]{40}$/.test(normalizedQuery)) {
    candidates = [...((await getOwnerIndex()).get(normalizedQuery) || [])].sort((a, b) =>
      compareStubs(a, b, orderBy, orderDirection)
    );
  } else if (/^\d+$/.test(normalizedQuery)) {
    candidates = sorted.filter((stub) => stub.agentId.includes(normalizedQuery));
  } else {
    candidates = sorted.slice(0, SEARCH_SCAN_LIMIT);
  }

  const hydrated = await hydrateAgentSlice(candidates);
  const matches = hydrated
    .filter((agent) => matchesProtocol(agent, protocol))
    .filter((agent) => matchesAgentQuery(agent, normalizedQuery));
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

export async function listSepoliaIdentityRegistryFallbackAgentsByOwner(
  owner: string,
  params?: { first?: number; skip?: number }
) {
  const normalizedOwner = owner.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(normalizedOwner)) return [] as AgentWithDetails[];

  const stubs = [...((await getOwnerIndex()).get(normalizedOwner) || [])].sort((a, b) =>
    compareStubs(a, b, "createdAt", "desc")
  );
  const skip = params?.skip ?? 0;
  const first = params?.first ?? 50;
  return hydrateAgentSlice(stubs.slice(skip, skip + first));
}

export async function getSepoliaIdentityRegistryFallbackAgentByAgentId(
  agentIdLike: string,
  options?: { skipChainRefresh?: boolean }
) {
  const agentId = agentIdLike.trim();
  if (!/^\d+$/.test(agentId)) return null;

  const numericAgentId = Number(agentId);
  const items = await getRegisteredIndex();
  if (!Number.isSafeInteger(numericAgentId) || numericAgentId < 0 || numericAgentId >= items.length) return null;

  const [agent] = await hydrateAgentSlice([{ agentId, sequence: BigInt(agentId) }]);
  if (!agent) return null;
  if (options?.skipChainRefresh) return agent;

  try {
    return await refreshAgentFeedbackFromChain("sepolia", agent, 10);
  } catch {
    return agent;
  }
}
