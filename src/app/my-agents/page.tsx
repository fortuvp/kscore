"use client";

import * as React from "react";
import Link from "next/link";
import { Bot, CheckCircle2, CircleDashed, RefreshCw, ShieldCheck, WalletCards } from "lucide-react";
import { useAccount } from "wagmi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConnectButton } from "@/components/web3/connect-button";
import { AccountWatchlist } from "@/components/account-watchlist";
import { AgentImage } from "@/components/agents/agent-image";
import {
  AGENT_SUBGRAPH_NETWORKS,
  getAgentSubgraphLabel,
  type AgentSubgraphNetwork,
} from "@/lib/agent-networks";
import { getDisplayName, truncateAddress } from "@/lib/format";
import type { Agent } from "@/types/agent";
import { useVerificationEnvironment } from "@/components/verification-environment-provider";

type OwnedAgent = Agent & {
  sourceNetwork: AgentSubgraphNetwork;
  collateralized: boolean;
};

type StatusFilter = "all" | "verified" | "unverified";
type NetworkFilter = AgentSubgraphNetwork | "all";

type OwnedAgentsResponse = {
  success: boolean;
  error?: string;
  items: OwnedAgent[];
  hasMore?: boolean;
};

export default function MyAgentsPage() {
  const { address, isConnected } = useAccount();
  const { environment, withEnvironment } = useVerificationEnvironment();
  const [agents, setAgents] = React.useState<OwnedAgent[]>([]);
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [networkFilter, setNetworkFilter] = React.useState<NetworkFilter>("all");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hasMore, setHasMore] = React.useState(false);

  const load = React.useCallback(async (signal?: AbortSignal) => {
    if (!address) {
      setAgents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        owner: address,
        network: "all",
        first: "200",
        verificationEnvironment: environment,
      });
      const response = await fetch(`/api/agents/by-owner?${params}`, { cache: "no-store", signal });
      const json = (await response.json()) as OwnedAgentsResponse;
      if (!json.success) throw new Error(json.error || "Failed to load your agents");
      setAgents(json.items || []);
      setHasMore(Boolean(json.hasMore));
    } catch (loadError) {
      if (signal?.aborted) return;
      setError(loadError instanceof Error ? loadError.message : "Failed to load your agents");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [address, environment]);

  React.useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const networkAgents = React.useMemo(
    () => agents.filter((agent) => networkFilter === "all" || agent.sourceNetwork === networkFilter),
    [agents, networkFilter]
  );
  const visibleAgents = React.useMemo(
    () =>
      networkAgents.filter((agent) => {
        if (statusFilter === "verified") return agent.collateralized;
        if (statusFilter === "unverified") return !agent.collateralized;
        return true;
      }),
    [networkAgents, statusFilter]
  );
  const verifiedCount = networkAgents.filter((agent) => agent.collateralized).length;
  const unverifiedCount = networkAgents.length - verifiedCount;

  return (
    <div className="container mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <WalletCards className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">My Agents</h1>
          </div>
          <p className="mt-2 text-muted-foreground">
            {isConnected && address
              ? `Connected as ${truncateAddress(address)}. Manage owned and watched agents in one place.`
              : "Manage owned and watched agents in one place."}
          </p>
        </div>
        {isConnected ? (
          <div className="flex items-center gap-2">
            <ConnectButton />
            <Button
              type="button"
              size="icon"
              variant="outline"
              title="Refresh agents"
              aria-label="Refresh agents"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        ) : null}
      </div>

      {!isConnected || !address ? (
        <section className="flex min-h-[20rem] flex-col items-center justify-center border-y border-border/60 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-300/10">
            <WalletCards className="h-6 w-6 text-cyan-200" />
          </div>
          <h2 className="mt-5 text-xl font-semibold">Connect your owner wallet</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Your registered agents and their verification status will appear here.
          </p>
          <div className="mt-6">
            <ConnectButton />
          </div>
        </section>
      ) : (
        <>
          <section className="grid border-y border-border/60 sm:grid-cols-3">
            <Metric label="All agents" value={networkAgents.length} icon={Bot} />
            <Metric label="Verified" value={verifiedCount} icon={CheckCircle2} tone="verified" />
            <Metric label="Not verified" value={unverifiedCount} icon={CircleDashed} tone="pending" />
          </section>

          <div className="my-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="inline-flex w-fit items-center rounded-lg border border-border/60 bg-background p-1">
              <StatusButton active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>All</StatusButton>
              <StatusButton active={statusFilter === "verified"} onClick={() => setStatusFilter("verified")}>Verified</StatusButton>
              <StatusButton active={statusFilter === "unverified"} onClick={() => setStatusFilter("unverified")}>Not verified</StatusButton>
            </div>

            <Select value={networkFilter} onValueChange={(value) => setNetworkFilter(value as NetworkFilter)}>
              <SelectTrigger className="w-full sm:w-[190px]">
                <SelectValue placeholder="Network" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All networks</SelectItem>
                {AGENT_SUBGRAPH_NETWORKS.map((network) => (
                  <SelectItem key={network} value={network}>{getAgentSubgraphLabel(network)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading && agents.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
              Loading your agents...
            </div>
          ) : error ? (
            <div className="border-y border-red-500/25 bg-red-500/5 px-4 py-8 text-center text-sm text-red-200">{error}</div>
          ) : visibleAgents.length === 0 ? (
            <div className="border-y border-border/60 px-4 py-16 text-center text-sm text-muted-foreground">
              No agents match these filters.
            </div>
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-lg border border-border/60 md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Agent</TableHead>
                      <TableHead>Agent ID</TableHead>
                      <TableHead>Network</TableHead>
                      <TableHead>Verification</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleAgents.map((agent) => (
                      <AgentRow
                        key={`${agent.sourceNetwork}:${agent.id}`}
                        agent={agent}
                        withEnvironment={withEnvironment}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-2 md:hidden">
                {visibleAgents.map((agent) => (
                  <AgentMobileRow
                    key={`${agent.sourceNetwork}:${agent.id}`}
                    agent={agent}
                    withEnvironment={withEnvironment}
                  />
                ))}
              </div>
            </>
          )}

          {hasMore ? (
            <p className="mt-4 text-xs text-muted-foreground">Showing the first 200 owned agents.</p>
          ) : null}
        </>
      )}

      <AccountWatchlist />
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "verified" | "pending";
}) {
  const toneClass = tone === "verified" ? "text-emerald-300" : tone === "pending" ? "text-amber-200" : "text-cyan-200";
  return (
    <div className="flex items-center gap-3 px-4 py-5 sm:border-r sm:last:border-r-0">
      <Icon className={`h-5 w-5 ${toneClass}`} />
      <div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function StatusButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" size="sm" variant={active ? "secondary" : "ghost"} onClick={onClick}>
      {children}
    </Button>
  );
}

function AgentRow({
  agent,
  withEnvironment,
}: {
  agent: OwnedAgent;
  withEnvironment: (href: string) => string;
}) {
  const detailHref = withEnvironment(`/agents/${encodeURIComponent(agent.id)}?network=${agent.sourceNetwork}`);
  const verifyHref = withEnvironment(`/submit/${encodeURIComponent(agent.agentId)}?network=${agent.sourceNetwork}`);
  return (
    <TableRow>
      <TableCell>
        <Link href={detailHref} className="flex min-w-0 items-center gap-3 hover:underline">
          <AgentAvatar agent={agent} />
          <span className="max-w-[280px] truncate font-medium">{getDisplayName(agent)}</span>
        </Link>
      </TableCell>
      <TableCell className="font-mono text-sm">{agent.agentId}</TableCell>
      <TableCell>{getAgentSubgraphLabel(agent.sourceNetwork)}</TableCell>
      <TableCell><VerificationBadge verified={agent.collateralized} /></TableCell>
      <TableCell className="text-right">
        {agent.collateralized ? (
          <Button asChild size="sm" variant="outline"><Link href={detailHref}>View</Link></Button>
        ) : (
          <Button asChild size="sm"><Link href={verifyHref}><ShieldCheck className="mr-2 h-4 w-4" />Verify</Link></Button>
        )}
      </TableCell>
    </TableRow>
  );
}

function AgentMobileRow({
  agent,
  withEnvironment,
}: {
  agent: OwnedAgent;
  withEnvironment: (href: string) => string;
}) {
  const detailHref = withEnvironment(`/agents/${encodeURIComponent(agent.id)}?network=${agent.sourceNetwork}`);
  const verifyHref = withEnvironment(`/submit/${encodeURIComponent(agent.agentId)}?network=${agent.sourceNetwork}`);
  return (
    <article className="rounded-lg border border-border/60 bg-card/35 p-4">
      <div className="flex items-start gap-3">
        <AgentAvatar agent={agent} />
        <div className="min-w-0 flex-1">
          <Link href={detailHref} className="block truncate font-medium hover:underline">{getDisplayName(agent)}</Link>
          <div className="mt-1 font-mono text-xs text-muted-foreground">Agent {agent.agentId}</div>
        </div>
        <VerificationBadge verified={agent.collateralized} />
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">{getAgentSubgraphLabel(agent.sourceNetwork)}</span>
        {agent.collateralized ? (
          <Button asChild size="sm" variant="outline"><Link href={detailHref}>View</Link></Button>
        ) : (
          <Button asChild size="sm"><Link href={verifyHref}>Verify</Link></Button>
        )}
      </div>
    </article>
  );
}

function AgentAvatar({ agent }: { agent: OwnedAgent }) {
  const name = getDisplayName(agent);
  return (
    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-muted">
      <AgentImage
        src={agent.registrationFile?.image}
        alt={name}
        className="h-full w-full object-cover"
        fallbackClassName="text-xs"
      />
    </div>
  );
}

function VerificationBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">Verified</Badge>
  ) : (
    <Badge variant="outline" className="border-amber-500/30 text-amber-200">Not verified</Badge>
  );
}
