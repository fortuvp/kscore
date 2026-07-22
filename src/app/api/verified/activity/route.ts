import { NextRequest, NextResponse } from "next/server";
import { gql } from "graphql-request";

import { getAgentNetworkFromChainId, parseChainId } from "@/lib/block-explorer";
import { getPgtcrDeployment } from "@/lib/curate-config";
import { makePgtcrSubgraphClient } from "@/lib/pgtcr-subgraph";
import {
  getVerificationEnvironmentFromSearchParams,
  type VerificationEnvironment,
} from "@/lib/verification-environment";
import type { AgentSubgraphNetwork } from "@/lib/agent-networks";

const ORACLE_OPERATOR = "0x82695b1ffa1e446b636247e44c2aafd3fe2cd426";
const SEPOLIA_BLOCKSCOUT_API = "https://eth-sepolia.blockscout.com/api/v2";
const SUBMIT_POSITIVE_FEEDBACK_SELECTOR = "0x30e46260";
const REVOKE_ONLY_SELECTOR = "0xdf84c0b3";
const ACTIVITY_LIMIT = 8;

const REGISTRY_ACTIVITY_QUERY = gql`
  query RegistryActivity($registry: Bytes!, $limit: Int!) {
    items(
      where: { registryAddress: $registry }
      orderBy: includedAt
      orderDirection: desc
      first: $limit
    ) {
      id
      itemID
      status
      includedAt
      withdrawingTimestamp
      metadata { key0 key2 }
      submissions(orderBy: createdAt, orderDirection: desc, first: 3) {
        submissionID
        createdAt
        creationTx
        withdrawingTimestamp
        withdrawingTx
      }
      challenges(orderBy: createdAt, orderDirection: desc, first: 3) {
        challengeID
        createdAt
        creationTx
        resolutionTime
        resolutionTx
      }
    }
  }
`;

type RegistryItem = {
  id: string;
  itemID: string;
  status: string;
  includedAt: string;
  withdrawingTimestamp?: string | null;
  metadata?: { key0?: string | null; key2?: string | null } | null;
  submissions?: Array<{
    submissionID: string;
    createdAt: string;
    creationTx?: string | null;
    withdrawingTimestamp?: string | null;
    withdrawingTx?: string | null;
  }>;
  challenges?: Array<{
    challengeID: string;
    createdAt: string;
    creationTx?: string | null;
    resolutionTime?: string | null;
    resolutionTx?: string | null;
  }>;
};

type BlockscoutTransaction = {
  hash?: string | null;
  raw_input?: string | null;
  method?: string | null;
  result?: string | null;
  status?: string | null;
  timestamp?: string | null;
  from?: { hash?: string | null } | null;
};

export type VerifiedActivity = {
  id: string;
  kind:
    | "registry_submitted"
    | "registry_challenged"
    | "registry_resolved"
    | "registry_withdrawal"
    | "oracle_positive"
    | "oracle_revoked";
  agentId: string;
  network: AgentSubgraphNetwork;
  timestamp: number;
  transactionHash: string | null;
  externalUrl: string | null;
};

function positiveInteger(value: string | number | null | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function networkFromItem(item: RegistryItem): AgentSubgraphNetwork {
  const chainId = parseChainId(item.metadata?.key2 || "");
  return (chainId ? getAgentNetworkFromChainId(chainId) : null) || "sepolia";
}

function registryActivity(
  items: RegistryItem[],
  environment: VerificationEnvironment
): VerifiedActivity[] {
  const deployment = getPgtcrDeployment(environment);
  const events: VerifiedActivity[] = [];

  for (const item of items) {
    const agentId = item.metadata?.key0?.trim();
    if (!agentId) continue;
    const network = networkFromItem(item);
    const submissions = item.submissions || [];

    if (submissions.length > 0) {
      for (const submission of submissions) {
        const timestamp = positiveInteger(submission.createdAt);
        if (!timestamp) continue;
        events.push({
          id: `registry-submission-${item.itemID}-${submission.submissionID}`,
          kind: "registry_submitted",
          agentId,
          network,
          timestamp,
          transactionHash: submission.creationTx || null,
          externalUrl: submission.creationTx
            ? `${deployment.explorerBaseUrl}/tx/${submission.creationTx}`
            : null,
        });
      }
    } else {
      const timestamp = positiveInteger(item.includedAt);
      if (timestamp) {
        events.push({
          id: `registry-included-${item.itemID}`,
          kind: "registry_submitted",
          agentId,
          network,
          timestamp,
          transactionHash: null,
          externalUrl: null,
        });
      }
    }

    const withdrawal = submissions.find(
      (submission) => positiveInteger(submission.withdrawingTimestamp) !== null
    );
    const withdrawalTimestamp =
      positiveInteger(withdrawal?.withdrawingTimestamp) ||
      positiveInteger(item.withdrawingTimestamp);
    if (withdrawalTimestamp) {
      const transactionHash = withdrawal?.withdrawingTx || null;
      events.push({
        id: `registry-withdrawal-${item.itemID}-${withdrawalTimestamp}`,
        kind: "registry_withdrawal",
        agentId,
        network,
        timestamp: withdrawalTimestamp,
        transactionHash,
        externalUrl: transactionHash
          ? `${deployment.explorerBaseUrl}/tx/${transactionHash}`
          : null,
      });
    }

    for (const challenge of item.challenges || []) {
      const createdAt = positiveInteger(challenge.createdAt);
      if (createdAt) {
        events.push({
          id: `registry-challenge-${item.itemID}-${challenge.challengeID}`,
          kind: "registry_challenged",
          agentId,
          network,
          timestamp: createdAt,
          transactionHash: challenge.creationTx || null,
          externalUrl: challenge.creationTx
            ? `${deployment.explorerBaseUrl}/tx/${challenge.creationTx}`
            : null,
        });
      }

      const resolutionTime = positiveInteger(challenge.resolutionTime);
      if (resolutionTime) {
        events.push({
          id: `registry-resolution-${item.itemID}-${challenge.challengeID}`,
          kind: "registry_resolved",
          agentId,
          network,
          timestamp: resolutionTime,
          transactionHash: challenge.resolutionTx || null,
          externalUrl: challenge.resolutionTx
            ? `${deployment.explorerBaseUrl}/tx/${challenge.resolutionTx}`
            : null,
        });
      }
    }
  }

  return events;
}

function decodeFirstUint256(input: string | null | undefined): string | null {
  const normalized = input?.trim().toLowerCase() || "";
  if (!/^0x[0-9a-f]+$/.test(normalized) || normalized.length < 74) return null;
  try {
    return BigInt(`0x${normalized.slice(10, 74)}`).toString();
  } catch {
    return null;
  }
}

async function oracleActivity(): Promise<VerifiedActivity[]> {
  const response = await fetch(
    `${SEPOLIA_BLOCKSCOUT_API}/addresses/${ORACLE_OPERATOR}/transactions?filter=from`,
    {
      headers: { accept: "application/json" },
      next: { revalidate: 30 },
    }
  );
  if (!response.ok) throw new Error("Failed to fetch oracle activity");

  const payload = (await response.json()) as { items?: BlockscoutTransaction[] };
  const events: VerifiedActivity[] = [];

  for (const transaction of payload.items || []) {
    const input = transaction.raw_input?.toLowerCase() || "";
    const selector = input.slice(0, 10) || transaction.method?.toLowerCase() || "";
    if (
      selector !== SUBMIT_POSITIVE_FEEDBACK_SELECTOR &&
      selector !== REVOKE_ONLY_SELECTOR
    ) {
      continue;
    }
    if (
      transaction.from?.hash?.toLowerCase() !== ORACLE_OPERATOR ||
      transaction.result !== "success" ||
      transaction.status !== "ok"
    ) {
      continue;
    }

    const agentId = decodeFirstUint256(input);
    const timestamp = transaction.timestamp
      ? Math.floor(Date.parse(transaction.timestamp) / 1000)
      : 0;
    const transactionHash = transaction.hash || null;
    if (!agentId || !timestamp || !transactionHash) continue;

    events.push({
      id: `oracle-${transactionHash}`,
      kind:
        selector === SUBMIT_POSITIVE_FEEDBACK_SELECTOR
          ? "oracle_positive"
          : "oracle_revoked",
      agentId,
      network: "sepolia",
      timestamp,
      transactionHash,
      externalUrl: `https://sepolia.etherscan.io/tx/${transactionHash}`,
    });
  }

  return events;
}

export async function GET(request: NextRequest) {
  const environment = getVerificationEnvironmentFromSearchParams(
    request.nextUrl.searchParams
  );
  const deployment = getPgtcrDeployment(environment);

  const registryPromise = makePgtcrSubgraphClient(environment)
    .request<{ items?: RegistryItem[] }>(REGISTRY_ACTIVITY_QUERY, {
      registry: deployment.registryAddress.toLowerCase(),
      limit: 40,
    })
    .then((result) => registryActivity(result.items || [], environment));

  const results = await Promise.allSettled([
    registryPromise,
    environment === "testnet" ? oracleActivity() : Promise.resolve([]),
  ]);
  const activities = results
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, ACTIVITY_LIMIT);

  return NextResponse.json({
    success: true,
    verificationEnvironment: environment,
    chainId: deployment.chainId,
    oracleOperator: environment === "testnet" ? ORACLE_OPERATOR : null,
    activities,
  });
}
