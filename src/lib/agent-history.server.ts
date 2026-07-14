import "server-only";

import {
  createPublicClient,
  http,
  parseAbiItem,
  type Chain,
  type Hex,
} from "viem";
import { base, bsc, mainnet, polygon, sepolia } from "viem/chains";

import { type AgentSubgraphNetwork } from "@/lib/agent-networks";
import { normalizeAgentHistoryEvents } from "@/lib/agent-history";
import { getTxExplorerUrlForNetwork } from "@/lib/block-explorer";
import { getPgtcrDeployment, type PgtcrDeployment } from "@/lib/curate-config";
import {
  lookupCurateItemsByAgentId,
  type CurateLookupResult,
} from "@/lib/kleros-curate";
import { fetchPgtcrItemByItemIdBytes } from "@/lib/pgtcr-subgraph";
import { getBlockTimestamps, getLogsWithAdaptiveChunking } from "@/lib/rpc-logs.server";
import {
  type VerificationEnvironment,
} from "@/lib/verification-environment";
import type {
  AgentHistoryEvent,
  AgentHistoryKind,
  AgentHistorySource,
  AgentHistorySourceError,
} from "@/types/agent-history";

type PublicClient = ReturnType<typeof createPublicClient>;

type HistoryNetworkConfig = {
  chain: Chain;
  chainId: number;
  identityRegistry: `0x${string}`;
  reputationRegistry: `0x${string}`;
  validationRegistry: `0x${string}` | null;
  startBlock: bigint;
  rpcEnvKeys: string[];
};

type DecodedLog = {
  args: Record<string, unknown>;
  blockNumber: bigint | null;
  transactionHash: Hex | null;
  logIndex: number | null;
};

const TESTNET_IDENTITY_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e" as const;
const TESTNET_REPUTATION_REGISTRY = "0x8004B663056A597Dffe9eCcC1965A193B7388713" as const;
const TESTNET_VALIDATION_REGISTRY = "0x8004Cb1BF31DAf7788923b405b754f57acEB4272" as const;
const MAINNET_IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;
const MAINNET_REPUTATION_REGISTRY = "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" as const;
const MAINNET_VALIDATION_REGISTRY = "0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58" as const;

const HISTORY_NETWORKS: Record<AgentSubgraphNetwork, HistoryNetworkConfig> = {
  sepolia: {
    chain: sepolia,
    chainId: 11155111,
    identityRegistry: (process.env.NEXT_PUBLIC_AGENT_REGISTRY_SEPOLIA_ADDRESS?.trim() ||
      TESTNET_IDENTITY_REGISTRY) as `0x${string}`,
    reputationRegistry: TESTNET_REPUTATION_REGISTRY,
    validationRegistry: TESTNET_VALIDATION_REGISTRY,
    startBlock: 10_000_000n,
    rpcEnvKeys: ["SEPOLIA_RPC_URL", "NEXT_PUBLIC_SEPOLIA_RPC_URL"],
  },
  ethereum: {
    chain: mainnet,
    chainId: 1,
    identityRegistry: (process.env.NEXT_PUBLIC_AGENT_REGISTRY_ETHEREUM_ADDRESS?.trim() ||
      MAINNET_IDENTITY_REGISTRY) as `0x${string}`,
    reputationRegistry: MAINNET_REPUTATION_REGISTRY,
    validationRegistry: MAINNET_VALIDATION_REGISTRY,
    startBlock: 24_300_000n,
    rpcEnvKeys: ["ETHEREUM_RPC_URL", "NEXT_PUBLIC_ETHEREUM_RPC_URL"],
  },
  base: {
    chain: base,
    chainId: 8453,
    identityRegistry: MAINNET_IDENTITY_REGISTRY,
    reputationRegistry: MAINNET_REPUTATION_REGISTRY,
    validationRegistry: MAINNET_VALIDATION_REGISTRY,
    startBlock: 41_600_000n,
    rpcEnvKeys: ["BASE_RPC_URL", "NEXT_PUBLIC_BASE_RPC_URL"],
  },
  bsc: {
    chain: bsc,
    chainId: 56,
    identityRegistry: MAINNET_IDENTITY_REGISTRY,
    reputationRegistry: MAINNET_REPUTATION_REGISTRY,
    validationRegistry: MAINNET_VALIDATION_REGISTRY,
    startBlock: 79_000_000n,
    rpcEnvKeys: ["BSC_RPC_URL", "NEXT_PUBLIC_BSC_RPC_URL"],
  },
  polygon: {
    chain: polygon,
    chainId: 137,
    identityRegistry: MAINNET_IDENTITY_REGISTRY,
    reputationRegistry: MAINNET_REPUTATION_REGISTRY,
    validationRegistry: MAINNET_VALIDATION_REGISTRY,
    startBlock: 82_000_000n,
    rpcEnvKeys: ["POLYGON_RPC_URL", "NEXT_PUBLIC_POLYGON_RPC_URL"],
  },
};

const REGISTERED_EVENT = parseAbiItem(
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)"
);
const URI_UPDATED_EVENT = parseAbiItem(
  "event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy)"
);
const METADATA_SET_EVENT = parseAbiItem(
  "event MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue)"
);
const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
);
const NEW_FEEDBACK_EVENT = parseAbiItem(
  "event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)"
);
const FEEDBACK_REVOKED_EVENT = parseAbiItem(
  "event FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex)"
);
const RESPONSE_APPENDED_EVENT = parseAbiItem(
  "event ResponseAppended(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, address indexed responder, string responseURI, bytes32 responseHash)"
);
const VALIDATION_REQUEST_EVENT = parseAbiItem(
  "event ValidationRequest(address indexed validatorAddress, uint256 indexed agentId, string requestURI, bytes32 indexed requestHash)"
);
const VALIDATION_RESPONSE_EVENT = parseAbiItem(
  "event ValidationResponse(address indexed validatorAddress, uint256 indexed agentId, bytes32 indexed requestHash, uint8 response, string responseURI, bytes32 responseHash, string tag)"
);
const ITEM_STARTS_WITHDRAWING_EVENT = parseAbiItem(
  "event ItemStartsWithdrawing(bytes32 indexed _itemID)"
);
const ITEM_STATUS_CHANGE_EVENT = parseAbiItem(
  "event ItemStatusChange(bytes32 indexed _itemID, uint8 _status)"
);

const clientsByNetwork = new Map<AgentSubgraphNetwork, PublicClient[]>();
const pgtcrClientsByEnvironment = new Map<VerificationEnvironment, PublicClient[]>();

function uniqueStrings(values: Array<string | null | undefined>) {
  return values
    .map((value) => value?.trim() || "")
    .filter((value, index, all) => Boolean(value) && all.indexOf(value) === index);
}

function getClients(network: AgentSubgraphNetwork): PublicClient[] {
  const existing = clientsByNetwork.get(network);
  if (existing) return existing;

  const config = HISTORY_NETWORKS[network];
  const urls = uniqueStrings([
    ...config.rpcEnvKeys.map((key) => process.env[key]),
    ...config.chain.rpcUrls.default.http,
  ]);
  const clients = urls.map((url) =>
    createPublicClient({
      chain: config.chain,
      transport: http(url, { retryCount: 1, timeout: 15_000 }),
    })
  );
  clientsByNetwork.set(network, clients);
  return clients;
}

function getPgtcrClients(environment: VerificationEnvironment): PublicClient[] {
  const existing = pgtcrClientsByEnvironment.get(environment);
  if (existing) return existing;
  const deployment = getPgtcrDeployment(environment);
  const chain = deployment.chainId === 1 ? mainnet : sepolia;
  const clients = deployment.rpcUrls.map((url) =>
    createPublicClient({
      chain,
      transport: http(url, { retryCount: 1, timeout: 15_000 }),
    })
  );
  pgtcrClientsByEnvironment.set(environment, clients);
  return clients;
}

function readBigInt(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint" && value <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(value);
  return null;
}

function signedDecimal(value: bigint | null, decimals: number | null): string | null {
  if (value === null) return null;
  const places = decimals || 0;
  if (places <= 0) return value.toString();
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const scale = 10n ** BigInt(places);
  const fraction = (absolute % scale).toString().padStart(places, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${absolute / scale}${fraction ? `.${fraction}` : ""}`;
}

function eventFromLog(params: {
  source: AgentHistorySource;
  kind: AgentHistoryKind;
  chainId: number;
  log: DecodedLog;
  actor?: string | null;
  details?: AgentHistoryEvent["details"];
  network: AgentSubgraphNetwork;
}): AgentHistoryEvent {
  return {
    source: params.source,
    kind: params.kind,
    chainId: params.chainId,
    timestamp: 0,
    blockNumber: params.log.blockNumber?.toString() || null,
    logIndex: params.log.logIndex,
    transactionHash: params.log.transactionHash,
    actor: params.actor || null,
    details: params.details || {},
    externalUrl: params.log.transactionHash
      ? getTxExplorerUrlForNetwork(params.log.transactionHash, params.network)
      : null,
  };
}

async function eventLogs(
  client: PublicClient,
  address: `0x${string}`,
  event: unknown,
  args: Record<string, unknown>,
  fromBlock: bigint,
  toBlock: bigint
): Promise<DecodedLog[]> {
  const logs = await getLogsWithAdaptiveChunking(
    client,
    { address, event, args },
    fromBlock,
    toBlock
  );
  return logs as unknown as DecodedLog[];
}

async function collectIdentityEvents(
  client: PublicClient,
  network: AgentSubgraphNetwork,
  agentId: bigint,
  head: bigint
): Promise<AgentHistoryEvent[]> {
  const config = HISTORY_NETWORKS[network];
  const [registered, uriUpdated, metadataSet, transfers] = await Promise.all([
    eventLogs(client, config.identityRegistry, REGISTERED_EVENT, { agentId }, config.startBlock, head),
    eventLogs(client, config.identityRegistry, URI_UPDATED_EVENT, { agentId }, config.startBlock, head),
    eventLogs(client, config.identityRegistry, METADATA_SET_EVENT, { agentId }, config.startBlock, head),
    eventLogs(client, config.identityRegistry, TRANSFER_EVENT, { tokenId: agentId }, config.startBlock, head),
  ]);

  return [
    ...registered.map((log) =>
      eventFromLog({
        source: "identity",
        kind: "registered",
        chainId: config.chainId,
        network,
        log,
        actor: readString(log.args.owner),
        details: { agentURI: readString(log.args.agentURI) },
      })
    ),
    ...uriUpdated.map((log) =>
      eventFromLog({
        source: "identity",
        kind: "uri_updated",
        chainId: config.chainId,
        network,
        log,
        actor: readString(log.args.updatedBy),
        details: { newURI: readString(log.args.newURI) },
      })
    ),
    ...metadataSet.map((log) =>
      eventFromLog({
        source: "identity",
        kind: "metadata_set",
        chainId: config.chainId,
        network,
        log,
        details: {
          metadataKey: readString(log.args.metadataKey),
          metadataValue: readString(log.args.metadataValue),
        },
      })
    ),
    ...transfers.map((log) =>
      eventFromLog({
        source: "identity",
        kind: "ownership_transferred",
        chainId: config.chainId,
        network,
        log,
        actor: readString(log.args.to),
        details: {
          from: readString(log.args.from),
          to: readString(log.args.to),
        },
      })
    ),
  ];
}

async function collectReputationEvents(
  client: PublicClient,
  network: AgentSubgraphNetwork,
  agentId: bigint,
  head: bigint
): Promise<AgentHistoryEvent[]> {
  const config = HISTORY_NETWORKS[network];
  const [feedback, revoked, responses] = await Promise.all([
    eventLogs(client, config.reputationRegistry, NEW_FEEDBACK_EVENT, { agentId }, config.startBlock, head),
    eventLogs(client, config.reputationRegistry, FEEDBACK_REVOKED_EVENT, { agentId }, config.startBlock, head),
    eventLogs(client, config.reputationRegistry, RESPONSE_APPENDED_EVENT, { agentId }, config.startBlock, head),
  ]);

  return [
    ...feedback.map((log) => {
      const value = readBigInt(log.args.value);
      const decimals = readNumber(log.args.valueDecimals);
      return eventFromLog({
        source: "reputation",
        kind: "feedback_received",
        chainId: config.chainId,
        network,
        log,
        actor: readString(log.args.clientAddress),
        details: {
          feedbackIndex: readBigInt(log.args.feedbackIndex)?.toString() || null,
          value: signedDecimal(value, decimals),
          valueDecimals: decimals,
          tag1: readString(log.args.tag1),
          tag2: readString(log.args.tag2),
          endpoint: readString(log.args.endpoint),
          feedbackURI: readString(log.args.feedbackURI),
        },
      });
    }),
    ...revoked.map((log) =>
      eventFromLog({
        source: "reputation",
        kind: "feedback_revoked",
        chainId: config.chainId,
        network,
        log,
        actor: readString(log.args.clientAddress),
        details: { feedbackIndex: readBigInt(log.args.feedbackIndex)?.toString() || null },
      })
    ),
    ...responses.map((log) =>
      eventFromLog({
        source: "reputation",
        kind: "feedback_response",
        chainId: config.chainId,
        network,
        log,
        actor: readString(log.args.responder),
        details: {
          clientAddress: readString(log.args.clientAddress),
          feedbackIndex: readBigInt(log.args.feedbackIndex)?.toString() || null,
          responseURI: readString(log.args.responseURI),
        },
      })
    ),
  ];
}

async function collectValidationEvents(
  client: PublicClient,
  network: AgentSubgraphNetwork,
  agentId: bigint,
  head: bigint
): Promise<AgentHistoryEvent[]> {
  const config = HISTORY_NETWORKS[network];
  if (!config.validationRegistry) return [];
  const [requests, responses] = await Promise.all([
    eventLogs(client, config.validationRegistry, VALIDATION_REQUEST_EVENT, { agentId }, config.startBlock, head),
    eventLogs(client, config.validationRegistry, VALIDATION_RESPONSE_EVENT, { agentId }, config.startBlock, head),
  ]);

  return [
    ...requests.map((log) =>
      eventFromLog({
        source: "validation",
        kind: "validation_requested",
        chainId: config.chainId,
        network,
        log,
        actor: readString(log.args.validatorAddress),
        details: {
          requestURI: readString(log.args.requestURI),
          requestHash: readString(log.args.requestHash),
        },
      })
    ),
    ...responses.map((log) =>
      eventFromLog({
        source: "validation",
        kind: "validation_responded",
        chainId: config.chainId,
        network,
        log,
        actor: readString(log.args.validatorAddress),
        details: {
          requestHash: readString(log.args.requestHash),
          response: readNumber(log.args.response),
          responseURI: readString(log.args.responseURI),
          tag: readString(log.args.tag),
        },
      })
    ),
  ];
}

async function collectFromRpcFallbacks<T>(
  clients: readonly PublicClient[],
  collector: (client: PublicClient) => Promise<T>
): Promise<T> {
  let lastError: unknown = null;
  for (const client of clients) {
    try {
      return await collector(client);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("No RPC endpoint is configured");
}

async function findHead(clients: readonly PublicClient[]) {
  for (const client of clients) {
    try {
      return await client.getBlockNumber();
    } catch {
      // Try the next configured RPC.
    }
  }
  throw new Error("Unable to read the latest block from configured RPC endpoints");
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Unknown source error");
  return message.length > 240 ? `${message.slice(0, 237)}...` : message;
}

async function collectOnchainHistory(
  network: AgentSubgraphNetwork,
  agentId: bigint
): Promise<{ events: AgentHistoryEvent[]; errors: AgentHistorySourceError[] }> {
  const clients = getClients(network);
  if (!clients.length) {
    return {
      events: [],
      errors: [{ source: "identity", message: "No RPC endpoint is configured" }],
    };
  }

  const head = await findHead(clients);
  const sourceCollectors = [
    ["identity", (client: PublicClient) => collectIdentityEvents(client, network, agentId, head)],
    ["reputation", (client: PublicClient) => collectReputationEvents(client, network, agentId, head)],
    ["validation", (client: PublicClient) => collectValidationEvents(client, network, agentId, head)],
  ] as const;

  const settled = await Promise.allSettled(
    sourceCollectors.map(([, collector]) => collectFromRpcFallbacks(clients, collector))
  );
  const events: AgentHistoryEvent[] = [];
  const errors: AgentHistorySourceError[] = [];
  settled.forEach((result, index) => {
    const source = sourceCollectors[index][0];
    if (result.status === "fulfilled") events.push(...result.value);
    else errors.push({ source, message: errorMessage(result.reason) });
  });

  const blockNumbers = events
    .map((event) => event.blockNumber)
    .filter((value): value is string => Boolean(value))
    .map(BigInt);
  const timestamps = await getBlockTimestamps(HISTORY_NETWORKS[network].chainId, clients, blockNumbers);
  for (const event of events) {
    if (event.blockNumber) event.timestamp = timestamps.get(event.blockNumber) || 0;
  }

  return { events, errors };
}

function curateEvent(params: {
  environment: VerificationEnvironment;
  kind: AgentHistoryKind;
  timestamp: string | number | null | undefined;
  transactionHash?: string | null;
  actor?: string | null;
  details?: AgentHistoryEvent["details"];
  externalUrl?: string | null;
}): AgentHistoryEvent | null {
  const timestamp = Number(params.timestamp || 0);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  const deployment = getPgtcrDeployment(params.environment);
  return {
    source: "curate",
    kind: params.kind,
    chainId: deployment.chainId,
    timestamp,
    blockNumber: null,
    logIndex: null,
    transactionHash: params.transactionHash || null,
    actor: params.actor || null,
    details: params.details || {},
    externalUrl:
      params.externalUrl ||
      (params.transactionHash ? `${deployment.explorerBaseUrl}/tx/${params.transactionHash}` : null),
  };
}

async function findEarliestTransactionBlock(
  clients: readonly PublicClient[],
  transactionHashes: readonly string[]
): Promise<bigint | null> {
  let earliest: bigint | null = null;
  for (const transactionHash of transactionHashes) {
    if (!transactionHash?.startsWith("0x")) continue;
    for (const client of clients) {
      try {
        const receipt = await client.getTransactionReceipt({ hash: transactionHash as Hex });
        if (earliest === null || receipt.blockNumber < earliest) earliest = receipt.blockNumber;
        break;
      } catch {
        // Try another RPC; older public endpoints are not always archival.
      }
    }
  }
  return earliest;
}

async function collectCurateRegistryEvents(params: {
  environment: VerificationEnvironment;
  deployment: PgtcrDeployment;
  itemID: string;
  creationTransactionHashes: string[];
  hasKnownWithdrawal: boolean;
}): Promise<AgentHistoryEvent[]> {
  const clients = getPgtcrClients(params.environment);
  if (!clients.length) throw new Error("No RPC endpoint is configured for the selected verification registry");

  const head = await findHead(clients);
  const earliestReceiptBlock = await findEarliestTransactionBlock(clients, params.creationTransactionHashes);
  const fallbackStart = head > 2_000_000n ? head - 2_000_000n : 0n;
  const fromBlock = earliestReceiptBlock || fallbackStart;
  const itemID = params.itemID as Hex;

  const logs = await collectFromRpcFallbacks(clients, async (client) => {
    const [starts, statuses] = await Promise.all([
      eventLogs(
        client,
        params.deployment.registryAddress,
        ITEM_STARTS_WITHDRAWING_EVENT,
        { _itemID: itemID },
        fromBlock,
        head
      ),
      eventLogs(
        client,
        params.deployment.registryAddress,
        ITEM_STATUS_CHANGE_EVENT,
        { _itemID: itemID },
        fromBlock,
        head
      ),
    ]);
    return { starts, statuses };
  });

  const allBlockNumbers = [...logs.starts, ...logs.statuses]
    .map((log) => log.blockNumber)
    .filter((value): value is bigint => value !== null);
  const timestamps = await getBlockTimestamps(params.deployment.chainId, clients, allBlockNumbers);
  const firstStartBlock = logs.starts
    .map((log) => log.blockNumber)
    .filter((value): value is bigint => value !== null)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))[0] || null;

  const events: AgentHistoryEvent[] = [];
  for (const log of logs.starts) {
    const event = curateEvent({
      environment: params.environment,
      kind: "curate_withdrawal_started",
      timestamp: log.blockNumber ? timestamps.get(log.blockNumber.toString()) : null,
      transactionHash: log.transactionHash,
      details: { itemID: params.itemID },
    });
    if (!event) continue;
    event.blockNumber = log.blockNumber?.toString() || null;
    event.logIndex = log.logIndex;
    events.push(event);
  }

  for (const log of logs.statuses) {
    const status = readNumber(log.args._status);
    const occursAfterStart = firstStartBlock !== null && log.blockNumber !== null && log.blockNumber >= firstStartBlock;
    const matchesWithdrawalLifecycle = firstStartBlock !== null ? occursAfterStart : params.hasKnownWithdrawal;
    if (status !== 0 || !matchesWithdrawalLifecycle) continue;
    const event = curateEvent({
      environment: params.environment,
      kind: "curate_withdrawn",
      timestamp: log.blockNumber ? timestamps.get(log.blockNumber.toString()) : null,
      transactionHash: log.transactionHash,
      details: { itemID: params.itemID, status },
    });
    if (!event) continue;
    event.blockNumber = log.blockNumber?.toString() || null;
    event.logIndex = log.logIndex;
    events.push(event);
  }

  return events;
}

async function collectCurateItemHistory(
  lookup: CurateLookupResult,
  verificationEnvironment: VerificationEnvironment
): Promise<{ events: AgentHistoryEvent[]; registryError: string | null }> {
  if (!lookup.found || !lookup.itemID) return { events: [], registryError: null };
  const item = await fetchPgtcrItemByItemIdBytes(lookup.itemID, verificationEnvironment);
  if (!item) return { events: [], registryError: null };

  const deployment = getPgtcrDeployment(verificationEnvironment);
  const itemUrl = `${deployment.curateRegistryUrl}/${encodeURIComponent(lookup.itemID)}`;
  const events: AgentHistoryEvent[] = [];
  const add = (event: AgentHistoryEvent | null) => {
    if (event) events.push(event);
  };

  for (const submission of item.submissions || []) {
    add(
      curateEvent({
        environment: verificationEnvironment,
        kind: "curate_submitted",
        timestamp: submission.createdAt || item.includedAt,
        transactionHash: submission.creationTx,
        actor: submission.submitter,
        details: {
          itemID: item.itemID,
          status: item.status,
          stake: item.stake,
        },
        externalUrl: submission.creationTx ? null : itemUrl,
      })
    );
    if (Number(submission.withdrawingTimestamp || 0) > 0) {
      add(
        curateEvent({
          environment: verificationEnvironment,
          kind: "curate_withdrawal_started",
          timestamp: submission.withdrawingTimestamp,
          transactionHash: submission.withdrawingTx,
          actor: submission.submitter,
          details: { itemID: item.itemID, status: item.status },
          externalUrl: submission.withdrawingTx ? null : itemUrl,
        })
      );
    }
  }

  for (const evidence of item.evidences || []) {
    add(
      curateEvent({
        environment: verificationEnvironment,
        kind: "curate_evidence",
        timestamp: evidence.timestamp,
        transactionHash: evidence.txHash,
        actor: evidence.party,
        details: {
          itemID: item.itemID,
          evidenceNumber: evidence.number,
          evidenceURI: evidence.URI,
        },
      })
    );
  }

  for (const challenge of item.challenges || []) {
    const disputeUrl = challenge.disputeID
      ? `https://klerosboard.com/#!/dispute/${deployment.chainId}/${challenge.disputeID}`
      : itemUrl;
    add(
      curateEvent({
        environment: verificationEnvironment,
        kind: "curate_challenged",
        timestamp: challenge.createdAt,
        transactionHash: challenge.creationTx,
        actor: challenge.challenger,
        details: {
          itemID: item.itemID,
          challengeID: challenge.challengeID,
          disputeID: challenge.disputeID,
        },
        externalUrl: challenge.creationTx ? null : disputeUrl,
      })
    );
    if (challenge.resolutionTime) {
      const latestRound = challenge.rounds?.[0];
      add(
        curateEvent({
          environment: verificationEnvironment,
          kind: "curate_resolved",
          timestamp: challenge.resolutionTime,
          transactionHash: challenge.resolutionTx,
          details: {
            itemID: item.itemID,
            challengeID: challenge.challengeID,
            disputeID: challenge.disputeID,
            ruling: latestRound?.ruling || null,
          },
          externalUrl: challenge.resolutionTx ? null : disputeUrl,
        })
      );
    }
    for (const round of challenge.rounds || []) {
      if (!round.appealed || !round.appealedAt) continue;
      add(
        curateEvent({
          environment: verificationEnvironment,
          kind: "curate_appealed",
          timestamp: round.appealedAt,
          transactionHash: round.txHashAppealDecision || round.txHashAppealPossible,
          details: {
            itemID: item.itemID,
            challengeID: challenge.challengeID,
            disputeID: challenge.disputeID,
          },
          externalUrl: round.txHashAppealDecision || round.txHashAppealPossible ? null : disputeUrl,
        })
      );
    }
  }

  const exactRegistry = await collectCurateRegistryEvents({
    environment: verificationEnvironment,
    deployment,
    itemID: item.itemID,
    creationTransactionHashes: (item.submissions || []).map((submission) => submission.creationTx).filter(Boolean),
    hasKnownWithdrawal: (item.submissions || []).some(
      (submission) => Number(submission.withdrawingTimestamp || 0) > 0
    ),
  })
    .then((registryEvents) => ({ registryEvents, registryError: null as string | null }))
    .catch((error) => ({ registryEvents: [] as AgentHistoryEvent[], registryError: errorMessage(error) }));

  return { events: [...events, ...exactRegistry.registryEvents], registryError: exactRegistry.registryError };
}

async function collectCurateHistory(
  agentId: string,
  network: AgentSubgraphNetwork,
  verificationEnvironment: VerificationEnvironment
): Promise<{ events: AgentHistoryEvent[]; registryError: string | null }> {
  const lookups = await lookupCurateItemsByAgentId(agentId, { network, verificationEnvironment });
  const settled = await Promise.allSettled(
    lookups.map((lookup) => collectCurateItemHistory(lookup, verificationEnvironment))
  );
  const events: AgentHistoryEvent[] = [];
  const errors: string[] = [];
  for (const result of settled) {
    if (result.status === "rejected") {
      errors.push(errorMessage(result.reason));
      continue;
    }
    events.push(...result.value.events);
    if (result.value.registryError) errors.push(result.value.registryError);
  }
  return {
    events,
    registryError: errors.length ? Array.from(new Set(errors)).join(" | ") : null,
  };
}

export async function collectAgentHistory(params: {
  agentId: string;
  network: AgentSubgraphNetwork;
  verificationEnvironment: VerificationEnvironment;
}) {
  const numericAgentId = readBigInt(params.agentId);
  if (numericAgentId === null) throw new Error("Agent ID must be a non-negative integer");

  const [onchain, curate] = await Promise.all([
    collectOnchainHistory(params.network, numericAgentId).catch((error) => ({
      events: [] as AgentHistoryEvent[],
      errors: (["identity", "reputation", "validation"] as const).map((source) => ({
        source,
        message: errorMessage(error),
      })),
    })),
    collectCurateHistory(params.agentId, params.network, params.verificationEnvironment)
      .then((result) => ({ ...result, error: null as string | null }))
      .catch((error) => ({
        events: [] as AgentHistoryEvent[],
        registryError: null as string | null,
        error: errorMessage(error),
      })),
  ]);

  const errors = [...onchain.errors];
  if (curate.error) errors.push({ source: "curate", message: curate.error } as const);
  if (curate.registryError) errors.push({ source: "curate", message: curate.registryError } as const);

  return {
    events: normalizeAgentHistoryEvents([...onchain.events, ...curate.events]),
    errors,
    chainId: HISTORY_NETWORKS[params.network].chainId,
  };
}
