"use client";

import * as React from "react";
import Link from "next/link";
import { Scale, Loader2, Search, Plus, X, Info } from "lucide-react";
import {
  AGENT_SUBGRAPH_NETWORKS,
  type AgentSubgraphNetwork,
  getAgentChainLabel,
  getAgentSubgraphLabel,
} from "@/lib/agent-networks";
import type { Agent, AgentWithDetails } from "@/types/agent";
import { getDisplayName, truncateAddress } from "@/lib/format";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getAddressExplorerUrlForNetwork } from "@/lib/block-explorer";
import { useVerificationEnvironment } from "@/components/verification-environment-provider";
import type { VerificationEnvironment } from "@/lib/verification-environment";

type ComparePick = {
  id: string;
  network: AgentSubgraphNetwork;
  name: string;
  owner: string;
};

type Compared = {
  network: AgentSubgraphNetwork;
  item: AgentWithDetails;
};

type CollateralizedStatus = "yes" | "no" | "unknown";

type SearchMode = "auto" | "name" | "agentId" | "owner" | "entityId";

const SEARCH_REQUEST_TIMEOUT_MS = 1800;

function looksLikeAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

function looksLikeAgentId(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("eip155:")) return true;
  return /^\d+$/.test(trimmed);
}

function looksLikeEntityId(value: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(value.trim());
}

function resolveSearchMode(mode: SearchMode, query: string): Exclude<SearchMode, "auto"> {
  if (mode !== "auto") return mode;
  if (looksLikeAddress(query)) return "owner";
  if (looksLikeAgentId(query)) return "agentId";
  if (looksLikeEntityId(query)) return "entityId";
  return "name";
}

function formatEpoch(seconds: string): string {
  const value = Number.parseInt(seconds, 10);
  if (!Number.isFinite(value) || value <= 0) return "-";
  return new Date(value * 1000).toLocaleDateString();
}

function yesNo(value: boolean | null | undefined): string {
  return value ? "Yes" : "No";
}

function compactList(values: string[] | null | undefined, max = 3): string {
  const items = (values || []).map((item) => item.trim()).filter(Boolean);
  if (!items.length) return "-";
  if (items.length <= max) return items.join(", ");
  return `${items.slice(0, max).join(", ")} (+${items.length - max})`;
}

async function searchAcrossNetworks(
  query: string,
  mode: SearchMode = "auto",
  verificationEnvironment: VerificationEnvironment = "testnet"
) {
  const trimmed = query.trim();
  if (!trimmed) return [] as ComparePick[];
  const effectiveMode = resolveSearchMode(mode, trimmed);
  const controllers = AGENT_SUBGRAPH_NETWORKS.map(() => new AbortController());
  const timeouts = controllers.map((controller) =>
    window.setTimeout(() => controller.abort(), SEARCH_REQUEST_TIMEOUT_MS)
  );

  const groups = await Promise.allSettled(
    AGENT_SUBGRAPH_NETWORKS.map(async (network, index) => {
      const toPicks = (items: Agent[]) =>
        items.map((item) => ({
          id: item.id,
          network,
          name: getDisplayName(item),
          owner: item.owner,
        }));

      if (effectiveMode === "owner") {
        const res = await fetch(
          `/api/agents/by-owner?owner=${encodeURIComponent(trimmed)}&network=${encodeURIComponent(network)}&first=20&skip=0&verificationEnvironment=${verificationEnvironment}`,
          { cache: "no-store", signal: controllers[index].signal }
        );
        if (!res.ok) return [] as ComparePick[];
        const json = await res.json();
        return toPicks((json?.items || []) as Agent[]);
      }

      if (effectiveMode === "agentId") {
        const res = await fetch(
          `/api/agents/by-agent-id?agentId=${encodeURIComponent(trimmed)}&network=${encodeURIComponent(network)}&verificationEnvironment=${verificationEnvironment}`,
          { cache: "no-store", signal: controllers[index].signal }
        );
        if (!res.ok) return [] as ComparePick[];
        const json = await res.json();
        return json?.success && json?.item ? toPicks([json.item as Agent]) : ([] as ComparePick[]);
      }

      if (effectiveMode === "entityId") {
        const res = await fetch(
          `/api/agents/${encodeURIComponent(trimmed)}?network=${encodeURIComponent(network)}&verificationEnvironment=${verificationEnvironment}`,
          { cache: "no-store", signal: controllers[index].signal }
        );
        if (!res.ok) return [] as ComparePick[];
        const json = await res.json();
        return json?.success && json?.agent ? toPicks([json.agent as Agent]) : ([] as ComparePick[]);
      }

      const res = await fetch(
        `/api/agents?q=${encodeURIComponent(trimmed)}&network=${encodeURIComponent(network)}&pageSize=8&verificationEnvironment=${verificationEnvironment}`,
        { cache: "no-store", signal: controllers[index].signal }
      );
      if (!res.ok) return [] as ComparePick[];
      const json = await res.json();
      return toPicks((json?.items || []) as Agent[]);
    })
  );

  for (const timeout of timeouts) window.clearTimeout(timeout);

  const unique = new Map<string, ComparePick>();
  for (const group of groups) {
    if (group.status !== "fulfilled") continue;
    for (const item of group.value) {
      unique.set(`${item.network}:${item.id}`, item);
    }
  }

  return Array.from(unique.values()).slice(0, 20);
}

async function resolveDetails(
  selected: ComparePick[],
  verificationEnvironment: VerificationEnvironment
): Promise<Compared[]> {
  const rows = await Promise.all(
    selected.map(async (pick) => {
      const res = await fetch(`/api/agents/${encodeURIComponent(pick.id)}?network=${encodeURIComponent(pick.network)}&verificationEnvironment=${verificationEnvironment}`, {
        cache: "no-store",
      });
      if (!res.ok) return null;
      const json = await res.json();
      if (!json?.success || !json?.agent) return null;
      return {
        network: pick.network,
        item: json.agent as AgentWithDetails,
      } satisfies Compared;
    })
  );
  return rows.filter((row): row is Compared => !!row);
}

export default function ComparePage() {
  const { environment } = useVerificationEnvironment();
  const [query, setQuery] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<ComparePick[]>([]);
  const [selected, setSelected] = React.useState<ComparePick[]>([]);
  const [rows, setRows] = React.useState<Compared[]>([]);
  const [collateralizedByKey, setCollateralizedByKey] = React.useState<Map<string, CollateralizedStatus>>(new Map());
  const [searching, setSearching] = React.useState(false);
  const [loadingCompare, setLoadingCompare] = React.useState(false);

  React.useEffect(() => {
    const handle = window.setTimeout(async () => {
      if (!query.trim()) {
        setSuggestions([]);
        return;
      }
      setSearching(true);
      try {
        const found = await searchAcrossNetworks(query, "auto", environment);
        const selectedKeys = new Set(selected.map((item) => `${item.network}:${item.id}`));
        setSuggestions(found.filter((item) => !selectedKeys.has(`${item.network}:${item.id}`)));
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 260);

    return () => window.clearTimeout(handle);
  }, [environment, query, selected]);

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      if (selected.length < 2) {
        setRows([]);
        return;
      }
      setLoadingCompare(true);
      try {
        const details = await resolveDetails(selected, environment);
        if (!cancelled) setRows(details);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoadingCompare(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [environment, selected]);

  React.useEffect(() => {
    let cancelled = false;
    async function loadCollateralized() {
      if (!rows.length) {
        setCollateralizedByKey(new Map());
        return;
      }

      const entries = await Promise.all(
        rows.map(async (row) => {
          const key = `${row.network}:${row.item.id}`;
          try {
            const res = await fetch(
              `/api/kleros/verification?agentId=${encodeURIComponent(row.item.agentId)}&network=${encodeURIComponent(row.network)}&verificationEnvironment=${environment}`,
              { cache: "no-store" }
            );
            if (!res.ok) return [key, "unknown"] as const;
            const json = await res.json();
            return [key, json?.success && json?.verified ? "yes" : "no"] as const;
          } catch {
            return [key, "unknown"] as const;
          }
        })
      );

      if (cancelled) return;
      const next = new Map<string, CollateralizedStatus>();
      for (const [key, value] of entries) next.set(key, value);
      setCollateralizedByKey(next);
    }
    void loadCollateralized();
    return () => {
      cancelled = true;
    };
  }, [environment, rows]);

  const collateralizedLabel = (
    <span className="inline-flex items-center gap-1.5">
      Collateralized
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-border/60 text-muted-foreground"
            title="This agent locked a deposit as proof of trustability. The deposit can be forfeited if misconduct is proven."
          >
            <Info className="h-3 w-3" />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">
          This agent locked a deposit as proof of trustability. The deposit can be forfeited if misconduct is proven.
        </TooltipContent>
      </Tooltip>
    </span>
  );

  const addPick = (pick: ComparePick) => {
    setSelected((prev) => {
      if (prev.some((item) => item.id === pick.id && item.network === pick.network)) return prev;
      if (prev.length >= 4) return prev;
      return [...prev, pick];
    });
    setQuery("");
    setSuggestions([]);
  };

  const removePick = (pick: ComparePick) => {
    setSelected((prev) => prev.filter((item) => !(item.id === pick.id && item.network === pick.network)));
  };

  return (
    <div className="container mx-auto max-w-7xl px-6 py-10">
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-3">
          <Scale className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Agent Compare</h1>
        </div>
        <p className="text-muted-foreground">
          Quick-search and add agents one by one, then compare quality, endpoints, ratings, validations, and activity.
        </p>
      </div>

      <section className="rounded-xl border border-border/50 bg-card/40 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by agent number"
            className="h-11 w-full rounded-lg border border-border/50 bg-background pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {selected.map((pick) => (
            <button
              key={`${pick.network}:${pick.id}`}
              type="button"
              onClick={() => removePick(pick)}
              className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background px-3 py-1 text-xs hover:border-red-400/40 hover:text-red-300"
              title="Remove from comparison"
            >
              {pick.name} ({getAgentSubgraphLabel(pick.network)})
              <X className="h-3 w-3" />
            </button>
          ))}
          {!selected.length ? (
            <span className="text-xs text-muted-foreground">Select 2 to 4 agents.</span>
          ) : null}
        </div>

        {query.trim() ? (
          <div className="mt-3 rounded-lg border border-border/50 bg-background/70 p-2">
            {searching ? (
              <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching...
              </div>
            ) : suggestions.length ? (
              <div className="space-y-1">
                {suggestions.map((pick) => (
                  <button
                    key={`suggest-${pick.network}:${pick.id}`}
                    type="button"
                    disabled={selected.length >= 4}
                    onClick={() => addPick(pick)}
                    className="flex w-full items-center justify-between rounded-md border border-transparent px-3 py-2 text-left hover:border-border hover:bg-muted/30 disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{pick.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {truncateAddress(pick.owner)} | {getAgentSubgraphLabel(pick.network)}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-primary">
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-2 py-2 text-sm text-muted-foreground">No matches.</div>
            )}
          </div>
        ) : null}
      </section>

      {loadingCompare ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Building comparison...
        </div>
      ) : null}

      {rows.length >= 2 ? (
        <div className="mt-6 overflow-x-auto rounded-xl border border-border/50">
          <table className="min-w-full table-fixed">
            <thead className="bg-muted/30">
              <tr className="text-left text-base">
                <th className="w-[220px] px-4 py-3 font-medium">Metric</th>
                {rows.map((row) => (
                  <th key={`${row.network}-${row.item.id}`} className="w-[260px] px-4 py-3 font-medium align-top">
                    <Link
                      href={`/agents/${encodeURIComponent(row.item.id)}?network=${row.network}`}
                      className="hover:underline"
                    >
                      {getDisplayName(row.item)}
                    </Link>
                    <div className="text-xs text-muted-foreground">{getAgentSubgraphLabel(row.network)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-base">
              <CompareSectionRow columns={rows.length + 1} title="Trust" />
              <CompareRow
                label={collateralizedLabel}
                values={rows.map((r) => {
                  const key = `${r.network}:${r.item.id}`;
                  const value = collateralizedByKey.get(key);
                  if (!value || value === "unknown") {
                    return <span key={`${key}-collateral`} className="text-muted-foreground">-</span>;
                  }
                  if (value === "yes") {
                    return (
                      <span key={`${key}-collateral`} className="inline-flex rounded-full border border-emerald-400/40 bg-emerald-400/15 px-3 py-1 text-sm font-semibold text-emerald-300">
                        YES
                      </span>
                    );
                  }
                  return (
                    <span key={`${key}-collateral`} className="inline-flex rounded-full border border-border/50 bg-muted/40 px-3 py-1 text-sm font-medium text-muted-foreground">
                      NO
                    </span>
                  );
                })}
                labelClassName="text-[15px] font-semibold"
              />
              <CompareRow
                label="Moderation"
                values={rows.map((r) => (
                  <span key={`${r.network}:${r.item.id}:moderation`} className="text-amber-300">
                    Coming soon
                  </span>
                ))}
                labelClassName="font-semibold"
              />
              <CompareRow label="Total feedback" values={rows.map((r) => r.item.totalFeedback || "0")} />
              <CompareRow label="Total validations" values={rows.map((r) => r.item.stats?.totalValidations || "0")} />

              <CompareSectionRow columns={rows.length + 1} title="Identity" />
              <CompareRow label="Agent ID" values={rows.map((r) => r.item.agentId || "-")} />
              <CompareRow label="Chain" values={rows.map((r) => getAgentChainLabel(r.item.chainId, r.network))} />
              <CompareRow
                label="Owner"
                values={rows.map((r) => {
                  const href = getAddressExplorerUrlForNetwork(r.item.owner, r.network);
                  if (!href) return truncateAddress(r.item.owner);
                  return (
                    <a
                      key={`${r.network}:${r.item.id}:owner`}
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="underline-offset-2 hover:text-primary hover:underline"
                    >
                      {truncateAddress(r.item.owner)}
                    </a>
                  );
                })}
              />
              <CompareRow label="Created" values={rows.map((r) => formatEpoch(r.item.createdAt))} />
              <CompareRow label="Last updated" values={rows.map((r) => formatEpoch(r.item.updatedAt))} />
              <CompareRow label="Last activity" values={rows.map((r) => formatEpoch(r.item.lastActivity))} />

              <CompareSectionRow columns={rows.length + 1} title="Integrations" />
              <CompareRow label="Active status" values={rows.map((r) => yesNo(r.item.registrationFile?.active))} />
              <CompareRow label="MCP endpoint" values={rows.map((r) => yesNo(!!r.item.registrationFile?.mcpEndpoint))} />
              <CompareRow label="A2A endpoint" values={rows.map((r) => yesNo(!!r.item.registrationFile?.a2aEndpoint))} />
              <CompareRow label="x402 support" values={rows.map((r) => yesNo(r.item.registrationFile?.x402Support))} />
              <CompareRow label="MCP tools" values={rows.map((r) => compactList(r.item.registrationFile?.mcpTools))} />
              <CompareRow label="A2A skills" values={rows.map((r) => compactList(r.item.registrationFile?.a2aSkills))} />
              <CompareRow
                label="Supported trusts"
                values={rows.map((r) => compactList(r.item.registrationFile?.supportedTrusts))}
                valueClassName="break-words whitespace-normal"
              />
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed border-border/50 p-6 text-sm text-muted-foreground">
          Add at least two agents to start comparison.
        </div>
      )}
    </div>
  );
}

function CompareSectionRow({ columns, title }: { columns: number; title: string }) {
  return (
    <tr className="border-t border-border/40 bg-muted/20">
      <td colSpan={columns} className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-cyan-300">
        {title}
      </td>
    </tr>
  );
}

function CompareRow({
  label,
  values,
  labelClassName,
  valueClassName,
}: {
  label: React.ReactNode;
  values: React.ReactNode[];
  labelClassName?: string;
  valueClassName?: string;
}) {
  return (
    <tr className="border-t border-border/40">
      <td className={`w-[220px] px-4 py-3 align-top font-medium ${labelClassName || ""}`}>{label}</td>
      {values.map((value, index) => (
        <td key={index} className={`px-4 py-3 align-top text-muted-foreground ${valueClassName || "break-words whitespace-normal"}`}>
          {value}
        </td>
      ))}
    </tr>
  );
}
