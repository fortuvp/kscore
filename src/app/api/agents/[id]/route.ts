import { NextRequest, NextResponse } from "next/server";
import { getAgentByAgentId, getAgentWithFeedback } from "@/lib/subgraph.handler";
import { isAgentSubgraphNetwork, type AgentSubgraphNetwork } from "@/lib/agent-networks";
import { getCurateFallbackAgentByAgentId } from "@/lib/curate-agent-fallback.server";
import { getSepoliaIdentityRegistryFallbackAgentByAgentId } from "@/lib/identity-registry-fallback.server";

const AGENT_DETAIL_TIMEOUT_MS = 8000;

function extractAgentIdCandidate(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) return trimmed;
    if (/^\d+:\d+$/.test(trimmed)) return trimmed.split(":").pop() || null;
    if (trimmed.startsWith("eip155:")) return trimmed.split(":").pop()?.trim() || null;
    return null;
}

function parseFreshParam(value: string | null): boolean {
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id: rawId } = await params;
    const id = decodeURIComponent(rawId);
    const rawNetwork = request.nextUrl.searchParams.get("network");
    const fresh = parseFreshParam(request.nextUrl.searchParams.get("fresh"));

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
                const fallbackAgent = await getAgentByAgentId(fallbackAgentId, network, 10, !fresh);
                if (fallbackAgent) {
                    return NextResponse.json({ success: true, agent: fallbackAgent, network });
                }
            } catch {
                // Numeric fallback should not fail the whole request when the subgraph is unhealthy.
            }

            if (network === "sepolia") {
                const onchainFallback = await getSepoliaIdentityRegistryFallbackAgentByAgentId(fallbackAgentId);
                if (onchainFallback) {
                    return NextResponse.json({ success: true, agent: onchainFallback, network });
                }
            }

            return NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 });
        }

        const agent = fresh
            ? await getAgentWithFeedback(id, 10, network)
            : await Promise.race([
                getAgentWithFeedback(id, 10, network),
                new Promise<null>((resolve) => {
                    setTimeout(() => resolve(null), AGENT_DETAIL_TIMEOUT_MS);
                }),
            ]);

        if (!agent) {
            if (fresh) {
                return NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 });
            }

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
                if (network === "sepolia") {
                    const onchainFallback = await getSepoliaIdentityRegistryFallbackAgentByAgentId(fallbackAgentId);
                    if (onchainFallback) {
                        return NextResponse.json({ success: true, agent: onchainFallback, network });
                    }
                }
            }
            return NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true, agent, network });
    } catch (error) {
        if (fresh) {
            console.error("[Agent Detail API] Fresh fetch error:", error);
            return NextResponse.json(
                { success: false, error: error instanceof Error ? error.message : "Unknown error" },
                { status: 500 }
            );
        }

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
