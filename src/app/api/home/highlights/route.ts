import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem } from "viem";
import { GraphQLClient, gql } from "graphql-request";
import { getAgentByAgentId } from "@/lib/subgraph.handler";
import { getDisplayName } from "@/lib/format";
import { AGENT_SUBGRAPH_NETWORKS, type AgentSubgraphNetwork } from "@/lib/agent-networks";
import { getAgentNetworkFromChainId, parseChainId } from "@/lib/block-explorer";
import { loadCurateRegistrationFile } from "@/lib/curate-agent-fallback";
import {
  getCurateMode,
  getCurateRegistryAddress,
  getCurateSubgraphUrl,
  getGoldskyApiKey,
  type CurateMode,
} from "@/lib/curate-config";
import { fetchPgtcrRegistryInfo } from "@/lib/pgtcr-subgraph";
import { ERC20_ABI } from "@/lib/abi/erc20";
import { realityProxyContract } from "@/lib/reality/contracts";
import { REALITIO_ABI } from "@/lib/abi/realitio";
import { REALITY_PROXY_ADDRESS } from "@/lib/contracts/addresses";
import { parseAgentIdFromQuestionText } from "@/lib/reality/abuse-flags";
import { bytes32ToYesNo } from "@/lib/reality/encoding";

const SUBGRAPH_LOOKUP_TIMEOUT_MS = 2500;

type ModerationRow = {
  questionId: `0x${string}`;
  created: number;
  question: string;
  agentId: string | null;
  finalized: boolean;
  answer: "YES" | "NO" | "UNKNOWN" | "OPEN";
};

function getSepoliaRpcUrl(): string | null {
  return process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || null;
}

const LOG_NEW_QUESTION = parseAbiItem(
  "event LogNewQuestion(bytes32 indexed question_id, address indexed user, uint256 template_id, string question, bytes32 indexed content_hash, address arbitrator, uint32 timeout, uint32 opening_ts, uint256 nonce, uint256 created)"
);

type CurateProp = {
  label?: string | null;
  value?: string | null;
  isIdentifier?: boolean | null;
};

function getNetworkFromCurateProps(props: CurateProp[] | null | undefined): AgentSubgraphNetwork | null {
  const key2 = props?.find((prop) => prop.label?.trim().toLowerCase() === "key2")?.value?.trim();
  if (!key2) return null;
  const chainId = parseChainId(key2);
  if (!chainId) return null;
  return getAgentNetworkFromChainId(chainId);
}

const GET_LATEST_REGISTERED_CURATE_ITEMS = gql`
  query LatestRegisteredCurateItems($registry: String!, $limit: Int!) {
    LItem(
      where: {
        registryAddress: { _eq: $registry }
        status: { _eq: "Registered" }
      }
      order_by: { latestRequestSubmissionTime: desc }
      limit: $limit
    ) {
      itemID
      key0
      status
      latestRequestSubmissionTime
      props {
        label
        value
        isIdentifier
      }
    }
  }
`;

const GET_LATEST_PGTCR_ITEMS = gql`
  query LatestPgtcrItems($registry: Bytes!, $limit: Int!) {
    items(
      where: { registryAddress: $registry }
      orderBy: includedAt
      orderDirection: desc
      first: $limit
    ) {
      itemID
      status
      includedAt
      stake
      metadata {
        key0
        key1
        key2
      }
      registry {
        submissionPeriod
        reinclusionPeriod
      }
    }
  }
`;

function makeCurateClient(mode: CurateMode) {
  const url = getCurateSubgraphUrl(mode);
  if (mode === "pgtcr") {
    const apiKey = getGoldskyApiKey();
    return new GraphQLClient(url, apiKey ? { headers: { "x-api-key": apiKey } } : undefined);
  }
  return new GraphQLClient(url);
}

function isPgtcrAccepted(
  status: string,
  includedAtRaw: string | number | null | undefined,
  submissionPeriodRaw: string | number | null | undefined,
  reinclusionPeriodRaw: string | number | null | undefined
) {
  const includedAt = Number(includedAtRaw);
  if (!Number.isFinite(includedAt) || includedAt <= 0) return false;
  const nowSec = Math.floor(Date.now() / 1000);

  if (status === "Submitted") {
    const period = Number(submissionPeriodRaw);
    if (!Number.isFinite(period) || period < 0) return false;
    return includedAt + period < nowSec;
  }

  if (status === "Reincluded") {
    const period = Number(reinclusionPeriodRaw);
    if (!Number.isFinite(period) || period < 0) return false;
    return includedAt + period < nowSec;
  }

  return false;
}

async function resolveAgentForCurateEntry(
  key0: string,
  hintedNetwork: AgentSubgraphNetwork | null
): Promise<{ id: string; agentId: string; name: string; network: AgentSubgraphNetwork } | null> {
  if (hintedNetwork) {
    try {
      const agent = await Promise.race([
        getAgentByAgentId(key0, hintedNetwork),
        new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), SUBGRAPH_LOOKUP_TIMEOUT_MS);
        }),
      ]);
      if (agent) {
        return {
          id: agent.id,
          agentId: agent.agentId,
          name: getDisplayName(agent),
          network: hintedNetwork,
        };
      }
    } catch {
      // keep trying other networks
    }

    return null;
  }

  for (const network of AGENT_SUBGRAPH_NETWORKS) {
    if (network === hintedNetwork) continue;
    try {
      const agent = await Promise.race([
        getAgentByAgentId(key0, network),
        new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), SUBGRAPH_LOOKUP_TIMEOUT_MS);
        }),
      ]);
      if (!agent) continue;
      return {
        id: agent.id,
        agentId: agent.agentId,
        name: getDisplayName(agent),
        network,
      };
    } catch {
      // keep trying other networks
    }
  }

  return null;
}

async function getFallbackVerifiedName(key0: string, key1?: string | null) {
  const registrationFile = await loadCurateRegistrationFile(key1 || null);
  return registrationFile?.name || `Agent #${key0}`;
}

async function getVerifiedAgents() {
  let mode: CurateMode;
  let registryAddress: string;
  let curateClient: GraphQLClient;
  try {
    mode = getCurateMode();
    registryAddress = getCurateRegistryAddress(mode).toLowerCase();
    curateClient = makeCurateClient(mode);
  } catch {
    return [];
  }

  const verified: Array<{
    id: string;
    agentId: string;
    name: string;
    network: AgentSubgraphNetwork;
    curateItemUrl?: string;
    stake: string;
    verifiedAt: number;
  }> = [];
  const seenAgentIds = new Set<string>();

  try {
    if (mode === "gtcr") {
      const response = await curateClient.request<{
        LItem: Array<{
          itemID: string;
          key0: string | null;
          status: string;
          latestRequestSubmissionTime: number;
          props?: CurateProp[];
        }>;
      }>(GET_LATEST_REGISTERED_CURATE_ITEMS, {
        registry: registryAddress,
        limit: 40,
      });

      for (const row of response?.LItem || []) {
        if (verified.length >= 40) break;
        const key0 = row.key0?.trim();
        if (!key0) continue;

        const network = getNetworkFromCurateProps(row.props);
        const dedupeKey = `${network || "unknown"}:${key0}`;
        if (seenAgentIds.has(dedupeKey)) continue;
        seenAgentIds.add(dedupeKey);

        try {
          const resolved = await resolveAgentForCurateEntry(key0, network);
          if (!resolved) {
            verified.push({
              id: row.itemID,
              agentId: key0,
              name: `Curate item ${row.itemID.slice(0, 10)}…`,
              network: network || "sepolia",
              curateItemUrl: `https://curate.kleros.io/tcr/11155111/${registryAddress}/${row.itemID}`,
              stake: "0",
              verifiedAt: Number(row.latestRequestSubmissionTime) || 0,
            });
            continue;
          }
          verified.push({
            ...resolved,
            stake: "0",
            verifiedAt: Number(row.latestRequestSubmissionTime) || 0,
          });
        } catch {
          // keep scanning
        }
      }
      return verified;
    }

    const response = await curateClient.request<{
      items: Array<{
        itemID: string;
        status: string;
        includedAt: string;
        stake: string;
        metadata?: {
          key0?: string | null;
          key1?: string | null;
          key2?: string | null;
        } | null;
        registry: {
          submissionPeriod: string;
          reinclusionPeriod: string;
        };
      }>;
    }>(GET_LATEST_PGTCR_ITEMS, {
      registry: registryAddress,
      limit: 80,
    });

    for (const row of response?.items || []) {
      if (verified.length >= 40) break;
      if (
        !isPgtcrAccepted(
          row.status,
          row.includedAt,
          row.registry?.submissionPeriod,
          row.registry?.reinclusionPeriod
        )
      ) {
        continue;
      }

      const key0 = row.metadata?.key0?.trim();
      if (!key0) continue;

      const network = (() => {
        const chainId = parseChainId(row.metadata?.key2 || "");
        if (!chainId) return null;
        return getAgentNetworkFromChainId(chainId);
      })();

      const dedupeKey = `${network || "unknown"}:${key0}`;
      if (seenAgentIds.has(dedupeKey)) continue;
      seenAgentIds.add(dedupeKey);

      try {
        const resolved = await resolveAgentForCurateEntry(key0, network);
        if (!resolved) {
          const fallbackName = await getFallbackVerifiedName(key0, row.metadata?.key1 || null);
          verified.push({
            id: key0,
            agentId: key0,
            name: fallbackName,
            network: network || "sepolia",
            stake: row.stake || "0",
            verifiedAt: Number(row.includedAt) || 0,
          });
          continue;
        }
        verified.push({
          ...resolved,
          stake: row.stake || "0",
          verifiedAt: Number(row.includedAt) || 0,
        });
      } catch {
        const fallbackName = await getFallbackVerifiedName(key0, row.metadata?.key1 || null);
        verified.push({
          id: key0,
          agentId: key0,
          name: fallbackName,
          network: network || "sepolia",
          stake: row.stake || "0",
          verifiedAt: Number(row.includedAt) || 0,
        });
      }
    }
  } catch {
    return [];
  }

  return verified.sort((a, b) => (b.verifiedAt || 0) - (a.verifiedAt || 0));
}

async function getPgtcrTokenMeta() {
  try {
    const registry = await fetchPgtcrRegistryInfo();
    const tokenAddress = registry?.token as `0x${string}` | undefined;
    if (!tokenAddress) return { symbol: "TOKEN", decimals: 18 };

    const rpcUrl = getSepoliaRpcUrl();
    if (!rpcUrl) return { symbol: "TOKEN", decimals: 18 };
    const client = createPublicClient({ transport: http(rpcUrl) });
    const [symbol, decimals] = await Promise.all([
      client.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "symbol",
      }),
      client.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "decimals",
      }),
    ]);

    return {
      symbol: String(symbol || "TOKEN"),
      decimals: Number(decimals || 18),
    };
  } catch {
    return { symbol: "TOKEN", decimals: 18 };
  }
}

async function fetchAllLogs(
  client: ReturnType<typeof createPublicClient>,
  address: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint
) {
  const chunkSize = 40_000n;
  const allLogs: Awaited<ReturnType<typeof client.getLogs>> = [];

  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    const end = start + chunkSize > toBlock ? toBlock : start + chunkSize;
    try {
      const logs = await client.getLogs({
        address,
        event: LOG_NEW_QUESTION,
        fromBlock: start,
        toBlock: end,
      });
      allLogs.push(...logs);
    } catch {
      // skip broken chunk and continue
    }
  }

  return allLogs;
}

async function getModerationHighlights(): Promise<ModerationRow[]> {
  const rpcUrl = getSepoliaRpcUrl();
  if (!rpcUrl) return [];
  const client = createPublicClient({ transport: http(rpcUrl) });

  const realitioAddress = (await client.readContract({
    ...realityProxyContract,
    functionName: "realitio",
  })) as `0x${string}`;

  const head = await client.getBlockNumber();

  const toRows = (logs: Awaited<ReturnType<typeof client.getLogs>>) =>
    logs
      .map((log) => {
        const args = (log as { args?: {
          question_id?: `0x${string}`;
          created?: bigint;
          question?: string;
          arbitrator?: `0x${string}`;
        } }).args;
        if (!args?.question_id || !args.question || !args.arbitrator || !args.created) return null;
        if (args.arbitrator.toLowerCase() !== REALITY_PROXY_ADDRESS.toLowerCase()) return null;
        return {
          questionId: args.question_id,
          created: Number(args.created),
          question: args.question,
          agentId: parseAgentIdFromQuestionText(args.question),
        };
      })
      .filter((row): row is { questionId: `0x${string}`; created: number; question: string; agentId: string | null } => !!row)
      .sort((a, b) => b.created - a.created);

  const windows = [200_000n, 500_000n, 1_500_000n];
  let parsed: Array<{ questionId: `0x${string}`; created: number; question: string; agentId: string | null }> = [];

  for (const windowSize of windows) {
    const fromBlock = head > windowSize ? head - windowSize : 0n;
    const logs = await fetchAllLogs(client, realitioAddress, fromBlock, head);
    parsed = toRows(logs);
    if (parsed.length > 0) break;
  }

  if (!parsed.length) return [];

  const enriched: ModerationRow[] = [];
  for (const row of parsed.slice(0, 20)) {
    try {
      const [best, finalized] = await Promise.all([
        client.readContract({
          address: realitioAddress,
          abi: REALITIO_ABI,
          functionName: "getBestAnswer",
          args: [row.questionId],
        }),
        client.readContract({
          address: realitioAddress,
          abi: REALITIO_ABI,
          functionName: "isFinalized",
          args: [row.questionId],
        }),
      ]);

      enriched.push({
        questionId: row.questionId,
        created: row.created,
        question: row.question,
        agentId: row.agentId,
        finalized: Boolean(finalized),
        answer: finalized ? bytes32ToYesNo(best as `0x${string}`) : "OPEN",
      });
    } catch {
      enriched.push({
        questionId: row.questionId,
        created: row.created,
        question: row.question,
        agentId: row.agentId,
        finalized: false,
        answer: "OPEN",
      });
    }
  }

  return enriched;
}

export async function GET() {
  try {
    const curateMode = getCurateMode();
    const [verifiedAgents, moderation, tokenMeta] = await Promise.all([
      getVerifiedAgents(),
      getModerationHighlights(),
      curateMode === "pgtcr" ? getPgtcrTokenMeta() : Promise.resolve({ symbol: "TOKEN", decimals: 18 }),
    ]);

    return NextResponse.json({
      success: true,
      generatedAt: new Date().toISOString(),
      verifiedAgents,
      moderation,
      verifiedStakeSymbol: tokenMeta.symbol,
      verifiedStakeDecimals: tokenMeta.decimals,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch home highlights",
        verifiedAgents: [],
        moderation: [],
        verifiedStakeSymbol: "TOKEN",
        verifiedStakeDecimals: 18,
      },
      { status: 500 }
    );
  }
}
