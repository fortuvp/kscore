import { NextRequest, NextResponse } from "next/server";
import { gql } from "graphql-request";
import { getPgtcrDeployment } from "@/lib/curate-config";
import { makePgtcrSubgraphClient } from "@/lib/pgtcr-subgraph";
import { getVerificationEnvironmentFromSearchParams } from "@/lib/verification-environment";

const QUERY = gql`
  query ItemsBySubmitter($registry: Bytes!, $submitter: Bytes!, $skip: Int!, $first: Int!) {
    items(
      where: { registryAddress: $registry, submitter: $submitter }
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
      submitter
      metadata { key0 key1 key2 }
      registry { id }
    }
  }
`;

export async function GET(request: NextRequest) {
  const submitter = request.nextUrl.searchParams.get("submitter")?.toLowerCase();
  const skip = Math.max(0, Number(request.nextUrl.searchParams.get("skip") || "0") || 0);
  const first = Math.min(200, Math.max(1, Number(request.nextUrl.searchParams.get("first") || "60") || 60));
  const verificationEnvironment = getVerificationEnvironmentFromSearchParams(request.nextUrl.searchParams);

  if (!submitter) {
    return NextResponse.json({ success: false, error: "Missing submitter", items: [] }, { status: 400 });
  }

  try {
    const deployment = getPgtcrDeployment(verificationEnvironment);
    const client = makePgtcrSubgraphClient(verificationEnvironment);
    const res = await client.request<{ items: unknown[] }>(QUERY, {
      registry: deployment.registryAddress.toLowerCase(),
      submitter,
      skip,
      first,
    });
    return NextResponse.json({
      success: true,
      verificationEnvironment,
      chainId: deployment.chainId,
      registryAddress: deployment.registryAddress,
      items: res.items || [],
      skip,
      first,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to fetch submitter items", items: [] },
      { status: 500 }
    );
  }
}
