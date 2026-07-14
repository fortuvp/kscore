"use client";

import * as React from "react";
import Link from "next/link";
import { RefreshCw, Star } from "lucide-react";
import { useAccount } from "wagmi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useVerificationEnvironment } from "@/components/verification-environment-provider";
import type { AgentSubgraphNetwork } from "@/lib/agent-networks";
import { getDisplayName } from "@/lib/format";
import { computeAgentQualityScore } from "@/lib/quality-score";
import {
  buildSnapshot,
  diffSnapshot,
  listWatchlist,
  refreshWatchSnapshot,
  toggleWatchlist,
  type WatchlistItem,
} from "@/lib/watchlist";
import type { AgentWithDetails } from "@/types/agent";

type WatchRow = WatchlistItem & {
  agent: AgentWithDetails | null;
  changes: string[];
};

export function AccountWatchlist() {
  const { address, isConnected } = useAccount();
  const { environment, withEnvironment } = useVerificationEnvironment();
  const [rows, setRows] = React.useState<WatchRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    const items = listWatchlist(address);
    const resolved = await Promise.all(
      items.map(async (item): Promise<WatchRow> => {
        try {
          const response = await fetch(
            `/api/agents/${encodeURIComponent(item.id)}?network=${encodeURIComponent(item.network)}&verificationEnvironment=${environment}`,
            { cache: "no-store", signal }
          );
          const json = await response.json();
          const agent = (json?.success ? (json.agent as AgentWithDetails) : null) || null;
          if (!agent) return { ...item, agent: null, changes: ["Agent no longer resolvable"] };

          const validations = Number.parseInt(agent.stats?.totalValidations || "0", 10) || 0;
          const nextSnapshot = buildSnapshot(agent, validations);
          const changes = diffSnapshot(item.snapshot, nextSnapshot);
          refreshWatchSnapshot(item.id, item.network, nextSnapshot, address);
          return { ...item, agent, changes };
        } catch {
          return { ...item, agent: null, changes: ["Failed to refresh"] };
        }
      })
    );

    if (!signal?.aborted) {
      setRows(resolved);
      setLoading(false);
    }
  }, [address, environment]);

  React.useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return (
    <section id="watchlist" className="mt-12 scroll-mt-24 border-t border-border/60 pt-10">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Star className="h-5 w-5 text-amber-200" />
          <h2 className="text-xl font-semibold">Watchlist</h2>
          {!loading ? <Badge variant="outline">{rows.length}</Badge> : null}
        </div>
        <Button
          type="button"
          size="icon"
          variant="outline"
          title="Refresh watchlist"
          aria-label="Refresh watchlist"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <p className="mb-5 text-xs text-muted-foreground">
        Saved in this browser for {isConnected && address ? "the connected wallet" : "the guest profile"}.
      </p>

      {loading ? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
          Loading watchlist...
        </div>
      ) : rows.length ? (
        <div className="divide-y divide-border/60 border-y border-border/60">
          {rows.map((row) => (
            <article key={row.key} className="py-4">
              {row.agent ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <Link
                      href={withEnvironment(`/agents/${encodeURIComponent(row.id)}?network=${row.network}`)}
                      className="block truncate text-lg font-semibold hover:underline"
                    >
                      {getDisplayName(row.agent)}
                    </Link>
                    <div className="mt-1 text-xs text-muted-foreground">{row.network}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {row.changes.length ? (
                        row.changes.map((change) => (
                          <Badge
                            key={`${row.key}-${change}`}
                            variant="outline"
                            className="border-amber-500/30 bg-amber-500/10 text-amber-200"
                          >
                            {change}
                          </Badge>
                        ))
                      ) : (
                        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                          No changes
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline">Quality {computeAgentQualityScore(row.agent)}</Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        toggleWatchlist(row.agent!, row.network as AgentSubgraphNetwork, 0, address);
                        void load();
                      }}
                    >
                      Unstar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Unable to load this watched agent.</div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="border-y border-border/60 py-12 text-center text-sm text-muted-foreground">
          Your watchlist is empty. Star agents from the registry to track them here.
        </div>
      )}
    </section>
  );
}
