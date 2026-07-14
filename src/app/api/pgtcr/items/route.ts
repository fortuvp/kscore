import { NextRequest, NextResponse } from "next/server";
import { gql } from "graphql-request";
import { getPgtcrDeployment } from "@/lib/curate-config";
import { makePgtcrSubgraphClient } from "@/lib/pgtcr-subgraph";
import { getVerificationEnvironmentFromSearchParams } from "@/lib/verification-environment";

const ITEMS_QUERY = gql`
  query Items($registry: Bytes!, $skip: Int!, $first: Int!) {
    items(
      where: { registryAddress: $registry }
      orderBy: includedAt
      orderDirection: desc
      skip: $skip
      first: $first
    ) {
      id
      itemID
      status
      includedAt
      stake
      withdrawingTimestamp
      metadata { key0 key1 key2 }
      registry { submissionPeriod reinclusionPeriod }
    }
  }
`;

export async function GET(request: NextRequest) {
  const skip = Math.max(0, Number(request.nextUrl.searchParams.get("skip") || "0") || 0);
  const first = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("first") || "40") || 40));
  const verificationEnvironment = getVerificationEnvironmentFromSearchParams(request.nextUrl.searchParams);

  try {
    const deployment = getPgtcrDeployment(verificationEnvironment);
    const client = makePgtcrSubgraphClient(verificationEnvironment);
    const registry = deployment.registryAddress.toLowerCase();

    const res = await client.request<{ items: unknown[] }>(ITEMS_QUERY, {
      registry,
      skip,
      first,
    });

    return NextResponse.json({
      success: true,
      verificationEnvironment,
      chainId: deployment.chainId,
      registryAddress: registry,
      registry,
      skip,
      first,
      items: res.items || [],
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to fetch items" },
      { status: 500 }
    );
  }
}
