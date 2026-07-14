"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAgentSubgraphLabel, type AgentSubgraphNetwork } from "@/lib/agent-networks";
import { useVerificationEnvironment } from "@/components/verification-environment-provider";

type VerifiedStatus = "active" | "challenged" | "removed";
type VerifiedFilter = "all" | VerifiedStatus;

type VerifiedStreamResponse = {
  success: boolean;
  error?: string;
  items: Array<{
    id: string;
    agentId: string;
    name: string;
    network: AgentSubgraphNetwork;
    lookupByAgentId?: boolean;
    status: VerifiedStatus;
    curateStatus: string;
    updatedAt: number;
  }>;
};

function verifiedTone(status: VerifiedStatus) {
  if (status === "active") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (status === "challenged") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  return "border-red-500/30 bg-red-500/10 text-red-300";
}

export default function TrustPage() {
  const { environment, withEnvironment } = useVerificationEnvironment();
  const [verified, setVerified] = React.useState<VerifiedStreamResponse["items"]>([]);
  const [verifiedFilter, setVerifiedFilter] = React.useState<VerifiedFilter>("all");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/trust/verified?verificationEnvironment=${environment}`, {
        cache: "no-store",
        signal,
      });
      const json = (await response.json()) as VerifiedStreamResponse;
      if (!json.success) throw new Error(json.error || "Failed to load verified agents");
      setVerified(json.items || []);
    } catch (loadError) {
      if (signal?.aborted) return;
      setError(loadError instanceof Error ? loadError.message : "Failed to load verified agents");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [environment]);

  React.useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const filteredVerified = React.useMemo(() => {
    const rows = verifiedFilter === "all" ? verified : verified.filter((item) => item.status === verifiedFilter);
    return rows.slice().sort((a, b) => b.updatedAt - a.updatedAt);
  }, [verified, verifiedFilter]);

  const collateralizedCount = verified.filter((item) => item.status === "active").length;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">Trust</h1>
          </div>
          <p className="mt-2 text-muted-foreground">Verified agent status from the Kleros Curate registry.</p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid items-stretch gap-5 lg:grid-cols-2">
        <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-emerald-400/35 bg-card/45 p-4 shadow-[0_0_0_1px_rgba(16,185,129,0.08)_inset,0_0_24px_rgba(16,185,129,0.1)] sm:p-5">
          <div className="mb-3 text-center">
            <div className="mb-2 flex items-center justify-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
              <h2 className="text-2xl font-bold tracking-tight">Verified Agents</h2>
            </div>
            <Badge variant="outline">{collateralizedCount} collateralized</Badge>
            <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Agents here have posted an economic bond and passed the registry submission period.
            </p>
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            <FilterButton active={verifiedFilter === "all"} onClick={() => setVerifiedFilter("all")} label="All" />
            <FilterButton active={verifiedFilter === "active"} onClick={() => setVerifiedFilter("active")} label="Active" />
            <FilterButton active={verifiedFilter === "challenged"} onClick={() => setVerifiedFilter("challenged")} label="Challenged" />
            <FilterButton active={verifiedFilter === "removed"} onClick={() => setVerifiedFilter("removed")} label="Removed" />
          </div>

          <div className="max-h-[30rem] min-h-[18rem] flex-1 space-y-2 overflow-auto pr-1">
            {loading && verified.length === 0 ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading verified agents...
              </div>
            ) : error ? (
              <div className="rounded-lg border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>
            ) : (
              filteredVerified.map((item) => (
                <Link
                  key={`${item.network}:${item.id}`}
                  href={withEnvironment(
                    item.lookupByAgentId
                      ? `/agents/${encodeURIComponent(item.agentId)}?network=${item.network}&lookup=agentId`
                      : `/agents/${encodeURIComponent(item.id)}?network=${item.network}`
                  )}
                  className="block min-w-0 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 hover:border-emerald-500/40"
                >
                  <div className="truncate text-sm font-medium">{item.name}</div>
                  <div className="mt-1 truncate font-mono text-xs text-muted-foreground">Agent {item.agentId}</div>
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{getAgentSubgraphLabel(item.network)}</span>
                    <Badge className={`shrink-0 ${verifiedTone(item.status)}`}>{item.status.toUpperCase()}</Badge>
                    <span className="truncate">{item.curateStatus}</span>
                  </div>
                </Link>
              ))
            )}
            {!loading && !error && filteredVerified.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/50 p-4 text-sm text-muted-foreground">
                No agents match this status.
              </div>
            ) : null}
          </div>

          <Button asChild variant="outline" className="mt-3 w-full">
            <Link href={withEnvironment("/verified")}>Open verified registry</Link>
          </Button>
        </section>

        <section className="flex min-h-[34rem] min-w-0 flex-col rounded-xl border border-amber-400/25 bg-card/35 p-5">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-300" />
            <h2 className="text-2xl font-bold tracking-tight">Moderate</h2>
            <Badge className="ml-auto border-amber-400/30 bg-amber-400/10 text-amber-200">Coming soon</Badge>
          </div>
          <div className="my-auto py-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-amber-300/25 bg-amber-300/10">
              <ShieldAlert className="h-6 w-6 text-amber-200" />
            </div>
            <h3 className="mt-5 text-xl font-semibold">Community moderation is being prepared</h3>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              Abuse reports, answers, and arbitration controls will appear here when the moderation workflow is ready.
            </p>
          </div>
          <Button variant="outline" className="w-full" disabled>
            Moderation coming soon
          </Button>
        </section>
      </div>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <Button variant={active ? "default" : "outline"} size="sm" onClick={onClick}>
      {label}
    </Button>
  );
}
