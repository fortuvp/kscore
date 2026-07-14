import { NextRequest, NextResponse } from "next/server";
import { isCurateItemAccepted, lookupCurateItemByAgentId } from "@/lib/kleros-curate";
import { isAgentSubgraphNetwork, type AgentSubgraphNetwork } from "@/lib/agent-networks";
import { getVerificationEnvironmentFromSearchParams } from "@/lib/verification-environment";

export async function GET(request: NextRequest) {
    const agentId = request.nextUrl.searchParams.get("agentId");
    const rawNetwork = request.nextUrl.searchParams.get("network");
    const verificationEnvironment = getVerificationEnvironmentFromSearchParams(request.nextUrl.searchParams);

    if (!agentId) {
        return NextResponse.json({ success: false, error: "Missing agentId" }, { status: 400 });
    }

    let network: AgentSubgraphNetwork | undefined;
    if (rawNetwork) {
        if (!isAgentSubgraphNetwork(rawNetwork)) {
            return NextResponse.json({ success: false, error: `Invalid network '${rawNetwork}'` }, { status: 400 });
        }
        network = rawNetwork;
    }

    try {
        const lookup = await lookupCurateItemByAgentId(agentId, {
            network,
            verificationEnvironment,
        });

        const nowSec = Math.floor(Date.now() / 1000);
        const verified = isCurateItemAccepted(lookup, nowSec);

        return NextResponse.json({
            success: true,
            agentId,
            verified,
            found: lookup.found,
            status: lookup.status ?? null,
            itemID: lookup.itemID ?? null,
            disputed: lookup.disputed ?? null,
            network: network ?? null,
            verificationEnvironment,
            chainId: lookup.chainId,
            registryAddress: lookup.registryAddress,
            curateRegistryUrl: lookup.curateRegistryUrl,
            curateItemUrl: lookup.curateItemUrl ?? null,
        });
    } catch (error) {
        console.error("[Kleros verification API] Error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}
