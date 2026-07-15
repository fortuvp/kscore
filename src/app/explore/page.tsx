"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  MessageSquare,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { formatUnits } from "viem";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAgentNetworkFromChainId } from "@/lib/block-explorer";
import { getDisplayName } from "@/lib/format";
import {
  getAgentSubgraphLabel,
  type AgentSubgraphNetwork,
} from "@/lib/agent-networks";
import type { Agent } from "@/types/agent";
import { useVerificationEnvironment } from "@/components/verification-environment-provider";
import { AgentImage } from "@/components/agents/agent-image";

type RankedAgent = {
  id: string;
  name: string;
  network: AgentSubgraphNetwork;
  totalFeedback: number;
};

type ActivityItem = {
  kind: "created" | "updated" | "active";
  id: string;
  agentId: string;
  name: string;
  network: AgentSubgraphNetwork;
  timestamp: number;
};

type StatsResponse = {
  success: boolean;
  generatedAt: string;
  stats: {
    totalAgents: number;
    active7d: number;
    totalReviews: number;
  };
  lists: {
    trending: RankedAgent[];
    topRated: RankedAgent[];
    mostReviewed: RankedAgent[];
  };
  activityPreview: ActivityItem[];
};

type HighlightsResponse = {
  success: boolean;
  verifiedAgents: Array<{
    id: string;
    agentId: string;
    name: string;
    network: AgentSubgraphNetwork;
    curateItemUrl?: string;
    stake?: string;
    verifiedAt?: number;
  }>;
  verifiedStakeSymbol?: string;
  verifiedStakeDecimals?: number;
  moderation: Array<{
    questionId: string;
    created: number;
    question: string;
    agentId: string | null;
    finalized: boolean;
    answer: "YES" | "NO" | "UNKNOWN" | "OPEN";
  }>;
};

type AgentPreview = {
  image: string | null;
  description: string | null;
};

type ActivityDigest = {
  id: string;
  name: string;
  agentId: string;
  network: AgentSubgraphNetwork;
  latestTimestamp: number;
  created?: number;
  updated?: number;
  active?: number;
};

const EXPLORE_STATS_SAMPLE_SIZE = 3000;
const EXPLORE_SEARCH_TIMEOUT_MS = 5000;

function formatAgo(timestamp: number) {
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, now - timestamp);
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatStake(raw: string | undefined, decimals = 18) {
  try {
    const value = Number(formatUnits(BigInt(raw || "0"), decimals));
    if (!Number.isFinite(value)) return "0";
    if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  } catch {
    return "0";
  }
}

function parseStake(raw: string | undefined) {
  try {
    return BigInt(raw || "0");
  } catch {
    return 0n;
  }
}

export default function ExplorePage() {
  const { environment, withEnvironment } = useVerificationEnvironment();
  const [verifiedFilter, setVerifiedFilter] = React.useState<"highestStake" | "latest">("highestStake");
  const [query, setQuery] = React.useState("");
  const [searchedAgents, setSearchedAgents] = React.useState<Agent[]>([]);
  const [searchingAgents, setSearchingAgents] = React.useState(false);
  const [hasSearchedAgents, setHasSearchedAgents] = React.useState(false);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const [stats, setStats] = React.useState<StatsResponse | null>(null);
  const [highlights, setHighlights] = React.useState<HighlightsResponse | null>(null);
  const [previewByKey, setPreviewByKey] = React.useState<Record<string, AgentPreview>>({});
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    const loadStats = (async () => {
      try {
        const statsRes = await fetch(`/api/stats?sampleSize=${EXPLORE_STATS_SAMPLE_SIZE}`, {
          cache: "no-store",
          signal,
        });
        const statsJson = (await statsRes.json()) as StatsResponse;
        if (statsJson.success) setStats(statsJson);
      } catch {
        // Keep previous stats if the sample fails to load.
      }
    })();

    try {
      const highlightsRes = await fetch(`/api/home/highlights?verificationEnvironment=${environment}`, {
        cache: "no-store",
        signal,
      });
      const highlightsJson = (await highlightsRes.json()) as HighlightsResponse;
      if (!signal?.aborted && highlightsJson.success) setHighlights(highlightsJson);
    } catch {
      // Keep previous highlights if the request fails.
    } finally {
      if (!signal?.aborted) setLoading(false);
    }

    void loadStats;
  }, [environment]);

  React.useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const runAgentSearch = React.useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      setHasSearchedAgents(false);
      setSearchedAgents([]);
      setSearchError(null);
      return;
    }

    setSearchingAgents(true);
    setHasSearchedAgents(true);
    setSearchError(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), EXPLORE_SEARCH_TIMEOUT_MS);
    try {
      const res = await fetch(`/api/agents?q=${encodeURIComponent(trimmed)}&pageSize=12&network=all&verificationEnvironment=${environment}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `Search failed (${res.status})`);

      if (json?.success && json.items?.length > 0) {
        setSearchedAgents(json.items as Agent[]);
      } else {
        setSearchedAgents([]);
      }
    } catch (error) {
      console.error(error);
      setSearchedAgents([]);
      setSearchError(
        error instanceof DOMException && error.name === "AbortError"
          ? "Search timed out. Try a more specific name."
          : error instanceof Error
            ? error.message
            : "Search failed"
      );
    } finally {
      window.clearTimeout(timeout);
      setSearchingAgents(false);
    }
  }, [environment, query]);

  React.useEffect(() => {
    if (query.trim()) return;
    setHasSearchedAgents(false);
    setSearchedAgents([]);
    setSearchError(null);
  }, [query]);

  React.useEffect(() => {
    let cancelled = false;
    async function hydratePreviews() {
      if (!stats) return;
      const ranked = [...(stats.lists.topRated || []).slice(0, 14), ...(stats.lists.mostReviewed || []).slice(0, 14)];

      const unique = new Map<string, RankedAgent>();
      for (const item of ranked) unique.set(`${item.network}:${item.id}`, item);

      const toFetch = Array.from(unique.values()).filter((item) => !previewByKey[`${item.network}:${item.id}`]);
      if (!toFetch.length) return;

      const updates = await Promise.all(
        toFetch.map(async (item) => {
          const key = `${item.network}:${item.id}`;
          try {
            const res = await fetch(`/api/agents/${encodeURIComponent(item.id)}?network=${encodeURIComponent(item.network)}&verificationEnvironment=${environment}`, {
              cache: "no-store",
            });
            if (!res.ok) return [key, { image: null, description: null }] as const;
            const json = await res.json();
            const agent = json?.agent;
            return [
              key,
              {
                image: agent?.registrationFile?.image || null,
                description: agent?.registrationFile?.description || null,
              },
            ] as const;
          } catch {
            return [key, { image: null, description: null }] as const;
          }
        })
      );

      if (cancelled) return;
      setPreviewByKey((prev) => {
        const next = { ...prev };
        for (const [key, value] of updates) next[key] = value;
        return next;
      });
    }

    void hydratePreviews();
    return () => {
      cancelled = true;
    };
  }, [environment, stats, previewByKey]);

  const activityCards = React.useMemo(() => {
    if (!stats?.activityPreview?.length) return [] as ActivityDigest[];
    const byAgent = new Map<string, ActivityDigest>();

    for (const event of stats.activityPreview) {
      const key = `${event.network}:${event.id}`;
      const current = byAgent.get(key) || {
        id: event.id,
        name: event.name,
        agentId: event.agentId,
        network: event.network,
        latestTimestamp: event.timestamp,
      };
      if (event.kind === "created") current.created = Math.max(current.created || 0, event.timestamp);
      if (event.kind === "updated") current.updated = Math.max(current.updated || 0, event.timestamp);
      if (event.kind === "active") current.active = Math.max(current.active || 0, event.timestamp);
      current.latestTimestamp = Math.max(current.latestTimestamp, event.timestamp);
      byAgent.set(key, current);
    }

    return Array.from(byAgent.values())
      .sort((a, b) => b.latestTimestamp - a.latestTimestamp)
      .slice(0, 8);
  }, [stats?.activityPreview]);

  const visibleVerifiedAgents = React.useMemo(() => {
    const rows = [...(highlights?.verifiedAgents || [])];

    rows.sort((a, b) => {
      if (verifiedFilter === "latest") {
        return (Number(b.verifiedAt) || 0) - (Number(a.verifiedAt) || 0);
      }

      const stakeA = parseStake(a.stake);
      const stakeB = parseStake(b.stake);
      if (stakeA === stakeB) return (Number(b.verifiedAt) || 0) - (Number(a.verifiedAt) || 0);
      return stakeA > stakeB ? -1 : 1;
    });

    return rows;
  }, [highlights?.verifiedAgents, verifiedFilter]);

  const mostStakedKey = React.useMemo(() => {
    let winner = "";
    let largestStake = -1n;
    for (const item of highlights?.verifiedAgents || []) {
      const stake = parseStake(item.stake);
      if (stake > largestStake) {
        largestStake = stake;
        winner = `${item.network}:${item.id}`;
      }
    }
    return winner;
  }, [highlights?.verifiedAgents]);

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,#010308_0%,#03070e_52%,#040a12_100%)]" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(152deg,rgba(34,211,238,0.08)_0%,transparent_36%)]" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(24deg,rgba(16,185,129,0.06)_0%,transparent_34%)]" />

      <main className="container mx-auto max-w-[1200px] px-5 py-12 sm:px-8 sm:py-16">
        <section className="mb-10">
          <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">Explore The KSCORE Ecosystem</h1>
          <p className="mt-3 max-w-3xl text-lg text-white/75">
            Discover verified agents and review portable reputation before interacting.
          </p>
        </section>

        <>
          <section className="grid items-stretch gap-5 lg:grid-cols-[minmax(0,3.25fr)_minmax(16rem,1fr)]">
            <div className="relative min-w-0 overflow-hidden rounded-2xl border border-emerald-300/25 bg-[linear-gradient(145deg,rgba(16,185,129,0.11),rgba(6,182,212,0.055)_48%,rgba(0,0,0,0.28))] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.28),0_0_40px_rgba(16,185,129,0.07)] sm:p-5">
              <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-emerald-300/8 blur-3xl" />

              <div className="relative mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-300/25 bg-emerald-300/12 shadow-[0_0_24px_rgba(16,185,129,0.13)]">
                    <ShieldCheck className="h-5 w-5 text-emerald-200" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200/65">Collateral leaderboard</div>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight text-white">Verified agents (Curate)</h2>
                    <p className="mt-1 text-xs leading-relaxed text-white/55">Policy-compliant agents, ranked by collateralized stake.</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-lg border border-white/10 bg-black/25 p-1" role="group" aria-label="Sort verified agents">
                    <button
                      type="button"
                      aria-pressed={verifiedFilter === "highestStake"}
                      onClick={() => setVerifiedFilter("highestStake")}
                      className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-300/40 ${
                        verifiedFilter === "highestStake"
                          ? "bg-emerald-300/18 text-emerald-100 shadow-sm"
                          : "text-white/55 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      Highest stake
                    </button>
                    <button
                      type="button"
                      aria-pressed={verifiedFilter === "latest"}
                      onClick={() => setVerifiedFilter("latest")}
                      className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-300/40 ${
                        verifiedFilter === "latest"
                          ? "bg-emerald-300/18 text-emerald-100 shadow-sm"
                          : "text-white/55 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      Latest
                    </button>
                  </div>
                  <Link
                    href={withEnvironment("/verified")}
                    className="inline-flex h-9 items-center rounded-lg border border-cyan-300/20 bg-cyan-300/8 px-3 text-xs font-medium text-cyan-100 outline-none transition hover:border-cyan-300/35 hover:bg-cyan-300/12 focus-visible:ring-2 focus-visible:ring-cyan-300/40"
                  >
                    View all agents
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>

              <div className="relative min-h-[18rem] max-h-[23rem] overflow-x-hidden overflow-y-auto pr-1 [scrollbar-color:rgba(110,231,183,0.28)_transparent]">
                {loading && !highlights ? (
                  <div className="flex min-h-[18rem] items-center justify-center text-sm text-white/60">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading verified agents…
                  </div>
                ) : visibleVerifiedAgents.length > 0 ? (
                  <ol className="space-y-2.5">
                    {visibleVerifiedAgents.map((item, index) => {
                      const itemKey = `${item.network}:${item.id}`;
                      const href = item.curateItemUrl || withEnvironment(`/agents/${encodeURIComponent(item.id)}?network=${item.network}`);
                      const external = Boolean(item.curateItemUrl);
                      const verifiedAt = Number(item.verifiedAt || 0);
                      const isMostStaked = itemKey === mostStakedKey;
                      const stakeValue = formatStake(item.stake, Number(highlights?.verifiedStakeDecimals || 18));
                      return (
                        <li key={itemKey}>
                          <Link
                            href={href}
                            target={external ? "_blank" : undefined}
                            rel={external ? "noreferrer" : undefined}
                            className={`grid min-h-[4.75rem] min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2.5 text-white/85 outline-none transition duration-200 focus-visible:ring-2 focus-visible:ring-emerald-300/45 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:px-4 ${
                              isMostStaked
                                ? "border-emerald-300/45 bg-[linear-gradient(100deg,rgba(16,185,129,0.2),rgba(6,182,212,0.09))] shadow-[0_0_0_1px_rgba(110,231,183,0.07),0_10px_28px_rgba(16,185,129,0.14)]"
                                : "border-white/9 bg-black/20 hover:-translate-y-px hover:border-emerald-300/25 hover:bg-emerald-300/[0.06]"
                            }`}
                          >
                            <span
                              className={`row-span-2 flex h-9 w-9 items-center justify-center self-center rounded-lg border text-xs font-semibold tabular-nums ${
                                isMostStaked
                                  ? "border-emerald-200/35 bg-emerald-200/16 text-emerald-100"
                                  : "border-white/10 bg-white/[0.04] text-white/45"
                              }`}
                              aria-label={isMostStaked ? "Most staked agent" : `Rank ${index + 1}`}
                            >
                              {isMostStaked ? <Trophy className="h-4 w-4" /> : index + 1}
                            </span>

                            <div className="min-w-0 self-end sm:self-center">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate text-sm font-semibold sm:text-base">{item.name}</span>
                                {isMostStaked ? (
                                  <Badge className="shrink-0 border-emerald-200/30 bg-emerald-200/12 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide text-emerald-100">
                                    Most staked
                                  </Badge>
                                ) : null}
                              </div>
                              <div className="mt-1 truncate text-[11px] text-white/45">
                                Agent #{item.agentId} · {getAgentSubgraphLabel(item.network)}
                              </div>
                            </div>

                            <div className="col-start-2 flex min-w-0 items-end justify-between gap-3 self-start sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:flex-col sm:items-end sm:justify-center sm:self-center sm:text-right">
                              <div>
                                <div className="text-[9px] font-semibold uppercase tracking-[0.13em] text-emerald-200/55">Collateralized stake</div>
                                <div className="mt-0.5 whitespace-nowrap text-sm font-bold tabular-nums text-emerald-100 sm:text-base">
                                  {stakeValue} <span className="text-[11px] font-semibold text-emerald-200/60">{highlights?.verifiedStakeSymbol || "TOKEN"}</span>
                                </div>
                              </div>
                              <span className="shrink-0 text-[10px] text-white/38">{verifiedAt > 0 ? `Verified ${formatAgo(verifiedAt)}` : "Verified"}</span>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <div className="flex min-h-[18rem] items-center justify-center px-5 text-center text-sm text-white/55">
                    {environment === "mainnet"
                      ? "No verified agents have been submitted to the Ethereum registry yet."
                      : "Verified agents are temporarily unavailable."}
                  </div>
                )}
              </div>
            </div>

            <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-amber-200/12 bg-[linear-gradient(160deg,rgba(245,158,11,0.065),rgba(0,0,0,0.25)_52%)] p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-200/15 bg-amber-300/8">
                  <ShieldAlert className="h-4 w-4 text-amber-200/80" />
                </span>
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-amber-200/45">Community layer</div>
                  <h2 className="text-base font-semibold text-white">Moderation</h2>
                </div>
                <Badge className="ml-auto border-amber-300/20 bg-amber-300/8 text-[10px] text-amber-100/75">Coming soon</Badge>
              </div>
              <div className="flex flex-1 flex-col items-center justify-center px-2 py-10 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-200/10 bg-amber-300/[0.045]">
                  <ShieldAlert className="h-6 w-6 text-amber-200/55" />
                </span>
                <p className="mt-5 max-w-[15rem] text-sm leading-relaxed text-white/55">
                  Community reports and arbitration controls will appear here when moderation launches.
                </p>
              </div>
            </div>
          </section>

          <section className="mt-10 sm:mt-12">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => (e.key === "Enter" ? void runAgentSearch() : null)}
                  placeholder="Search by agent number"
                  className="h-11 w-full rounded-lg border border-white/20 bg-black/30 pl-10 pr-4 text-sm text-white placeholder:text-white/55 focus:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300/20"
                />
              </div>
              <Button
                className="h-11 border border-cyan-300/40 bg-cyan-300/20 text-white hover:bg-cyan-300/30"
                onClick={() => void runAgentSearch()}
                disabled={searchingAgents}
              >
                Search
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button asChild variant="outline" className="h-11 border-white/20 bg-white/5 text-white hover:bg-white/10">
                <Link href={withEnvironment("/agents?network=all")}>Explore All</Link>
              </Button>
            </div>
            {hasSearchedAgents ? (
              <div className="mt-5 rounded-xl border border-white/10 bg-black/25 p-3">
                {searchingAgents ? (
                  <div className="py-5 text-sm text-white/65">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Searching agents...
                  </div>
                ) : searchedAgents.length > 0 ? (
                  <>
                    <div className="mb-2 flex items-center justify-between text-xs text-white/55">
                      <span>
                        Showing {Math.min(8, searchedAgents.length)} of {searchedAgents.length} matches
                      </span>
                      {searchedAgents.length > 8 ? <span>Refine query for fewer results</span> : null}
                    </div>
                    <div className="max-h-[26rem] space-y-2 overflow-auto pr-1">
                      {searchedAgents.slice(0, 8).map((agent) => {
                        const network = getAgentNetworkFromChainId(agent.chainId) || "sepolia";
                        return (
                          <div
                            key={`${network}:${agent.id}`}
                            className="rounded-lg border border-white/10 bg-black/25 p-3 transition-all hover:border-white/20"
                          >
                            <div className="flex items-center justify-between gap-4">
                              <div className="min-w-0">
                                <div className="truncate text-base font-semibold text-white">{getDisplayName(agent)}</div>
                                <div className="mt-1 text-xs text-white/60">
                                  {agent.agentId} | {getAgentSubgraphLabel(network)}
                                </div>
                                {agent.registrationFile?.description ? (
                                  <div className="mt-1 truncate text-xs text-white/50">
                                    {agent.registrationFile.description}
                                  </div>
                                ) : null}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Button asChild size="sm" variant="ghost" className="rounded-lg text-white hover:bg-white/10">
                                  <Link href={withEnvironment(`/agents/${encodeURIComponent(agent.id)}?network=${network}`)}>View</Link>
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="py-5 text-sm text-white/60">
                    {searchError ? searchError : `No agents found matching "${query.trim()}"`}
                  </div>
                )}
              </div>
            ) : null}
          </section>

          <section className="mt-12 space-y-6">
            {stats ? (
              <>
              <AgentCarousel
                title="Top Rated"
                icon={Clock3}
                items={(stats?.lists.topRated || []).slice(0, 14)}
                previewByKey={previewByKey}
              />
              <AgentCarousel
                title="Most Reviewed"
                icon={MessageSquare}
                items={(stats?.lists.mostReviewed || []).slice(0, 14)}
                previewByKey={previewByKey}
              />
              </>
            ) : (
              <div className="flex items-center justify-center rounded-xl border border-white/10 bg-white/5 py-10 text-sm text-white/65">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading agent rankings...
              </div>
            )}
          </section>

          <section className="mt-12">
            <div className="mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4 text-cyan-300" />
              <h2 className="text-lg font-semibold text-white">Recent activity</h2>
            </div>
            {stats ? (
              <div className="grid gap-2 md:grid-cols-2">
                {activityCards.map((item) => (
                  <Link
                    key={`${item.network}:${item.id}`}
                    href={withEnvironment(`/agents/${encodeURIComponent(item.id)}?network=${item.network}`)}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:border-white/25"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="truncate font-medium text-white">{item.name}</div>
                      <div className="truncate text-xs text-white/65">
                        {item.agentId} | {getAgentSubgraphLabel(item.network)}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/60">
                        <span>{item.created ? `Created ${formatAgo(item.created)}` : "Created -"}</span>
                        <span>{item.updated ? `Updated ${formatAgo(item.updated)}` : "Updated -"}</span>
                        <span>{item.active ? `Active ${formatAgo(item.active)}` : "Active -"}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center rounded-xl border border-white/10 bg-white/5 py-10 text-sm text-white/65">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading recent activity...
              </div>
            )}
          </section>
        </>
      </main>
    </div>
  );
}

function AgentCarousel({
  title,
  icon: Icon,
  items,
  previewByKey,
}: {
  title: string;
  icon: React.ElementType;
  items: RankedAgent[];
  previewByKey: Record<string, AgentPreview>;
}) {
  const { withEnvironment } = useVerificationEnvironment();
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const updateScrollState = React.useCallback(() => {
    const node = scrollerRef.current;
    if (!node) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    setCanScrollLeft(node.scrollLeft > 8);
    setCanScrollRight(node.scrollLeft + node.clientWidth < node.scrollWidth - 8);
  }, []);

  React.useEffect(() => {
    updateScrollState();
    const node = scrollerRef.current;
    if (!node) return;
    const onScroll = () => updateScrollState();
    node.addEventListener("scroll", onScroll);
    window.addEventListener("resize", onScroll);
    return () => {
      node.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [items, updateScrollState]);

  const scrollByCards = (direction: "left" | "right") => {
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollBy({
      left: direction === "left" ? -280 : 280,
      behavior: "smooth",
    });
  };

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-cyan-300" />
          <h3 className="text-lg font-semibold text-white">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => scrollByCards("left")}
            disabled={!canScrollLeft}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/5 text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
            aria-label={`Scroll ${title} left`}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollByCards("right")}
            disabled={!canScrollRight}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-cyan-300/35 bg-cyan-300/12 text-cyan-100 transition hover:bg-cyan-300/22 disabled:cursor-not-allowed disabled:opacity-30"
            aria-label={`Scroll ${title} right`}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div
        ref={scrollerRef}
        className="flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => {
          const key = `${item.network}:${item.id}`;
          const preview = previewByKey[key];
          return (
            <Link
              key={`${title}-${key}`}
              href={withEnvironment(`/agents/${encodeURIComponent(item.id)}?network=${item.network}`)}
              className="group block w-[230px] shrink-0 snap-start overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] hover:border-cyan-300/40"
            >
              <div className="h-28 w-full overflow-hidden bg-gradient-to-br from-cyan-900/30 via-emerald-900/20 to-slate-900/20">
                <AgentImage
                  src={preview?.image}
                  alt={item.name}
                  className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                />
              </div>
              <div className="p-3">
                <div className="truncate text-sm font-medium text-white">{item.name}</div>
                <div className="mt-1 text-xs text-white/65">
                  {getAgentSubgraphLabel(item.network)} | Reviews {item.totalFeedback}
                </div>
                <div className="mt-2 line-clamp-2 text-xs text-white/55">
                  {preview?.description || "Open this card to view complete metadata and trust signals."}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
