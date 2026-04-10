"use client";

import * as React from "react";
import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Package, ArrowRightLeft, ShoppingCart } from "lucide-react";
import { AGENT_SUBGRAPH_NETWORKS, getAgentSubgraphLabel, isAgentSubgraphNetwork } from "@/lib/agent-networks";
import { getAgentNetworkFromChainId, parseChainId } from "@/lib/block-explorer";
import type { AgentWithDetails } from "@/types/agent";
import { getDisplayName, truncateAddress } from "@/lib/format";
import { getAddressExplorerUrl } from "@/lib/block-explorer";
import { CreateOfferDialog } from "@/components/marketplace/create-offer-dialog";
import { PayAndCompleteButton } from "@/components/marketplace/pay-and-complete-button";
import { TransferAgentOwnershipButton } from "@/components/marketplace/transfer-agent-button";
import { ReleaseEscrowButton } from "@/components/marketplace/release-escrow-button";
import { loadSaleRequests, removeSaleRequest } from "@/lib/marketplace/storage";
import type { SaleRequest } from "@/lib/marketplace/types";
import { useEscrowTransactions } from "@/lib/marketplace/use-escrow-transactions";
import { escrowStatusLabel, EscrowStatus } from "@/lib/marketplace/escrow";
import { formatEther, formatUnits } from "viem";
import { ERC20_ABI } from "@/lib/abi/erc20";

type OwnedAgentRow = AgentWithDetails & { sourceNetwork: string };
type CuratedAgentRow = {
  id: string;
  itemID: string;
  status: string;
  stake: string;
  withdrawingTimestamp?: string;
  metadata?: { key0?: string | null; key2?: string | null } | null;
  registry?: { id?: string } | null;
};

type MyAgentsScope = "all" | "owned";
type MyAgentsStatus = "all" | "collateralized" | "absent" | "challenged";

type MyDisputeRow = {
  id: string;
  itemID: string;
  status: string;
  submitter: string;
  metadata?: { key0?: string | null; key2?: string | null } | null;
  challenges: Array<{ disputeID: string; challenger: string; createdAt: string; resolutionTime?: string | null }>;
};


export default function MarketplacePage() {
  const { address } = useAccount();

  const [agentSearch, setAgentSearch] = React.useState("");
  const [searchedAgents, setSearchedAgents] = React.useState<AgentWithDetails[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [hasSearchedAgents, setHasSearchedAgents] = React.useState(false);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const [saleRequests, setSaleRequests] = React.useState<SaleRequest[]>([]);

  const [myScope, setMyScope] = React.useState<MyAgentsScope>("all");
  const [myStatus, setMyStatus] = React.useState<MyAgentsStatus>("all");
  const [ownedAgents, setOwnedAgents] = React.useState<OwnedAgentRow[]>([]);
  const [curatedAgents, setCuratedAgents] = React.useState<CuratedAgentRow[]>([]);
  const [myAgentsLoading, setMyAgentsLoading] = React.useState(false);
  const [resolvedCurateKeys, setResolvedCurateKeys] = React.useState<Record<string, boolean>>({});
  const [curateNameByKey, setCurateNameByKey] = React.useState<Record<string, string>>({});
  const [pgtcrToken, setPgtcrToken] = React.useState<`0x${string}` | null>(null);
  const [pgtcrTokenMeta, setPgtcrTokenMeta] = React.useState<{ symbol: string | null; decimals: number | null }>({
    symbol: null,
    decimals: null,
  });
  const [myDisputes, setMyDisputes] = React.useState<MyDisputeRow[]>([]);
  const [myDisputesLoading, setMyDisputesLoading] = React.useState(false);

  const escrow = useEscrowTransactions(address);



  React.useEffect(() => {
    let cancelled = false;
    async function loadToken() {
      try {
        const res = await fetch('/api/pgtcr/registry', { cache: 'no-store' });
        const json = await res.json();
        if (!cancelled && json?.success && json?.registry?.token) {
          setPgtcrToken(json.registry.token as `0x${string}`);
          setPgtcrTokenMeta({
            symbol: json.registry.tokenSymbol ?? null,
            decimals: json.registry.tokenDecimals ?? null,
          });
        }
      } catch {}
    }
    void loadToken();
    return () => { cancelled = true; };
  }, []);

  const pgtcrTokenDecimals = useReadContract({
    address: (pgtcrToken ?? undefined) as `0x${string}` | undefined,
    abi: ERC20_ABI,
    functionName: 'decimals',
    query: { enabled: Boolean(pgtcrToken) },
  }).data as number | undefined;

  const pgtcrTokenSymbol = useReadContract({
    address: (pgtcrToken ?? undefined) as `0x${string}` | undefined,
    abi: ERC20_ABI,
    functionName: 'symbol',
    query: { enabled: Boolean(pgtcrToken) },
  }).data as string | undefined;

  const resolvedPgtcrTokenDecimals = pgtcrTokenDecimals ?? pgtcrTokenMeta.decimals ?? 18;
  const resolvedPgtcrTokenSymbol = pgtcrTokenSymbol || pgtcrTokenMeta.symbol || "";

  React.useEffect(() => {
    setSaleRequests(loadSaleRequests());
    const onStorage = () => setSaleRequests(loadSaleRequests());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const myOffersToMe = escrow.data.filter(
    (t) => address && t.receiver.toLowerCase() === address.toLowerCase() && t.status === EscrowStatus.NoDispute && t.amount > 0n
  );

  const myOffersMade = escrow.data.filter(
    (t) => address && t.sender.toLowerCase() === address.toLowerCase() && t.status === EscrowStatus.NoDispute && t.amount > 0n
  );

  const requestsToMe = saleRequests.filter(
    (r) => address && r.receiverToPay.toLowerCase() === address.toLowerCase()
  );

  async function runAgentSearch() {
    const raw = agentSearch.trim();
    if (!raw) {
      setHasSearchedAgents(false);
      setSearchedAgents([]);
      setSearchError(null);
      return;
    }
    setSearching(true);
    setHasSearchedAgents(true);
    setSearchError(null);
    try {
      const res = await fetch(
        `/api/agents?q=${encodeURIComponent(raw)}&pageSize=60`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `Search failed (${res.status})`);

      if (json?.success && json.items?.length > 0) {
        setSearchedAgents(json.items as AgentWithDetails[]);
      } else {
        setSearchedAgents([]);
      }
    } catch (e) {
      console.error(e);
      setSearchedAgents([]);
      setSearchError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  React.useEffect(() => {
    if (agentSearch.trim()) return;
    setHasSearchedAgents(false);
    setSearchedAgents([]);
    setSearchError(null);
  }, [agentSearch]);

  React.useEffect(() => {
    let cancelled = false;
    async function loadMyAgents() {
      if (!address) {
        setOwnedAgents([]);
        setCuratedAgents([]);
        return;
      }
      setMyAgentsLoading(true);
      try {
        const ownedByNetwork = await Promise.all(
          AGENT_SUBGRAPH_NETWORKS.map(async (network) => {
            try {
              const res = await fetch(`/api/agents/by-owner?owner=${encodeURIComponent(address)}&network=${network}&first=60`, { cache: "no-store" });
              const json = await res.json();
              const items = (json?.success ? json.items : []) as AgentWithDetails[];
              return items.map((i) => ({ ...i, sourceNetwork: network }));
            } catch {
              return [];
            }
          })
        );

        const curatedRes = await fetch(`/api/pgtcr/by-submitter?submitter=${encodeURIComponent(address)}&first=120`, { cache: "no-store" });
        const curatedJson = await curatedRes.json();
        const curatedItems = (curatedJson?.success ? curatedJson.items : []) as CuratedAgentRow[];

        if (cancelled) return;
        setOwnedAgents(ownedByNetwork.flat());
        setCuratedAgents(curatedItems);
      } finally {
        if (!cancelled) setMyAgentsLoading(false);
      }
    }

    void loadMyAgents();
    return () => {
      cancelled = true;
    };
  }, [address]);



  React.useEffect(() => {
    let cancelled = false;
    async function loadDisputes() {
      if (!address) {
        setMyDisputes([]);
        return;
      }
      setMyDisputesLoading(true);
      try {
        const res = await fetch(`/api/pgtcr/disputes-by-address?address=${encodeURIComponent(address)}&first=100`, { cache: "no-store" });
        const json = await res.json();
        if (!cancelled) setMyDisputes((json?.success ? json.items : []) as MyDisputeRow[]);
      } finally {
        if (!cancelled) setMyDisputesLoading(false);
      }
    }
    void loadDisputes();
    return () => { cancelled = true; };
  }, [address]);


  React.useEffect(() => {
    let cancelled = false;
    async function resolveCurateAgents() {
      const candidates = curatedAgents
        .map((c) => {
          const key0 = c.metadata?.key0?.trim() || "";
          const chainId = parseChainId(c.metadata?.key2 || "");
          const network = (chainId ? getAgentNetworkFromChainId(chainId) : null) || "sepolia";
          return { key0, network };
        })
        .filter((x) => x.key0);

      const updates: Record<string, boolean> = {};
      await Promise.all(
        candidates.map(async (c) => {
          try {
            const res = await fetch(`/api/agents/by-agent-id?agentId=${encodeURIComponent(c.key0)}&network=${encodeURIComponent(c.network)}`, { cache: "no-store" });
            const json = await res.json();
            updates[`${c.network}:${c.key0}`] = Boolean(json?.success && (json?.agent || json?.item));
          } catch {
            updates[`${c.network}:${c.key0}`] = false;
          }
        })
      );
      if (!cancelled) setResolvedCurateKeys(updates);
    }

    void resolveCurateAgents();
    return () => { cancelled = true; };
  }, [curatedAgents]);


  React.useEffect(() => {
    let cancelled = false;
    async function loadCurateNames() {
      const targets = curatedAgents
        .map((c) => {
          const key0 = c.metadata?.key0?.trim() || "";
          const chainId = parseChainId(c.metadata?.key2 || "");
          const network = (chainId ? getAgentNetworkFromChainId(chainId) : null) || "sepolia";
          return { key0, network };
        })
        .filter((x) => x.key0 && resolvedCurateKeys[`${x.network}:${x.key0}`] && !curateNameByKey[`${x.network}:${x.key0}`]);

      if (!targets.length) return;
      const updates: Record<string, string> = {};
      await Promise.all(targets.map(async (t) => {
        try {
          const res = await fetch(`/api/agents/by-agent-id?agentId=${encodeURIComponent(t.key0)}&network=${encodeURIComponent(t.network)}`, { cache: "no-store" });
          const json = await res.json();
          const agent = (json?.agent || json?.item) as AgentWithDetails | undefined;
          if (agent) updates[`${t.network}:${t.key0}`] = getDisplayName(agent);
        } catch {}
      }));
      if (!cancelled && Object.keys(updates).length) setCurateNameByKey((prev) => ({ ...prev, ...updates }));
    }
    void loadCurateNames();
    return () => { cancelled = true; };
  }, [curatedAgents, resolvedCurateKeys, curateNameByKey]);
  const myOwnedByAgentId = React.useMemo(() => {
    const map = new Map<string, OwnedAgentRow>();
    for (const a of ownedAgents) map.set(a.agentId, a);
    return map;
  }, [ownedAgents]);

  const curatedByAgentKey = React.useMemo(() => {
    const map = new Map<string, CuratedAgentRow>();
    for (const c of curatedAgents) {
      const key0 = c.metadata?.key0?.trim() || "";
      if (!key0) continue;
      const chainId = parseChainId(c.metadata?.key2 || "");
      const network = (chainId ? getAgentNetworkFromChainId(chainId) : null) || "sepolia";
      map.set(`${network}:${key0.toLowerCase()}`, c);
    }
    return map;
  }, [curatedAgents]);

  const myRows = React.useMemo(() => {
    const rows: Array<{
      key: string;
      agentId?: string;
      name: string;
      href: string;
      network: string;
      source: "owned" | "curate";
      curateStatus?: string;
      collateral?: string;
      resolved: boolean;
    }> = [];

    if (myScope === "all" || myScope === "owned") {
      for (const item of ownedAgents) {
        const c = curatedByAgentKey.get(`${item.sourceNetwork}:${item.agentId.toLowerCase()}`);
        rows.push({
          key: `owned:${item.id}:${item.sourceNetwork}`,
          agentId: item.agentId,
          name: getDisplayName(item),
          href: `/agents/${encodeURIComponent(item.id)}?network=${item.sourceNetwork}`,
          network: item.sourceNetwork,
          source: "owned",
          curateStatus: c?.status,
          collateral: c?.stake,
          resolved: true,
        });
      }
    }

    if (myScope === "all") {
      for (const c of curatedAgents) {
        const key0 = c.metadata?.key0?.trim() || "";
        const chainId = parseChainId(c.metadata?.key2 || "");
        const network = (chainId ? getAgentNetworkFromChainId(chainId) : null) || "sepolia";
        const resolvedOwned = key0 ? myOwnedByAgentId.get(key0) : undefined;
        const resolvedBySubgraph = key0 ? Boolean(resolvedCurateKeys[`${network}:${key0}`]) : false;

        const statusLower = String(c.status || "").toLowerCase();
        const isChallenged = statusLower === "disputed";
        const isAbsent = statusLower === "absent";
        const isCollateralized = statusLower === "submitted" || statusLower === "reincluded";
        if (myStatus === "challenged" && !isChallenged) continue;
        if (myStatus === "absent" && !isAbsent) continue;
        if (myStatus === "collateralized" && !isCollateralized) continue;

        rows.push({
          key: `curate:${c.id}`,
          agentId: key0 || undefined,
          name: resolvedOwned
            ? getDisplayName(resolvedOwned)
            : (key0 && curateNameByKey[`${network}:${key0}`])
              ? curateNameByKey[`${network}:${key0}`]
              : (key0 ? `Agent ${key0}` : `Submission ${c.itemID.slice(0, 10)}…`),
          href: (resolvedOwned || resolvedBySubgraph)
            ? `/agents/${encodeURIComponent(key0)}?network=${network}&lookup=agentId`
            : `/submissions/${encodeURIComponent(c.itemID)}`,
          network,
          source: "curate",
          curateStatus: c.status,
          collateral: c.stake,
          resolved: Boolean(resolvedOwned || resolvedBySubgraph),
        });
      }
    }

    const deduped = (() => {
      const map = new Map<string, typeof rows[number]>();
      for (const r of rows) {
        const key = `${r.network}:${(r.agentId || r.key || r.href).toLowerCase()}`;
        const prev = map.get(key);
        if (!prev) {
          map.set(key, r);
          continue;
        }
        if (prev.source === "curate" && r.source === "owned") {
          map.set(key, { ...r, curateStatus: r.curateStatus || prev.curateStatus, collateral: r.collateral || prev.collateral });
        } else if (prev.source === "owned" && r.source === "curate") {
          map.set(key, { ...prev, curateStatus: prev.curateStatus || r.curateStatus, collateral: prev.collateral || r.collateral });
        }
      }
      return Array.from(map.values());
    })();

    if (myStatus === "all") return deduped;
    return deduped.filter((r) => {
      const statusLower = String(r.curateStatus || "").toLowerCase();
      const isChallenged = statusLower === "disputed";
      const isAbsent = statusLower === "absent";
      const isCollateralized = statusLower === "submitted" || statusLower === "reincluded";
      if (myStatus === "challenged") return isChallenged;
      if (myStatus === "absent") return isAbsent;
      if (myStatus === "collateralized") return isCollateralized;
      return true;
    });
  }, [ownedAgents, curatedAgents, myOwnedByAgentId, myScope, myStatus, resolvedCurateKeys, curateNameByKey, curatedByAgentKey]);


  return (
    <div className="container mx-auto px-6 py-10 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold tracking-tight">Trade</h1>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-medium">
              Sepolia
            </Badge>
          </div>
          <p className="text-muted-foreground">
            Manage your agent trading workflow: track your agents and collateralized submissions, review received and
            sent offers, transfer ownership to buyers, and release payment after delivery.
          </p>
        </div>
      </div>

      {/* Search Section */}
      <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-6 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">Find an agent</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Search by name to find matching agents on Sepolia
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            placeholder="Search agents by name..."
            value={agentSearch}
            onChange={(e) => {
              setAgentSearch(e.target.value);
              setHasSearchedAgents(false);
              setSearchError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") runAgentSearch();
            }}
            className="h-11"
          />
          <Button onClick={runAgentSearch} disabled={searching} className="h-11 px-6">
            {searching ? "Searching…" : "Search"}
          </Button>
        </div>

        {hasSearchedAgents ? (
          <div className="mt-5 rounded-xl border border-border/50 bg-background/70 p-3">
            {searching ? (
              <div className="py-5 text-sm text-muted-foreground">Searching agents…</div>
            ) : searchedAgents.length > 0 ? (
              <>
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Showing {Math.min(8, searchedAgents.length)} of {searchedAgents.length} matches
                  </span>
                  {searchedAgents.length > 8 ? <span>Refine query for fewer results</span> : null}
                </div>
                <div className="max-h-[26rem] space-y-2 overflow-auto pr-1">
                  {searchedAgents.slice(0, 8).map((agent) => (
                    <div
                      key={agent.id}
                      className="rounded-lg border border-border/50 bg-background p-3 transition-all hover:border-border"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="truncate text-base font-semibold">{getDisplayName(agent)}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {agent.agentId} •{" "}
                            {(() => {
                              const ownerExplorerUrl = getAddressExplorerUrl(agent.owner, sepolia.id);
                              return ownerExplorerUrl ? (
                                <a
                                  href={ownerExplorerUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-mono underline-offset-2 hover:underline hover:text-foreground"
                                >
                                  {truncateAddress(agent.owner)}
                                </a>
                              ) : (
                                <span className="font-mono">{truncateAddress(agent.owner)}</span>
                              );
                            })()}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <CreateOfferDialog
                            agentId={agent.agentId}
                            agentName={getDisplayName(agent)}
                            agentUri={agent.agentURI}
                            owner={agent.owner as `0x${string}`}
                          />
                          <Button asChild size="sm" variant="ghost" className="rounded-lg">
                            <Link href={`/agents/${encodeURIComponent(agent.id)}`}>View</Link>
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="py-5 text-sm text-muted-foreground">
                {searchError ? searchError : `No agents found matching "${agentSearch.trim()}"`}
              </div>
            )}
          </div>
        ) : null}
      </div>


      {/* My agents */}
      <section className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-6 mb-8">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-semibold">My agents</h2>
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          <Button size="sm" variant={myScope === "all" ? "default" : "outline"} onClick={() => setMyScope("all")}>All agents</Button>
          <Button size="sm" variant={myScope === "owned" ? "default" : "outline"} onClick={() => setMyScope("owned")}>Agents that I own</Button>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <Button size="sm" variant={myStatus === "all" ? "default" : "outline"} onClick={() => setMyStatus("all")}>All status</Button>
          <Button size="sm" variant={myStatus === "collateralized" ? "default" : "outline"} onClick={() => setMyStatus("collateralized")}>Collateralized</Button>
          <Button size="sm" variant={myStatus === "challenged" ? "default" : "outline"} onClick={() => setMyStatus("challenged")}>Challenged</Button>
          <Button size="sm" variant={myStatus === "absent" ? "default" : "outline"} onClick={() => setMyStatus("absent")}>Absent</Button>
        </div>

        {myAgentsLoading ? (
          <div className="text-sm text-muted-foreground">Loading your agents…</div>
        ) : myRows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No agents for current filters.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {myRows.map((row) => (
              <Link
                key={row.key}
                href={row.href}
                className="rounded-lg border border-cyan-400/25 bg-background p-3 shadow-[0_0_0_1px_rgba(34,211,238,0.05),0_0_16px_rgba(34,211,238,0.08)] transition-all duration-200 hover:border-cyan-300/40 hover:shadow-[0_0_0_1px_rgba(34,211,238,0.1),0_0_20px_rgba(34,211,238,0.12)]"
              >
                <div className="font-medium truncate">{row.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {row.agentId || "-"} | {isAgentSubgraphNetwork(row.network) ? getAgentSubgraphLabel(row.network) : row.network}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {row.source === "owned" ? <Badge variant="outline" className="text-[11px]">Owned</Badge> : null}
                  {row.curateStatus ? <Badge variant="outline" className="text-[11px]">{String(row.curateStatus).toLowerCase() === "submitted" || String(row.curateStatus).toLowerCase() === "reincluded" ? "Collateralized" : row.curateStatus}</Badge> : null}
                  {row.source === "curate" && !row.resolved ? <Badge variant="outline" className="text-[11px] text-amber-300">agent not found</Badge> : null}
                  {row.collateral ? (
                    <Badge variant="outline" className="text-[11px]">
                      {formatUnits(BigInt(row.collateral), resolvedPgtcrTokenDecimals)} {resolvedPgtcrTokenSymbol}
                    </Badge>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <Package className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold">Disputes</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">Disputes where your wallet is requester or challenger.</p>

            {myDisputesLoading ? (
              <div className="text-sm text-muted-foreground">Loading disputes…</div>
            ) : myDisputes.length === 0 ? (
              <div className="text-sm text-muted-foreground">No disputes found for this wallet.</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {myDisputes.map((d) => {
                  const latest = d.challenges?.[0];
                  const key0 = d.metadata?.key0?.trim() || "";
                  const chainId = parseChainId(d.metadata?.key2 || "");
                  const net = (chainId ? getAgentNetworkFromChainId(chainId) : null) || "sepolia";
                  const href = key0 ? `/agents/${encodeURIComponent(key0)}?network=${net}&lookup=agentId` : `/submissions/${encodeURIComponent(d.itemID)}`;
                  const role = address && latest ? (latest.challenger?.toLowerCase() === address.toLowerCase() ? "Challenger" : "Requester") : "Participant";
                  return (
                    <Link key={d.id} href={href} className="block rounded-lg border border-border/50 bg-background p-3 hover:border-border">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">Dispute #{latest?.disputeID || "-"}</span>
                        <Badge variant="outline" className="text-[11px]">{role}</Badge>
                        <Badge variant="outline" className="text-[11px]">{d.status}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground font-mono">{key0 || d.itemID}</div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold">My offers</h2>
              <Badge variant="secondary" className="text-xs ml-auto">Buyer</Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              If ownership has been transferred to you, release funds to complete the trade.
            </p>
            <div className="space-y-4">
              {myOffersMade.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4">No offers yet</div>
              ) : (
                myOffersMade.map((t) => {
                  const agentId = (() => {
                    try {
                      const m = t.metaEvidence ? JSON.parse(t.metaEvidence) : null;
                      return m?.agentId || null;
                    } catch {
                      return null;
                    }
                  })();

                  return (
                    <div
                      key={t.id.toString()}
                      className="rounded-lg border border-border/50 bg-background p-4 space-y-3 transition-all hover:border-border"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Agent ID</div>
                          <div className="font-mono text-sm">{agentId ? `${agentId.slice(0, 20)}…` : "-"}</div>
                        </div>
                        <Badge variant="outline" className="text-xs shrink-0">#{t.id.toString()}</Badge>
                      </div>

                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Seller</span>
                        {(() => {
                          const sellerExplorerUrl = getAddressExplorerUrl(t.receiver, sepolia.id);
                          return sellerExplorerUrl ? (
                            <a
                              href={sellerExplorerUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-xs underline-offset-2 hover:underline hover:text-foreground"
                            >
                              {truncateAddress(t.receiver)}
                            </a>
                          ) : (
                            <span className="font-mono text-xs">{truncateAddress(t.receiver)}</span>
                          );
                        })()}
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Amount</span>
                        <span className="font-semibold font-mono">{formatEther(t.amount)} ETH</span>
                      </div>

                      <div className="pt-3 border-t border-border/30">
                        <ReleaseEscrowButton
                          transactionId={t.id}
                          receiverAddress={t.receiver}
                          amountEth={formatEther(t.amount)}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold">My escrows</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              On-chain transactions you&apos;re involved in
            </p>

            <div className="space-y-3">
              {escrow.status === "loading" ? (
                <div className="text-sm text-muted-foreground text-center py-8">Loading escrows…</div>
              ) : escrow.status === "error" ? (
                <div className="text-sm text-red-400 text-center py-8">{escrow.error}</div>
              ) : escrow.data.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  No escrows yet. Create an offer to get started.
                </div>
              ) : (
                escrow.data
                  .slice()
                  .sort((a, b) => Number(b.id - a.id))
                  .map((t) => (
                    <div
                      key={t.id.toString()}
                      className="rounded-lg border border-border/50 bg-background p-4 transition-all hover:border-border"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">Escrow #{t.id.toString()}</span>
                          <Badge variant="outline" className="text-xs">
                            {escrowStatusLabel(t.status)}
                          </Badge>
                        </div>
                        <span className="font-mono text-sm font-medium text-emerald-600">
                          {formatEther(t.amount)} ETH
                        </span>
                      </div>
                      <div className="grid gap-1 text-xs text-muted-foreground font-mono">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="w-10 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground/60">From</span>
                          {(() => {
                            const senderExplorerUrl = getAddressExplorerUrl(t.sender, sepolia.id);
                            return senderExplorerUrl ? (
                              <a
                                href={senderExplorerUrl}
                                target="_blank"
                                rel="noreferrer"
                                title={t.sender}
                                className="min-w-0 flex-1 truncate text-[11px] underline-offset-2 hover:underline hover:text-foreground"
                              >
                                {truncateAddress(t.sender)}
                              </a>
                            ) : (
                              <span title={t.sender} className="min-w-0 flex-1 truncate text-[11px]">
                                {truncateAddress(t.sender)}
                              </span>
                            );
                          })()}
                        </div>
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="w-10 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground/60">To</span>
                          {(() => {
                            const receiverExplorerUrl = getAddressExplorerUrl(t.receiver, sepolia.id);
                            return receiverExplorerUrl ? (
                              <a
                                href={receiverExplorerUrl}
                                target="_blank"
                                rel="noreferrer"
                                title={t.receiver}
                                className="min-w-0 flex-1 truncate text-[11px] underline-offset-2 hover:underline hover:text-foreground"
                              >
                                {truncateAddress(t.receiver)}
                              </a>
                            ) : (
                              <span title={t.receiver} className="min-w-0 flex-1 truncate text-[11px]">
                                {truncateAddress(t.receiver)}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                      {t.metaEvidence ? (
                        <div className="mt-3 pt-3 border-t border-border/30">
                          <div className="text-xs text-muted-foreground truncate">
                            <span className="text-muted-foreground/60">Meta:</span>{" "}
                            <span className="font-mono">{t.metaEvidence}</span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))
              )}
            </div>
          </section>

          <section className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <Package className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold">Offers to me</h2>
              <Badge variant="secondary" className="text-xs ml-auto">Seller</Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Transfer agent ownership to buyers
            </p>
            <div className="space-y-4">
              {myOffersToMe.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4">No pending offers</div>
              ) : (
                myOffersToMe.map((t) => {
                  const agentId = (() => {
                    try {
                      const m = t.metaEvidence ? JSON.parse(t.metaEvidence) : null;
                      return m?.agentId || null;
                    } catch {
                      return null;
                    }
                  })();

                  return (
                    <div
                      key={t.id.toString()}
                      className="rounded-lg border border-border/50 bg-background p-4 space-y-3 transition-all hover:border-border"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Agent ID</div>
                          <div className="font-mono text-sm">{agentId ? `${agentId.slice(0, 20)}…` : "-"}</div>
                        </div>
                        <Badge variant="outline" className="text-xs shrink-0">#{t.id.toString()}</Badge>
                      </div>

                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Buyer</span>
                        {(() => {
                          const buyerExplorerUrl = getAddressExplorerUrl(t.sender, sepolia.id);
                          return buyerExplorerUrl ? (
                            <a
                              href={buyerExplorerUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-xs underline-offset-2 hover:underline hover:text-foreground"
                            >
                              {truncateAddress(t.sender)}
                            </a>
                          ) : (
                            <span className="font-mono text-xs">{truncateAddress(t.sender)}</span>
                          );
                        })()}
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Amount</span>
                        <span className="font-semibold font-mono">{formatEther(t.amount)} ETH</span>
                      </div>

                      <div className="pt-3 border-t border-border/30">
                        <TransferAgentOwnershipButton
                          transactionId={t.id}
                          buyerAddress={t.sender}
                          agentId={agentId || undefined}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {requestsToMe.length > 0 ? (
            <section className="rounded-xl border border-dashed border-border/50 p-6 opacity-75">
              <h2 className="font-semibold text-sm mb-2">Requests to me (experimental)</h2>
              <p className="text-xs text-muted-foreground mb-4">
                Off-chain sale requests
              </p>
              <div className="space-y-3">
                {requestsToMe.map((r) => {
                  const metaEvidence = JSON.stringify({
                    kind: "erc8004-agent-sale-request-fulfillment",
                    saleRequestId: r.id,
                    agentId: r.agentId,
                    agentName: r.agentName,
                    note: r.note,
                  });
                  return (
                    <div key={r.id} className="rounded-lg border border-border/30 bg-background p-3 text-sm">
                      <div className="font-mono text-xs mb-1">{r.agentId.slice(0, 20)}…</div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">{formatEther(BigInt(r.amountWei))} ETH</span>
                        <div className="flex gap-2">
                          <PayAndCompleteButton seller={r.seller} amountWei={BigInt(r.amountWei)} metaEvidence={metaEvidence} />
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { removeSaleRequest(r.id); setSaleRequests(loadSaleRequests()); }}>
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
