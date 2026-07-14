"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Grid2X2,
  List,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getAgentSubgraphLabel, isAgentSubgraphNetwork, type AgentSubgraphNetwork } from "@/lib/agent-networks";
import { getDisplayName } from "@/lib/format";
import { getAgentNetworkFromChainId, parseChainId } from "@/lib/block-explorer";
import { loadCurateRegistrationFile } from "@/lib/curate-agent-fallback";
import { formatEther } from "viem";
import { useReadContract } from "wagmi";
import { ERC20_ABI } from "@/lib/abi/erc20";
import { useVerificationEnvironment } from "@/components/verification-environment-provider";
import { AgentImage } from "@/components/agents/agent-image";
import { cn } from "@/lib/utils";

type AgentStatus = "active" | "review" | "removed" | "withdrawn";
type VerifiedFilter = "all" | AgentStatus;
type VerifiedSort = "verifiedNewest" | "verifiedOldest" | "collateralLargest";
type ViewMode = "cards" | "list";

const VIEW_STORAGE_KEY = "verified-agents-view";

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
  | {
      success: true;
      verificationEnvironment: "testnet" | "mainnet";
      chainId: number;
      items: PgtcrItemRow[];
      skip: number;
      first: number;
    }
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
  lookupAttempted?: boolean;
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

function mapStatus(item: PgtcrItemRow): AgentStatus {
  if (isWithdrawn(item)) return "withdrawn";
  if (item.status === "Absent") return "removed";
  if (item.status === "Disputed") return "review";
  const now = Math.floor(Date.now() / 1000);
  return isAccepted(item, now) ? "active" : "review";
}

function isWithdrawn(item: Pick<PgtcrItemRow, "status" | "withdrawingTimestamp">) {
  return item.status === "Absent" && Number(item.withdrawingTimestamp || "0") > 0;
}

function statusTone(status: AgentStatus) {
  if (status === "withdrawn") return "border-slate-400/30 bg-slate-400/10 text-slate-200";
  if (status === "active") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (status === "review") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  if (status === "removed") return "border-red-500/30 bg-red-500/10 text-red-300";
  return "border-white/15 bg-white/5 text-white/70";
}

function statusLabel(status: AgentStatus) {
  if (status === "review") return "In review";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatCollateral(stake: bigint): string {
  const eth = Number(formatEther(stake));
  if (!Number.isFinite(eth)) return "0";
  if (eth >= 1000) return eth.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (eth >= 1) return eth.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return eth.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export default function VerifiedAgentsPage() {
  const { environment, deployment, withEnvironment } = useVerificationEnvironment();
  const [filter, setFilter] = React.useState<VerifiedFilter>("all");
  const [sort, setSort] = React.useState<VerifiedSort>("verifiedNewest");
  const [query, setQuery] = React.useState("");
  const [viewMode, setViewMode] = React.useState<ViewMode>("cards");

  const [page, setPage] = React.useState(0);
  const pageSize = 40;

  const [items, setItems] = React.useState<PgtcrItemRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [previewByKey, setPreviewByKey] = React.useState<Record<string, AgentPreview>>({});
  const [pgtcrToken, setPgtcrToken] = React.useState<`0x${string}` | null>(null);

  React.useEffect(() => {
    try {
      const savedView = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (savedView === "cards" || savedView === "list") setViewMode(savedView);
    } catch {
      // Storage can be unavailable in privacy-focused browser contexts.
    }
  }, []);

  const changeViewMode = React.useCallback((nextView: ViewMode) => {
    setViewMode(nextView);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, nextView);
    } catch {
      // The preference remains active for this session when storage is unavailable.
    }
  }, []);

  const load = React.useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const skip = page * pageSize;
      const params = new URLSearchParams({
        skip: String(skip),
        first: String(pageSize),
        verificationEnvironment: environment,
      });
      const res = await fetch(`/api/pgtcr/items?${params.toString()}`, {
        cache: "no-store",
        signal,
      });
      const json = (await res.json()) as ItemsApiResponse;
      if (signal?.aborted) return;
      if (json.success) setItems(json.items || []);
      else setItems([]);
    } catch {
      if (!signal?.aborted) setItems([]);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [environment, page]);

  React.useEffect(() => {
    setPage(0);
    setItems([]);
    setPreviewByKey({});
    setPgtcrToken(null);
  }, [environment]);

  React.useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);


  React.useEffect(() => {
    let cancelled = false;
    async function loadToken() {
      try {
        const res = await fetch(`/api/pgtcr/registry?verificationEnvironment=${environment}`, { cache: 'no-store' });
        const json = await res.json();
        if (!cancelled && json?.success && json?.registry?.token) {
          setPgtcrToken(json.registry.token as `0x${string}`);
        }
      } catch {}
    }
    void loadToken();
    return () => { cancelled = true; };
  }, [environment]);

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
    chainId: deployment.chainId,
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

  const statusCounts = React.useMemo(() => {
    const counts: Record<VerifiedFilter, number> = {
      all: items.length,
      active: 0,
      review: 0,
      removed: 0,
      withdrawn: 0,
    };
    for (const item of items) counts[mapStatus(item)] += 1;
    return counts;
  }, [items]);

  // hydrate previews (name/image)
  React.useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      const seen = new Set<string>();
      const want = derived
        .map((r) => ({ agentId: r.key0, network: r.network }))
        .filter((r) => {
          if (!r.agentId || !isAgentSubgraphNetwork(r.network)) return false;
          const key = `${r.network}:${r.agentId}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 60);

      const missing = want.filter((r) => {
        const existing = previewByKey[`${r.network}:${r.agentId}`];
        return !existing?.resolved && !existing?.lookupAttempted;
      });
      if (!missing.length) return;

      const updates = await Promise.all(
        missing.map(async (r) => {
          try {
            const res = await fetch(
              `/api/agents/by-agent-id?agentId=${encodeURIComponent(r.agentId)}&network=${encodeURIComponent(r.network)}&verificationEnvironment=${environment}`,
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
                lookupAttempted: true,
              },
            ] as const;
          } catch {
            return [
              `${r.network}:${r.agentId}`,
              {
                id: r.agentId,
                agentId: r.agentId,
                name: `Agent #${r.agentId}`,
                image: null,
                network: r.network,
                resolved: false,
                lookupAttempted: true,
              },
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
            name: v.resolved ? v.name : existing?.name || v.name,
            image: v.image || existing?.image || null,
            lookupAttempted: v.lookupAttempted || existing?.lookupAttempted,
          };
        }
        return next;
      });
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [derived, environment, previewByKey]);

  const canPrev = page > 0;
  const canNext = items.length === pageSize; // best-effort
  const showMainnetEmpty =
    environment === "mainnet" &&
    filter === "all" &&
    !normalizedQuery &&
    items.length === 0;

  return (
    <div className="container mx-auto max-w-[1280px] overflow-x-hidden px-4 py-10 sm:px-6 sm:py-12">
      <div className="mb-8">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-300/10 shadow-[0_0_24px_rgba(16,185,129,0.12)]">
              <ShieldCheck className="h-5 w-5 text-emerald-300" />
            </span>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Verified Agents</h1>
          </div>
          <ul className="mt-4 grid gap-1.5 text-sm text-muted-foreground sm:text-base">
            <li className="relative pl-4 before:absolute before:left-0 before:top-[0.65em] before:h-1 before:w-1 before:rounded-full before:bg-cyan-300/55">Stake collateral and make your agent shine.</li>
            <li className="relative pl-4 before:absolute before:left-0 before:top-[0.65em] before:h-1 before:w-1 before:rounded-full before:bg-cyan-300/55">Browse collateralized agents and pick who to trust.</li>
            <li className="relative pl-4 before:absolute before:left-0 before:top-[0.65em] before:h-1 before:w-1 before:rounded-full before:bg-cyan-300/55">Flag rule breakers and claim the bounty.</li>
          </ul>
        </div>

      </div>

      <section
        aria-label="Agent filters"
        className="mb-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] shadow-[0_18px_45px_rgba(0,0,0,0.18)] backdrop-blur-sm"
      >
        <div className="flex flex-col gap-3 border-b border-white/8 p-3 sm:p-4 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1" htmlFor="verified-agent-search">
            <span className="sr-only">Search verified agents</span>
            <span className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center" aria-hidden="true">
              <Search className="h-4 w-4 text-muted-foreground" />
            </span>
            <input
              id="verified-agent-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by agent name or number"
              className="h-11 w-full rounded-xl border border-white/10 bg-black/25 pl-11 pr-4 text-sm shadow-inner outline-none transition placeholder:text-white/40 focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/15"
            />
          </label>

          <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
            <label className="flex h-11 min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 sm:min-w-52">
              <span className="shrink-0 text-[11px] font-medium uppercase tracking-[0.12em] text-white/45">Sort</span>
              <select
                aria-label="Sort verified agents"
                value={sort}
                onChange={(event) => setSort(event.target.value as VerifiedSort)}
                className="h-full min-w-0 flex-1 cursor-pointer bg-transparent text-sm text-white outline-none [color-scheme:dark]"
              >
                <option value="verifiedNewest">Newest verified</option>
                <option value="verifiedOldest">Oldest verified</option>
                <option value="collateralLargest">Largest collateral</option>
              </select>
            </label>

            <div
              className="grid h-11 grid-cols-2 rounded-xl border border-white/10 bg-black/20 p-1"
              role="group"
              aria-label="View layout"
            >
              <ViewModeButton
                active={viewMode === "cards"}
                label="Card view"
                icon={Grid2X2}
                onClick={() => changeViewMode("cards")}
              />
              <ViewModeButton
                active={viewMode === "list"}
                label="List view"
                icon={List}
                onClick={() => changeViewMode("list")}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 sm:p-4">
          <span className="hidden shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45 sm:block">Status</span>
          <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex w-max min-w-full gap-1 rounded-xl bg-black/15 p-1" role="group" aria-label="Filter agents by status">
              <FilterButton active={filter === "all"} onClick={() => setFilter("all")} label="All" count={statusCounts.all} />
              <FilterButton active={filter === "active"} onClick={() => setFilter("active")} label="Active" count={statusCounts.active} />
              <FilterButton active={filter === "review"} onClick={() => setFilter("review")} label="In review" count={statusCounts.review} />
              <FilterButton active={filter === "removed"} onClick={() => setFilter("removed")} label="Removed" count={statusCounts.removed} />
              <FilterButton active={filter === "withdrawn"} onClick={() => setFilter("withdrawn")} label="Withdrawn" count={statusCounts.withdrawn} />
            </div>
          </div>
        </div>
      </section>

      <aside aria-labelledby="status-guide-title" className="mb-5 rounded-2xl border border-white/8 bg-black/20 px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
          <h2 id="status-guide-title" className="shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-white/60 lg:pt-0.5">
            Status guide
          </h2>
          <dl className="grid min-w-0 flex-1 gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
            <LegendItem status="active" label="Active">
              The agent has active collateral and currently complies with the policy.
            </LegendItem>
            <LegendItem status="review" label="In review">
              Registry acceptance or a challenge outcome is still pending.
            </LegendItem>
            <LegendItem status="removed" label="Removed">
              A challenge and dispute found the agent non-compliant.
            </LegendItem>
            <LegendItem status="withdrawn" label="Withdrawn">
              Voluntarily removed from the registry without a challenge.
            </LegendItem>
          </dl>
        </div>
      </aside>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Button
            asChild
            size="sm"
            className="h-9 shrink-0 gap-1.5 rounded-lg bg-cyan-300 px-3.5 font-semibold text-[#041018] shadow-[0_8px_22px_rgba(34,211,238,0.16)] transition hover:bg-cyan-200 hover:shadow-[0_10px_26px_rgba(34,211,238,0.23)]"
          >
            <Link href={withEnvironment("/submit")}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Submit your agent
            </Link>
          </Button>
          <div className="text-sm text-muted-foreground" aria-live="polite">
            Showing <span className="font-medium text-white/85">{derived.length}</span> {derived.length === 1 ? "agent" : "agents"} · Page {page + 1}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous page"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={!canPrev}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next page"
            onClick={() => setPage((p) => p + 1)}
            disabled={!canNext}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-white/8 bg-white/[0.025] py-16 text-center text-sm text-muted-foreground">
          Loading curated agents…
        </div>
      ) : (
        <div
          className={cn(
            viewMode === "cards"
              ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              : "flex flex-col gap-3"
          )}
        >
          {derived.map(({ item, key0, network, status, collateral }) => {
            const key = `${network}:${key0}`;
            const preview = previewByKey[key];
            const name = preview?.name || `Agent ${key0 || item.itemID.slice(0, 10)}`;
            const isResolved = preview?.resolved ?? false;
            const resolvedNetwork = preview?.network || network;
            const useAgentIdLookup = !preview?.id || !isResolved || preview.id === preview.agentId || preview.id === key0;
            const targetId = useAgentIdLookup ? (preview?.agentId || key0) : preview.id;
            const href = withEnvironment(
              targetId
                ? `/agents/${encodeURIComponent(targetId)}?network=${resolvedNetwork}${useAgentIdLookup ? "&lookup=agentId" : ""}`
                : `/submissions/${encodeURIComponent(item.itemID)}`
            );

            return (
              <Link
                key={item.id}
                href={href}
                className={cn(
                  "group overflow-hidden rounded-2xl border border-cyan-400/20 bg-card/45 shadow-[0_0_0_1px_rgba(34,211,238,0.04),0_12px_30px_rgba(0,0,0,0.12)] transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300/40 hover:shadow-[0_0_0_1px_rgba(34,211,238,0.08),0_18px_35px_rgba(6,182,212,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50",
                  viewMode === "list" && "flex min-h-24 items-stretch hover:translate-y-0"
                )}
              >
                <div
                  className={cn(
                    "shrink-0 overflow-hidden bg-gradient-to-br from-cyan-900/35 via-emerald-900/20 to-slate-900/25",
                    viewMode === "cards" ? "h-32 w-full" : "w-24 sm:w-32"
                  )}
                >
                  <AgentImage
                    src={preview?.image}
                    alt={name}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
                  />
                </div>
                <div
                  className={cn(
                    "min-w-0 flex-1",
                    viewMode === "cards"
                      ? "p-4"
                      : "flex flex-col justify-center p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-4"
                  )}
                >
                  <div className="min-w-0">
                    <div className={cn("truncate font-semibold", viewMode === "cards" ? "text-base" : "text-sm sm:text-base")}>{name}</div>
                    <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                      <span className="truncate font-mono">{preview?.agentId || key0 || "-"}</span>
                      <span className="shrink-0 text-white/25">/</span>
                      <span className="shrink-0">{getAgentSubgraphLabel(resolvedNetwork)}</span>
                    </div>
                  </div>

                  <div
                    className={cn(
                      "flex min-w-0 items-end justify-between gap-3",
                      viewMode === "cards" ? "mt-4" : "mt-3 sm:mt-0 sm:shrink-0 sm:flex-col sm:items-end sm:gap-2"
                    )}
                  >
                    <div className={cn(viewMode === "list" && "sm:text-right")}>
                      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-white/40">Collateral</div>
                      <div className="mt-0.5 whitespace-nowrap text-sm font-semibold text-cyan-100">
                        {formatCollateral(collateral)} <span className="text-xs font-medium text-cyan-200/65">{tokenSymbol || ""}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <Badge className={cn("text-[10px]", statusTone(status))}>{statusLabel(status)}</Badge>
                      {Number(item.withdrawingTimestamp || "0") > 0 && status !== "withdrawn" ? (
                        <Badge
                          variant="outline"
                          className="border-amber-400/30 bg-amber-500/10 text-[10px] text-amber-300"
                        >
                          Withdrawal pending
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}

          {!derived.length ? (
            <div className="col-span-full w-full rounded-2xl border border-dashed border-cyan-300/25 bg-cyan-300/[0.04] p-8 text-center sm:p-10">
              <div className="text-base font-medium text-white">
                {showMainnetEmpty
                  ? "No verified agents on Ethereum mainnet yet"
                  : normalizedQuery
                    ? "No agents match your search"
                    : "No agents for this status"}
              </div>
              <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
                {showMainnetEmpty
                  ? "Be the first to submit an ERC-8004 agent to the mainnet Stake Curate registry. Mainnet submissions use real funds."
                  : normalizedQuery
                    ? "Try a different agent name or number."
                    : `Try another status or switch the verification registry from ${deployment.label}.`}
              </p>
              {showMainnetEmpty ? (
                <Button asChild size="sm" className="mt-4">
                  <Link href={withEnvironment("/submit")}>Submit the first agent</Link>
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-300/40",
        active
          ? "bg-white text-slate-950 shadow-sm"
          : "text-white/60 hover:bg-white/[0.06] hover:text-white"
      )}
    >
      <span>{label}</span>
      <span className={cn("text-[10px] tabular-nums", active ? "text-slate-500" : "text-white/35")}>{count}</span>
    </button>
  );
}

function ViewModeButton({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ElementType;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={cn(
        "inline-flex min-w-10 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-300/40",
        active ? "bg-white/12 text-white shadow-sm" : "text-white/45 hover:bg-white/[0.06] hover:text-white/80"
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="sr-only">{label}</span>
    </button>
  );
}

function LegendItem({
  status,
  label,
  children,
}: {
  status: AgentStatus;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-2 text-xs font-semibold text-white/85">
        <span className={cn("h-1.5 w-1.5 rounded-full border", statusTone(status))} aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-1 text-xs leading-relaxed text-white/48">{children}</dd>
    </div>
  );
}
