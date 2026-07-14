import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { GraphQLClient, gql } from "graphql-request";
import { type AgentSubgraphNetwork } from "@/lib/agent-networks";
import { getAgentNetworkFromChainId, parseChainId } from "@/lib/block-explorer";
import { loadCurateRegistrationFile } from "@/lib/curate-agent-fallback";
import {
  getCurateSubgraphUrl,
  getGoldskyApiKey,
  getPgtcrDeployment,
  type CurateMode,
} from "@/lib/curate-config";
import { fetchPgtcrRegistryInfo } from "@/lib/pgtcr-subgraph";
import { ERC20_ABI } from "@/lib/abi/erc20";
import {
  getVerificationEnvironmentFromSearchParams,
  type VerificationEnvironment,
} from "@/lib/verification-environment";

type ModerationRow = {
  questionId: `0x${string}`;
  created: number;
  question: string;
  agentId: string | null;
  finalized: boolean;
  answer: "YES" | "NO" | "UNKNOWN" | "OPEN";
};

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

function makeCurateClient(mode: CurateMode, verificationEnvironment: VerificationEnvironment) {
  const url = getCurateSubgraphUrl(mode, verificationEnvironment);
  if (mode === "pgtcr") {
    const apiKey = getGoldskyApiKey(verificationEnvironment);
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

async function getFallbackVerifiedName(key0: string, key1?: string | null) {
  const registrationFile = await loadCurateRegistrationFile(key1 || null, 1_200);
  return registrationFile?.name || `Agent #${key0}`;
}

function getVerifiedCurateMode(): CurateMode {
  return "pgtcr";
}

async function getVerifiedAgents(verificationEnvironment: VerificationEnvironment) {
  let mode: CurateMode;
  let registryAddress: string;
  let curateClient: GraphQLClient;
  try {
    mode = getVerifiedCurateMode();
    registryAddress = getPgtcrDeployment(verificationEnvironment).registryAddress.toLowerCase();
    curateClient = makeCurateClient(mode, verificationEnvironment);
  } catch {
    return [];
  }

  type VerifiedAgent = {
    id: string;
    agentId: string;
    name: string;
    network: AgentSubgraphNetwork;
    curateItemUrl?: string;
    stake: string;
    verifiedAt: number;
  };
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

      const verified: VerifiedAgent[] = [];
      for (const row of response?.LItem || []) {
        if (verified.length >= 40) break;
        const key0 = row.key0?.trim();
        if (!key0) continue;

        const network = getNetworkFromCurateProps(row.props);
        const dedupeKey = `${network || "unknown"}:${key0}`;
        if (seenAgentIds.has(dedupeKey)) continue;
        seenAgentIds.add(dedupeKey);

        verified.push({
          id: row.itemID,
          agentId: key0,
          name: `Agent #${key0}`,
          network: network || "sepolia",
          curateItemUrl: `${getPgtcrDeployment(verificationEnvironment).curateRegistryUrl}/${row.itemID}`,
          stake: "0",
          verifiedAt: Number(row.latestRequestSubmissionTime) || 0,
        });
      }
      return verified.sort((a, b) => b.verifiedAt - a.verifiedAt);
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

    const candidates: Array<{
      key0: string;
      key1: string | null;
      network: AgentSubgraphNetwork;
      stake: string;
      verifiedAt: number;
    }> = [];

    for (const row of response?.items || []) {
      if (candidates.length >= 40) break;
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

      candidates.push({
        key0,
        key1: row.metadata?.key1 || null,
        network: network || "sepolia",
        stake: row.stake || "0",
        verifiedAt: Number(row.includedAt) || 0,
      });
    }

    const verified = await Promise.all(
      candidates.map(async (candidate): Promise<VerifiedAgent> => ({
        id: candidate.key0,
        agentId: candidate.key0,
        name: await getFallbackVerifiedName(candidate.key0, candidate.key1),
        network: candidate.network,
        stake: candidate.stake,
        verifiedAt: candidate.verifiedAt,
      }))
    );
    return verified.sort((a, b) => b.verifiedAt - a.verifiedAt);
  } catch {
    return [];
  }
}

async function getPgtcrTokenMeta(verificationEnvironment: VerificationEnvironment) {
  try {
    const deployment = getPgtcrDeployment(verificationEnvironment);
    const registry = await fetchPgtcrRegistryInfo(verificationEnvironment);
    const tokenAddress = registry?.token as `0x${string}` | undefined;
    if (!tokenAddress) return { symbol: "TOKEN", decimals: 18 };

    const rpcUrl = deployment.rpcUrls[0] || null;
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

async function getModerationHighlights(): Promise<ModerationRow[]> {
  return [];
}

export async function GET(request: NextRequest) {
  const verificationEnvironment = getVerificationEnvironmentFromSearchParams(request.nextUrl.searchParams);
  try {
    const deployment = getPgtcrDeployment(verificationEnvironment);
    const [verifiedAgents, moderation, tokenMeta] = await Promise.all([
      getVerifiedAgents(verificationEnvironment),
      getModerationHighlights(),
      getPgtcrTokenMeta(verificationEnvironment),
    ]);

    return NextResponse.json({
      success: true,
      generatedAt: new Date().toISOString(),
      verificationEnvironment,
      chainId: deployment.chainId,
      registryAddress: deployment.registryAddress,
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
