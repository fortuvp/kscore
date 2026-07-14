import { GraphQLClient, gql } from "graphql-request";
import type { AgentSubgraphNetwork } from "@/lib/agent-networks";
import { getAgentNetworkFromChainId, parseChainId } from "@/lib/block-explorer";
import {
  getGoldskyApiKey,
  getPgtcrDeployment,
  type CurateMode,
} from "@/lib/curate-config";
import {
  DEFAULT_VERIFICATION_ENVIRONMENT,
  type VerificationEnvironment,
} from "@/lib/verification-environment";

export const KLEROS_CURATE_SEPOLIA_CHAIN_ID = 11155111;

function getCurateRegistryUrl(registryAddress: string, chainId: number) {
  // Kleros Curate UI expects checksummed address in the URL (but any-case works in practice).
  return `https://curate.kleros.io/tcr/${chainId}/${registryAddress}`;
}

function getCurateItemUrl(registryAddress: string, itemID: string, chainId: number) {
  return `${getCurateRegistryUrl(registryAddress, chainId)}/${encodeURIComponent(itemID)}`;
}

export type GtcrItemStatus =
  | "Absent"
  | "Registered"
  | "RegistrationRequested"
  | "ClearingRequested"
  | string;

export type PgtcrItemStatus = "Absent" | "Submitted" | "Reincluded" | "Disputed" | string;

export type CurateItemStatus = GtcrItemStatus | PgtcrItemStatus;

export interface CurateLookupResult {
  found: boolean;
  mode: CurateMode;
  verificationEnvironment: VerificationEnvironment;
  chainId: number;
  registryAddress: string;
  status?: CurateItemStatus;
  itemID?: string;
  disputed?: boolean;

  // PGTCR-specific fields used to compute "accepted" off-chain.
  includedAt?: number; // seconds
  submissionPeriod?: number; // seconds
  reinclusionPeriod?: number; // seconds

  curateRegistryUrl: string;
  curateItemUrl?: string;
}

// -------------------
// PGTCR (Goldsky) query
// -------------------

const PGTCR_ITEMS_BY_REGISTRY_AND_KEY0 = gql`
  query ItemsByRegistryAndKey0($registry: Bytes!, $key0: String!, $first: Int!, $skip: Int!) {
    items(
      where: { registryAddress: $registry, metadata_: { key0: $key0 } }
      orderBy: includedAt
      orderDirection: desc
      first: $first
      skip: $skip
    ) {
      id
      itemID
      status
      includedAt
      registry {
        id
        submissionPeriod
        reinclusionPeriod
      }
      metadata {
        key0
        key2
      }
    }
  }
`;

function getNetworkFromCaip10Owner(value: string | null | undefined): AgentSubgraphNetwork | null {
  const chainId = parseChainId(value || "");
  if (!chainId) return null;
  return getAgentNetworkFromChainId(chainId);
}

function makeGraphqlClient(verificationEnvironment: VerificationEnvironment): GraphQLClient {
  const deployment = getPgtcrDeployment(verificationEnvironment);
  const apiKey = getGoldskyApiKey(verificationEnvironment);
  return new GraphQLClient(
    deployment.subgraphUrl,
    apiKey ? { headers: { "x-api-key": apiKey } } : undefined
  );
}

export function isCurateItemAccepted(lookup: CurateLookupResult, nowSec: number): boolean {
  if (!lookup.found || !lookup.status) return false;

  if (lookup.mode === "gtcr") {
    return lookup.status === "Registered";
  }

  // PGTCR:
  // An item displays as "accepted" when its status is Submitted or Reincluded
  // AND includedAt + period < now, where period depends on the status.
  const status = lookup.status;
  const includedAt = lookup.includedAt;
  if (!includedAt) return false;

  if (status === "Submitted") {
    const p = lookup.submissionPeriod;
    if (!p && p !== 0) return false;
    return includedAt + p < nowSec;
  }

  if (status === "Reincluded") {
    const p = lookup.reinclusionPeriod;
    if (!p && p !== 0) return false;
    return includedAt + p < nowSec;
  }

  return false;
}

export function selectPreferredCurateLookup(
  items: readonly CurateLookupResult[]
): CurateLookupResult | undefined {
  return items.find((item) => item.status !== "Absent") || items[0];
}

export async function lookupCurateItemByAgentId(
  agentId: string | number,
  options?: {
    network?: AgentSubgraphNetwork;
    verificationEnvironment?: VerificationEnvironment;
  }
): Promise<CurateLookupResult> {
  const verificationEnvironment = options?.verificationEnvironment || DEFAULT_VERIFICATION_ENVIRONMENT;
  const deployment = getPgtcrDeployment(verificationEnvironment);
  const matches = await lookupCurateItemsByAgentId(agentId, options);
  const selected = selectPreferredCurateLookup(matches);
  if (selected) return selected;

  return {
    found: false,
    mode: "pgtcr",
    verificationEnvironment,
    chainId: deployment.chainId,
    registryAddress: deployment.registryAddress,
    curateRegistryUrl: getCurateRegistryUrl(deployment.registryAddress, deployment.chainId),
  };
}

/** Returns every source-chain-matching lifecycle, newest first. */
export async function lookupCurateItemsByAgentId(
  agentId: string | number,
  options?: {
    network?: AgentSubgraphNetwork;
    verificationEnvironment?: VerificationEnvironment;
  }
): Promise<CurateLookupResult[]> {
  const key0 = String(agentId);
  const expectedNetwork = options?.network;
  const verificationEnvironment = options?.verificationEnvironment || DEFAULT_VERIFICATION_ENVIRONMENT;
  const mode: CurateMode = "pgtcr";
  const deployment = getPgtcrDeployment(verificationEnvironment);
  const registryAddress = deployment.registryAddress;

  const client = makeGraphqlClient(verificationEnvironment);

  const curateRegistryUrl = getCurateRegistryUrl(registryAddress, deployment.chainId);

  type LookupItem = {
    itemID: string;
    status: PgtcrItemStatus;
    includedAt: string;
    metadata?: { key0?: string; key2?: string | null } | null;
    registry: { submissionPeriod: string; reinclusionPeriod: string };
  };
  const indexedItems: LookupItem[] = [];
  const pageSize = 100;
  for (let skip = 0; ; skip += pageSize) {
    const res = await client.request<{
    items: Array<{
      itemID: string;
      status: PgtcrItemStatus;
      includedAt: string;
      metadata?: { key0?: string; key2?: string | null } | null;
      registry: { submissionPeriod: string; reinclusionPeriod: string };
    }>;
    }>(PGTCR_ITEMS_BY_REGISTRY_AND_KEY0, {
      registry: registryAddress.toLowerCase(),
      key0,
      first: pageSize,
      skip,
    });
    const page = res?.items || [];
    indexedItems.push(...page);
    if (page.length < pageSize) break;
  }

  const fallbackFromAgentId = getNetworkFromCaip10Owner(key0);
  const matches = indexedItems.filter((item) => {
    if (!expectedNetwork) return true;
    const metadataNetwork = getNetworkFromCaip10Owner(item.metadata?.key2 || "");
    if (metadataNetwork) return metadataNetwork === expectedNetwork;
    if (fallbackFromAgentId) return fallbackFromAgentId === expectedNetwork;
    return false;
  });

  return matches.map((item) => {
    const includedAt = Number(item.includedAt);
    const submissionPeriod = Number(item.registry?.submissionPeriod);
    const reinclusionPeriod = Number(item.registry?.reinclusionPeriod);
    return {
      found: true,
      mode,
      verificationEnvironment,
      chainId: deployment.chainId,
      registryAddress,
      status: item.status,
      itemID: item.itemID,
      disputed: item.status === "Disputed",
      includedAt: Number.isFinite(includedAt) ? includedAt : undefined,
      submissionPeriod: Number.isFinite(submissionPeriod) ? submissionPeriod : undefined,
      reinclusionPeriod: Number.isFinite(reinclusionPeriod) ? reinclusionPeriod : undefined,
      curateRegistryUrl,
      curateItemUrl: getCurateItemUrl(registryAddress, item.itemID, deployment.chainId),
    } satisfies CurateLookupResult;
  });
}
