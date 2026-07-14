import { NextRequest, NextResponse } from "next/server";
import { getAgentByAgentId, getAgentWithFeedback } from "@/lib/subgraph.handler";
import { isAgentSubgraphNetwork, type AgentSubgraphNetwork } from "@/lib/agent-networks";
import { getCurateFallbackAgentByAgentId } from "@/lib/curate-agent-fallback.server";
import { getSepoliaIdentityRegistryFallbackAgentByAgentId } from "@/lib/identity-registry-fallback.server";
import { getVerificationEnvironmentFromSearchParams } from "@/lib/verification-environment";
import { getPgtcrDeployment } from "@/lib/curate-config";

const AGENT_DETAIL_TIMEOUT_MS = 8000;
const FAST_AGENT_DETAIL_TIMEOUT_MS = 3000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((resolve) => {
            setTimeout(() => resolve(fallback), timeoutMs);
        }),
    ]);
}

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
    const verificationEnvironment = getVerificationEnvironmentFromSearchParams(request.nextUrl.searchParams);
    const verificationChainId = getPgtcrDeployment(verificationEnvironment).chainId;
    const verificationContext = { verificationEnvironment, verificationChainId };

    let network: AgentSubgraphNetwork = "sepolia";
    if (rawNetwork) {
        if (!isAgentSubgraphNetwork(rawNetwork)) {
            return NextResponse.json({ success: false, error: `Invalid network '${rawNetwork}'`, ...verificationContext }, { status: 400 });
        }
        network = rawNetwork;
    }

    const fallbackAgentId = extractAgentIdCandidate(id);

    try {
        if (fallbackAgentId) {
            try {
                const fallbackAgent = await withTimeout(
                    getAgentByAgentId(fallbackAgentId, network, 10, !fresh),
                    fresh ? AGENT_DETAIL_TIMEOUT_MS : FAST_AGENT_DETAIL_TIMEOUT_MS,
                    null
                );
                if (fallbackAgent) {
                    return NextResponse.json({ success: true, agent: fallbackAgent, network, ...verificationContext });
                }
            } catch {
                // Numeric fallback should not fail the whole request when the subgraph is unhealthy.
            }

            const curateFallback = await withTimeout(
                getCurateFallbackAgentByAgentId(fallbackAgentId, network, 10, {
                    skipChainRefresh: !fresh,
                    verificationEnvironment,
                }),
                fresh ? AGENT_DETAIL_TIMEOUT_MS : FAST_AGENT_DETAIL_TIMEOUT_MS,
                null
            );
            if (curateFallback?.agent) {
                return NextResponse.json({ success: true, agent: curateFallback.agent, network, ...verificationContext });
            }

            if (network === "sepolia") {
                const onchainFallback = await withTimeout(
                    getSepoliaIdentityRegistryFallbackAgentByAgentId(fallbackAgentId, { skipChainRefresh: !fresh }),
                    fresh ? AGENT_DETAIL_TIMEOUT_MS : FAST_AGENT_DETAIL_TIMEOUT_MS,
                    null
                );
                if (onchainFallback) {
                    return NextResponse.json({ success: true, agent: onchainFallback, network, ...verificationContext });
                }
            }

            return NextResponse.json({ success: false, error: "Agent not found", ...verificationContext }, { status: 404 });
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
                return NextResponse.json({ success: false, error: "Agent not found", ...verificationContext }, { status: 404 });
            }

            const fastAgent = await getAgentWithFeedback(id, 10, network, true);
            if (fastAgent) {
                return NextResponse.json({ success: true, agent: fastAgent, network, ...verificationContext });
            }

            if (fallbackAgentId) {
                const curateFallback = await getCurateFallbackAgentByAgentId(fallbackAgentId, network, 10, {
                    verificationEnvironment,
                });
                if (curateFallback?.agent) {
                    return NextResponse.json({ success: true, agent: curateFallback.agent, network, ...verificationContext });
                }
                const fallbackAgent = await getAgentByAgentId(fallbackAgentId, network, 10, true);
                if (fallbackAgent) {
                    return NextResponse.json({ success: true, agent: fallbackAgent, network, ...verificationContext });
                }
                if (network === "sepolia") {
                    const onchainFallback = await getSepoliaIdentityRegistryFallbackAgentByAgentId(fallbackAgentId);
                    if (onchainFallback) {
                        return NextResponse.json({ success: true, agent: onchainFallback, network, ...verificationContext });
                    }
                }
            }
            return NextResponse.json({ success: false, error: "Agent not found", ...verificationContext }, { status: 404 });
        }

        return NextResponse.json({ success: true, agent, network, ...verificationContext });
    } catch (error) {
        if (fresh) {
            console.error("[Agent Detail API] Fresh fetch error:", error);
            return NextResponse.json(
                { success: false, error: error instanceof Error ? error.message : "Unknown error", ...verificationContext },
                { status: 500 }
            );
        }

        try {
            const fastAgent = await getAgentWithFeedback(id, 10, network, true);
            if (fastAgent) {
                return NextResponse.json({ success: true, agent: fastAgent, network, ...verificationContext });
            }
        } catch {
            // fall through to agentId fallback below
        }
        console.error("[Agent Detail API] Error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Unknown error", ...verificationContext },
            { status: 500 }
        );
    }
}
