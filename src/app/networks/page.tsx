"use client";

import * as React from "react";
import Link from "next/link";
import { Network, Loader2, ExternalLink, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AGENT_SUBGRAPH_NETWORKS,
  AGENT_SUBGRAPH_ENV_KEYS,
  AGENT_NETWORK_CHAIN_IDS,
  getAgentSubgraphLabel,
  type AgentSubgraphNetwork,
} from "@/lib/agent-networks";
import { getExplorerBaseUrlByNetwork } from "@/lib/block-explorer";
import { ESCROW_ADDRESS, REALITY_PROXY_ADDRESS, CURATE_REGISTRY_ADDRESS } from "@/lib/contracts/addresses";

type StatsResponse = {
  success: boolean;
  items: Array<{
    network: AgentSubgraphNetwork;
    label: string;
    agents: number;
    active7d: number;
    new24h: number;
    reviews: number;
    averageQuality: number;
    truncated: boolean;
    subgraphStatus: "live" | "error" | "timeout" | "missing";
    error?: string;
    envVarName: string;
    subgraphId: string | null;
    gatewayUrl: string | null;
  }>;
};

function getSubgraphBadge(status: StatsResponse["items"][number]["subgraphStatus"]) {
  if (status === "live") return { label: "Live", className: "border-emerald-400/30 text-emerald-300" };
  if (status === "timeout") return { label: "Timeout", className: "border-amber-400/30 text-amber-300" };
  if (status === "error") return { label: "Error", className: "border-red-400/30 text-red-300" };
  return { label: "Missing env", className: "border-red-400/30 text-red-300" };
}

export default function NetworksPage() {
  const [breakdown, setBreakdown] = React.useState<StatsResponse["items"]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/networks/summary", { cache: "no-store" });
        const json = (await res.json()) as StatsResponse;
        if (!cancelled && json.success) setBreakdown(json.items || []);
      } catch {
        if (!cancelled) setBreakdown([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const countMap = new Map(breakdown.map((item) => [item.network, item]));
  const totalAgents = breakdown.reduce((sum, item) => sum + item.agents, 0);

  return (
    <div className="container mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-3">
          <Network className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Networks</h1>
        </div>
        <p className="text-muted-foreground">
          Coverage view of each configured subgraph, quality footprint, and explorer access.
        </p>
      </div>

      <section className="mb-4 rounded-xl border border-border/50 bg-card/40 p-4">
        <h2 className="mb-3 text-lg font-semibold">Kleros contracts (Sepolia)</h2>
        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <AddressCard label="Kleros Escrow" address={ESCROW_ADDRESS} />
          <AddressCard label="Reality Proxy" address={REALITY_PROXY_ADDRESS} />
          <AddressCard label="Curate Registry" address={CURATE_REGISTRY_ADDRESS} />
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          Current contract addresses are configured for Sepolia in this demo.
        </div>
      </section>

      {loading ? (
        <div className="flex h-32 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading network coverage...
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {AGENT_SUBGRAPH_NETWORKS.map((network) => {
              const counts = countMap.get(network);
              const coverage = totalAgents ? Math.round(((counts?.agents || 0) / totalAgents) * 100) : 0;
              const explorer = getExplorerBaseUrlByNetwork(network);
              const statusBadge = getSubgraphBadge(counts?.subgraphStatus || "missing");
              return (
                <section key={network} className="rounded-xl border border-border/50 bg-card/40 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">{getAgentSubgraphLabel(network)}</h2>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>Chain ID {AGENT_NETWORK_CHAIN_IDS[network]}</span>
                        <span>|</span>
                        <span>{counts?.envVarName || AGENT_SUBGRAPH_ENV_KEYS[network]}</span>
                        <Badge variant="outline" className={statusBadge.className}>
                          {statusBadge.label}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{counts?.agents || 0} agents</Badge>
                      {explorer ? (
                        <Button asChild size="sm" variant="outline">
                          <a href={explorer} target="_blank" rel="noreferrer">
                            <Globe className="mr-1 h-3.5 w-3.5" />
                            Explorer
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="mb-3 h-2 w-full rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${coverage}%` }} />
                  </div>
                  <div className="mb-4 text-xs text-muted-foreground">
                    {coverage}% of indexed agents are on this network.
                    {counts?.truncated ? " (capped while indexing very large datasets)" : ""}
                  </div>

                  {counts?.error ? (
                    <div className="mb-4 rounded-lg border border-amber-400/20 bg-amber-500/10 p-2 text-xs text-amber-100/80">
                      {counts.error}
                    </div>
                  ) : null}

                  <div className="mb-4 grid gap-2 text-xs sm:grid-cols-2">
                    <div className="rounded-lg border border-border/30 p-2">
                      <div className="text-muted-foreground">Subgraph ID</div>
                      <div className="mt-1 break-all font-mono">{counts?.subgraphId || "Missing"}</div>
                    </div>
                    <div className="rounded-lg border border-border/30 p-2">
                      <div className="text-muted-foreground">Gateway</div>
                      <div className="mt-1 break-all font-mono">{counts?.gatewayUrl || "Unavailable"}</div>
                    </div>
                  </div>

                  <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <MetricTile label="Active 7d" value={counts?.active7d || 0} />
                    <MetricTile label="New 24h" value={counts?.new24h || 0} />
                    <MetricTile label="Reviews" value={counts?.reviews || 0} />
                    <MetricTile label="Avg quality" value={counts?.averageQuality || 0} />
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border/30 p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function AddressCard({ label, address }: { label: string; address: string }) {
  return (
    <div className="rounded-lg border border-border/30 p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-mono text-xs break-all">{address}</div>
      <Link
        href={`https://sepolia.etherscan.io/address/${address}`}
        target="_blank"
        className="mt-1 inline-flex items-center text-xs text-primary hover:underline"
      >
        View <ExternalLink className="ml-1 h-3 w-3" />
      </Link>
    </div>
  );
}
