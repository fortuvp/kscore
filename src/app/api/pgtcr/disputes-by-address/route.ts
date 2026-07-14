import { NextRequest, NextResponse } from "next/server";
import { gql } from "graphql-request";
import { getPgtcrDeployment } from "@/lib/curate-config";
import { makePgtcrSubgraphClient } from "@/lib/pgtcr-subgraph";
import { getVerificationEnvironmentFromSearchParams } from "@/lib/verification-environment";

const BY_CHALLENGER = gql`
  query ByChallenger($registry: Bytes!, $challenger: Bytes!, $first: Int!) {
    items(where: { registryAddress: $registry, challenges_: { challenger: $challenger } }, orderBy: includedAt, orderDirection: desc, first: $first) {
      id
      itemID
      submitter
      status
      metadata { key0 key2 }
      challenges(orderBy: createdAt, orderDirection: desc, first: 8) {
        disputeID
        createdAt
        resolutionTime
        challenger
      }
    }
  }
`;

const BY_SUBMITTER = gql`
  query BySubmitter($registry: Bytes!, $submitter: Bytes!, $first: Int!) {
    items(where: { registryAddress: $registry, submitter: $submitter }, orderBy: includedAt, orderDirection: desc, first: $first) {
      id
      itemID
      submitter
      status
      metadata { key0 key2 }
      challenges(orderBy: createdAt, orderDirection: desc, first: 8) {
        disputeID
        createdAt
        resolutionTime
        challenger
      }
    }
  }
`;

type DisputeItem = {
  id: string;
  itemID: string;
  submitter: string;
  status: string;
  metadata: { key0?: string | null; key2?: string | null } | null;
  challenges: Array<{
    disputeID: string;
    createdAt: string;
    resolutionTime: string | null;
    challenger: string;
  }>;
};

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address")?.toLowerCase();
  const first = Math.min(120, Math.max(1, Number(request.nextUrl.searchParams.get("first") || "60") || 60));
  const verificationEnvironment = getVerificationEnvironmentFromSearchParams(request.nextUrl.searchParams);
  if (!address) return NextResponse.json({ success: false, error: "Missing address", items: [] }, { status: 400 });

  try {
    const deployment = getPgtcrDeployment(verificationEnvironment);
    const client = makePgtcrSubgraphClient(verificationEnvironment);
    const registry = deployment.registryAddress.toLowerCase();

    const [a, b] = await Promise.all([
      client.request<{ items: DisputeItem[] }>(BY_CHALLENGER, { registry, challenger: address, first }),
      client.request<{ items: DisputeItem[] }>(BY_SUBMITTER, { registry, submitter: address, first }),
    ]);

    const map = new Map<string, DisputeItem>();
    for (const item of [...(a.items || []), ...(b.items || [])]) {
      if ((item.challenges || []).length > 0) map.set(item.id, item);
    }

    return NextResponse.json({
      success: true,
      verificationEnvironment,
      chainId: deployment.chainId,
      registryAddress: deployment.registryAddress,
      items: Array.from(map.values()),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to fetch disputes", items: [] },
      { status: 500 }
    );
  }
}
