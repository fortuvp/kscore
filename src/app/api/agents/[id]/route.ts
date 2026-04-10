import { NextRequest, NextResponse } from "next/server";
import { getAgentByAgentId, getAgentWithFeedback } from "@/lib/subgraph.handler";
import { isAgentSubgraphNetwork, type AgentSubgraphNetwork } from "@/lib/agent-networks";
import { getCurateFallbackAgentByAgentId } from "@/lib/curate-agent-fallback.server";

const AGENT_DETAIL_TIMEOUT_MS = 8000;

function extractAgentIdCandidate(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) return trimmed;
    if (/^\d+:\d+$/.test(trimmed)) return trimmed.split(":").pop() || null;
    if (trimmed.startsWith("eip155:")) return trimmed.split(":").pop()?.trim() || null;
    return null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id: rawId } = await params;
    const id = decodeURIComponent(rawId);
    const rawNetwork = request.nextUrl.searchParams.get("network");

    let network: AgentSubgraphNetwork = "sepolia";
    if (rawNetwork) {
        if (!isAgentSubgraphNetwork(rawNetwork)) {
            return NextResponse.json({ success: false, error: `Invalid network '${rawNetwork}'` }, { status: 400 });
        }
        network = rawNetwork;
    }

    const fallbackAgentId = extractAgentIdCandidate(id);

    try {
        if (fallbackAgentId) {
            const curateFallback = await getCurateFallbackAgentByAgentId(fallbackAgentId, network, 10);
            if (curateFallback?.agent) {
                return NextResponse.json({ success: true, agent: curateFallback.agent, network });
            }

            try {
                const fallbackAgent = await getAgentByAgentId(fallbackAgentId, network, 10, true);
                if (fallbackAgent) {
                    return NextResponse.json({ success: true, agent: fallbackAgent, network });
                }
            } catch {
                // Numeric fallback should not fail the whole request when the subgraph is unhealthy.
            }

            return NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 });
        }

        const agent = await Promise.race([
            getAgentWithFeedback(id, 10, network),
            new Promise<null>((resolve) => {
                setTimeout(() => resolve(null), AGENT_DETAIL_TIMEOUT_MS);
            }),
        ]);

        if (!agent) {
            const fastAgent = await getAgentWithFeedback(id, 10, network, true);
            if (fastAgent) {
                return NextResponse.json({ success: true, agent: fastAgent, network });
            }

            if (fallbackAgentId) {
                const curateFallback = await getCurateFallbackAgentByAgentId(fallbackAgentId, network, 10);
                if (curateFallback?.agent) {
                    return NextResponse.json({ success: true, agent: curateFallback.agent, network });
                }
                const fallbackAgent = await getAgentByAgentId(fallbackAgentId, network, 10, true);
                if (fallbackAgent) {
                    return NextResponse.json({ success: true, agent: fallbackAgent, network });
                }
            }
            return NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true, agent, network });
    } catch (error) {
        try {
            const fastAgent = await getAgentWithFeedback(id, 10, network, true);
            if (fastAgent) {
                return NextResponse.json({ success: true, agent: fastAgent, network });
            }
        } catch {
            // fall through to agentId fallback below
        }
        console.error("[Agent Detail API] Error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}
