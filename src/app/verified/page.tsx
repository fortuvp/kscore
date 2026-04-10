"use client";

import * as React from "react";
import Link from "next/link";
import { Search, ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CollateralizeAgentDialog } from "@/components/pgtcr/collateralize-agent-dialog";
import { getAgentSubgraphLabel, isAgentSubgraphNetwork, type AgentSubgraphNetwork } from "@/lib/agent-networks";
import { getDisplayName } from "@/lib/format";
import { getAgentNetworkFromChainId, parseChainId } from "@/lib/block-explorer";
import { loadCurateRegistrationFile } from "@/lib/curate-agent-fallback";
import { formatEther } from "viem";
import { useReadContract } from "wagmi";
import { ERC20_ABI } from "@/lib/abi/erc20";

type VerifiedFilter = "all" | "active" | "challenged" | "removed";

type PgtcrItemRow = {
  id: string;
  itemID: string;
  status: "Absent" | "Submitted" | "Reincluded" | "Disputed" | string;
  includedAt: string;
  stake: string;
  withdrawingTimestamp?: string;
  metadata?: { key0?: string | null; key1?: string | null; key2?: string | null } | null;
  registry: { submissionPeriod: string; reinclusionPeriod: string };
};

type ItemsApiResponse =
  | { success: true; items: PgtcrItemRow[]; skip: number; first: number }
  | { success: false; error: string };

type AgentLookupApiResponse =
  | {
      success: true;
      found: boolean;
      network: AgentSubgraphNetwork | null;
      requestedNetwork?: AgentSubgraphNetwork | null;
      agentId: string;
      item: DisplayAgent | null;
    }
  | { success: false; error: string };

type AgentPreview = {
  id: string;
  agentId: string;
  name: string;
  image: string | null;
  network: AgentSubgraphNetwork;
  resolved: boolean;
};

type DisplayAgent = Parameters<typeof getDisplayName>[0];

function isAccepted(item: PgtcrItemRow, nowSec: number): boolean {
  const includedAt = Number(item.includedAt);
  if (!Number.isFinite(includedAt) || includedAt <= 0) return false;
  if (item.status === "Submitted") {
    const p = Number(item.registry?.submissionPeriod);
    if (!Number.isFinite(p) || p < 0) return false;
    return includedAt + p < nowSec;
  }
  if (item.status === "Reincluded") {
    const p = Number(item.registry?.reinclusionPeriod);
    if (!Number.isFinite(p) || p < 0) return false;
    return includedAt + p < nowSec;
  }
  return false;
}

function mapStatus(item: PgtcrItemRow): VerifiedFilter {
  if (item.status === "Absent") return "removed";
  if (item.status === "Disputed") return "challenged";
  const now = Math.floor(Date.now() / 1000);
  return isAccepted(item, now) ? "active" : "challenged";
}

function isWithdrawn(item: Pick<PgtcrItemRow, "status" | "withdrawingTimestamp">) {
  return item.status === "Absent" && Number(item.withdrawingTimestamp || "0") > 0;
}

function statusTone(status: VerifiedFilter) {
  if (status === "active") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (status === "challenged") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  if (status === "removed") return "border-red-500/30 bg-red-500/10 text-red-300";
  return "border-white/15 bg-white/5 text-white/70";
}

function formatCollateral(stake: bigint): string {
  const eth = Number(formatEther(stake));
  if (!Number.isFinite(eth)) return "0";
  if (eth >= 1000) return eth.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (eth >= 1) return eth.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return eth.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export default function VerifiedAgentsPage() {
  const [filter, setFilter] = React.useState<VerifiedFilter>("all");
  const [sort, setSort] = React.useState<"verifiedNewest" | "verifiedOldest" | "collateralLargest">("verifiedNewest");
  const [query, setQuery] = React.useState("");

  const [page, setPage] = React.useState(0);
  const pageSize = 40;

  const [items, setItems] = React.useState<PgtcrItemRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [previewByKey, setPreviewByKey] = React.useState<Record<string, AgentPreview>>({});
  const [pgtcrToken, setPgtcrToken] = React.useState<`0x${string}` | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const skip = page * pageSize;
      const res = await fetch(`/api/pgtcr/items?skip=${skip}&first=${pageSize}`, { cache: "no-store" });
      const json = (await res.json()) as ItemsApiResponse;
      if (json.success) setItems(json.items || []);
      else setItems([]);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page]);

  React.useEffect(() => {
    void load();
  }, [load]);


  React.useEffect(() => {
    let cancelled = false;
    async function loadToken() {
      try {
        const res = await fetch('/api/pgtcr/registry', { cache: 'no-store' });
        const json = await res.json();
        if (!cancelled && json?.success && json?.registry?.token) {
          setPgtcrToken(json.registry.token as `0x${string}`);
        }
      } catch {}
    }
    void loadToken();
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    async function hydrateFromCurateMetadata() {
      const targets = (items || [])
        .map((item) => {
          const agentId = item.metadata?.key0?.trim() || "";
          const key2 = item.metadata?.key2 || "";
          const network = (() => {
            const chainId = parseChainId(String(key2 || ""));
            if (!chainId) return "sepolia" as AgentSubgraphNetwork;
            return getAgentNetworkFromChainId(chainId) || ("sepolia" as AgentSubgraphNetwork);
          })();

          return {
            key: `${network}:${agentId}`,
            agentId,
            network,
            uri: item.metadata?.key1 || null,
          };
        })
        .filter((item) => item.agentId);

      if (!targets.length) return;

      const updates = await Promise.all(
        targets.map(async (target) => {
          const registrationFile = await loadCurateRegistrationFile(target.uri);
          return [
            target.key,
            {
              id: target.agentId,
              agentId: target.agentId,
              name: registrationFile?.name || `Agent #${target.agentId}`,
              image: registrationFile?.image || null,
              network: target.network,
              resolved: false,
            } satisfies AgentPreview,
          ] as const;
        })
      );

      if (cancelled) return;
      setPreviewByKey((prev) => {
        const next = { ...prev };
        for (const [key, value] of updates) {
          const existing = next[key];
          if (existing?.resolved) continue;
          next[key] = {
            ...existing,
            ...value,
            image: existing?.image || value.image || null,
            resolved: existing?.resolved || value.resolved,
          };
        }
        return next;
      });
    }

    void hydrateFromCurateMetadata();
    return () => {
      cancelled = true;
    };
  }, [items]);

  const tokenSymbol = useReadContract({
    address: (pgtcrToken ?? undefined) as `0x${string}` | undefined,
    abi: ERC20_ABI,
    functionName: 'symbol',
    query: { enabled: Boolean(pgtcrToken) },
  }).data as string | undefined;

  const normalizedQuery = query.trim().toLowerCase();

  const derived = React.useMemo(() => {
    const rows = (items || []).map((item) => {
      const key0 = item.metadata?.key0?.trim() || "";
      const key2 = item.metadata?.key2 || "";
      const network = (() => {
        const chainId = parseChainId(String(key2 || ""));
        if (!chainId) return "sepolia" as AgentSubgraphNetwork;
        return getAgentNetworkFromChainId(chainId) || ("sepolia" as AgentSubgraphNetwork);
      })();
      const status = mapStatus(item);
      const collateral = (() => {
        try {
          return BigInt(item.stake || "0");
        } catch {
          return 0n;
        }
      })();
      return { item, key0, network, status, collateral };
    });

    const filtered = rows.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (normalizedQuery) {
        const name = previewByKey[`${r.network}:${r.key0}`]?.name?.toLowerCase() || "";
        if (!r.key0.toLowerCase().includes(normalizedQuery) && !name.includes(normalizedQuery)) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      if (sort === "collateralLargest") {
        if (a.collateral === b.collateral) {
          const aTs = Number(a.item.includedAt) || 0;
          const bTs = Number(b.item.includedAt) || 0;
          return bTs - aTs;
        }
        return a.collateral > b.collateral ? -1 : 1;
      }
      const aTs = Number(a.item.includedAt) || 0;
      const bTs = Number(b.item.includedAt) || 0;
      return sort === "verifiedNewest" ? bTs - aTs : aTs - bTs;
    });

    return filtered;
  }, [items, filter, normalizedQuery, previewByKey, sort]);

  // hydrate previews (name/image)
  React.useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      const want = derived
        .map((r) => ({ agentId: r.key0, network: r.network }))
        .filter((r) => r.agentId && isAgentSubgraphNetwork(r.network))
        .slice(0, 60);

      const missing = want.filter((r) => !previewByKey[`${r.network}:${r.agentId}`]);
      if (!missing.length) return;

      const updates = await Promise.all(
        missing.map(async (r) => {
          try {
            const res = await fetch(
              `/api/agents/by-agent-id?agentId=${encodeURIComponent(r.agentId)}&network=${encodeURIComponent(r.network)}`,
              { cache: "no-store" }
            );
            const json = (await res.json()) as AgentLookupApiResponse;
            const agent = json.success ? json.item : null;
            const resolvedNetwork =
              json.success && json.found && json.network && isAgentSubgraphNetwork(json.network)
                ? json.network
                : r.network;
            const name = agent ? getDisplayName(agent) : `Agent ${r.agentId}`;
            const image = agent?.registrationFile?.image || null;
            return [
              `${r.network}:${r.agentId}`,
              {
                id: agent?.id || r.agentId,
                agentId: agent?.agentId || r.agentId,
                name,
                image,
                network: resolvedNetwork,
                resolved: Boolean(agent),
              },
            ] as const;
          } catch {
            return [
              `${r.network}:${r.agentId}`,
              { id: r.agentId, agentId: r.agentId, name: `Agent #${r.agentId}`, image: null, network: r.network, resolved: false },
            ] as const;
          }
        })
      );

      if (cancelled) return;
      setPreviewByKey((prev) => {
        const next = { ...prev };
        for (const [k, v] of updates) {
          const existing = next[k];
          if (existing?.resolved && !v.resolved) continue;
          next[k] = {
            ...v,
            image: v.image || existing?.image || null,
          };
        }
        return next;
      });
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [derived, previewByKey]);

  const canPrev = page > 0;
  const canNext = items.length === pageSize; // best-effort

  const [submitAgentId, setSubmitAgentId] = React.useState("");

  return (
    <div className="container mx-auto max-w-7xl overflow-x-hidden px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-300" />
            <h1 className="text-3xl font-bold tracking-tight">Verified Agents</h1>
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground sm:text-base">
            <li>Stake collateral and make your agent shine.</li>
            <li>Browse collateralized agents and pick who to trust.</li>
            <li>Flag rule breakers and claim the bounty.</li>
          </ul>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
            <input
              value={submitAgentId}
              onChange={(e) => setSubmitAgentId(e.target.value)}
              placeholder="Agent ID"
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm sm:w-40"
            />
            <CollateralizeAgentDialog
              agentId={submitAgentId.trim() || "0"}
              trigger={<Button disabled={!submitAgentId.trim()}>Submit Agent</Button>}
            />
          </div>
          <div className="text-[11px] text-muted-foreground">Tip: paste the Agent ID, then submit.</div>
        </div>
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-3">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <FilterButton active={filter === "all"} onClick={() => setFilter("all")} label="All" />
          <FilterButton active={filter === "active"} onClick={() => setFilter("active")} label="Active" />
          <FilterButton active={filter === "challenged"} onClick={() => setFilter("challenged")} label="Challenged" />
          <FilterButton active={filter === "removed"} onClick={() => setFilter("removed")} label="Removed" />
        </div>

        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Button variant={sort === "verifiedNewest" ? "default" : "outline"} size="sm" className="h-9 w-full sm:w-auto" onClick={() => setSort("verifiedNewest")}>Verified date ↓</Button>
          <Button variant={sort === "verifiedOldest" ? "default" : "outline"} size="sm" className="h-9 w-full sm:w-auto" onClick={() => setSort("verifiedOldest")}>Verified date ↑</Button>
          <Button variant={sort === "collateralLargest" ? "default" : "outline"} size="sm" className="h-9 w-full sm:w-auto" onClick={() => setSort("collateralLargest")}>Largest collateral</Button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by agent id or name"
            className="h-9 w-full rounded-md border border-border bg-background pl-10 pr-3 text-sm"
          />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          Page {page + 1} • Showing {derived.length} items
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={!canPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={!canNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-10 text-sm text-muted-foreground">Loading curated agents…</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {derived.map(({ item, key0, network, status, collateral }) => {
            const key = `${network}:${key0}`;
            const preview = previewByKey[key];
            const name = preview?.name || `Agent ${key0 || item.itemID.slice(0, 10)}`;
            const isResolved = preview?.resolved ?? false;
            const resolvedNetwork = preview?.network || network;
            const useAgentIdLookup = !preview?.id || !isResolved || preview.id === preview.agentId || preview.id === key0;
            const targetId = useAgentIdLookup ? (preview?.agentId || key0) : preview.id;
            const href = targetId
              ? `/agents/${encodeURIComponent(targetId)}?network=${resolvedNetwork}${useAgentIdLookup ? "&lookup=agentId" : ""}`
              : `/submissions/${encodeURIComponent(item.itemID)}`;

            const cardContent = (
              <>
                <div className="h-28 w-full overflow-hidden bg-gradient-to-br from-cyan-900/30 via-emerald-900/20 to-slate-900/20">
                  {preview?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview.image} alt={name} className="h-full w-full object-cover transition group-hover:scale-[1.03]" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No image</div>
                  )}
                </div>
                <div className="p-3">
                  <div className="truncate text-base font-semibold">{name}</div>
                  <div className="mt-1 text-[11px] uppercase tracking-wide text-cyan-200/85">
                    Collateral {formatCollateral(collateral)} {tokenSymbol || ""}
                  </div>
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="max-w-full truncate font-mono">{preview?.agentId || key0 || "-"}</span>
                    {!isResolved ? <span className="shrink-0 text-amber-300">agent not found</span> : null}
                    <span className="shrink-0">|</span>
                    <span className="truncate">{getAgentSubgraphLabel(resolvedNetwork)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge className={statusTone(status)}>{status.toUpperCase()}</Badge>
                    {Number(item.withdrawingTimestamp || "0") > 0 ? (
                      <Badge
                        variant="outline"
                        className={
                          isWithdrawn(item)
                            ? "text-[11px] border-red-400/30 bg-red-500/10 text-red-300"
                            : "text-[11px] border-amber-400/30 bg-amber-500/10 text-amber-300"
                        }
                      >
                        {isWithdrawn(item) ? "Withdrawn" : "Withdrawing"}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </>
            );

            return (
              <Link
                key={item.id}
                href={href}
                className="group overflow-hidden rounded-xl border border-cyan-400/25 bg-card/40 shadow-[0_0_0_1px_rgba(34,211,238,0.05),0_0_16px_rgba(34,211,238,0.09)] transition hover:border-cyan-300/35 hover:shadow-[0_0_0_1px_rgba(34,211,238,0.1),0_0_20px_rgba(34,211,238,0.13)]"
              >
                {cardContent}
              </Link>
            );
          })}

          {!derived.length ? (
            <div className="col-span-full rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
              No agents for this filter.
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function FilterButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <Button variant={active ? "default" : "outline"} size="sm" className="h-9 w-full sm:w-auto" onClick={onClick}>
      {label}
    </Button>
  );
}
