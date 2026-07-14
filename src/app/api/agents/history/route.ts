import { NextRequest, NextResponse } from "next/server";

import { collectAgentHistory } from "@/lib/agent-history.server";
import { isAgentSubgraphNetwork } from "@/lib/agent-networks";
import { getVerificationEnvironmentFromSearchParams } from "@/lib/verification-environment";
import { getPgtcrDeployment } from "@/lib/curate-config";

export const dynamic = "force-dynamic";

function normalizeAgentId(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return trimmed;
  if (trimmed.startsWith("eip155:")) {
    const tail = trimmed.split(":").pop()?.trim();
    if (tail && /^\d+$/.test(tail)) return tail;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const agentId = normalizeAgentId(request.nextUrl.searchParams.get("agentId"));
  const rawNetwork = request.nextUrl.searchParams.get("network") || "sepolia";
  const verificationEnvironment = getVerificationEnvironmentFromSearchParams(request.nextUrl.searchParams);
  const verificationChainId = getPgtcrDeployment(verificationEnvironment).chainId;

  if (!agentId) {
    return NextResponse.json(
      {
        success: false,
        error: "Missing or invalid numeric agentId",
        events: [],
        verificationEnvironment,
        verificationChainId,
      },
      { status: 400 }
    );
  }
  if (!isAgentSubgraphNetwork(rawNetwork)) {
    return NextResponse.json(
      {
        success: false,
        error: `Invalid network '${rawNetwork}'`,
        events: [],
        verificationEnvironment,
        verificationChainId,
      },
      { status: 400 }
    );
  }

  try {
    const history = await collectAgentHistory({
      agentId,
      network: rawNetwork,
      verificationEnvironment,
    });
    return NextResponse.json({
      success: true,
      agentId,
      network: rawNetwork,
      verificationEnvironment,
      verificationChainId,
      chainId: history.chainId,
      events: history.events,
      sourceErrors: history.errors,
      partial: history.errors.length > 0,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        agentId,
        network: rawNetwork,
        verificationEnvironment,
        verificationChainId,
        events: [],
        error: error instanceof Error ? error.message : "Failed to load agent history",
      },
      { status: 500 }
    );
  }
}
