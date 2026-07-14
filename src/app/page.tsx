"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  ChevronRight,
  HandCoins,
  Loader2,
  MessageSquareText,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { formatUnits } from "viem";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type AgentSubgraphNetwork } from "@/lib/agent-networks";
import { useVerificationEnvironment } from "@/components/verification-environment-provider";

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

const HERO_DESCRIPTORS = [
  "Agent Registry",
  "Agent Explorer",
  "Trust Registry",
  "Custom Verification",
] as const;

const STATIC_HISTORY_ROWS = [
  {
    tag: "VERIFIED",
    title: "Collateral submitted",
    tone: "emerald",
  },
  {
    tag: "UPDATE",
    title: "Agent metadata updated",
    tone: "cyan",
  },
  {
    tag: "UPDATE",
    title: "Last observed activity",
    tone: "cyan",
  },
  {
    tag: "CREATED",
    title: "Agent created",
    tone: "emerald",
  },
] as const;

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

export default function HomePage() {
  const { environment, withEnvironment } = useVerificationEnvironment();
  const [highlights, setHighlights] = React.useState<HighlightsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);

  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);
  const [descriptorIndex, setDescriptorIndex] = React.useState(0);
  const [descriptorPaused, setDescriptorPaused] = React.useState(false);
  const [descriptorVisible, setDescriptorVisible] = React.useState(true);
  const fadeTimeoutRef = React.useRef<number | null>(null);

  const load = React.useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const highlightsRes = await fetch(`/api/home/highlights?verificationEnvironment=${environment}`, {
        cache: "no-store",
        signal,
      });
      const highlightsJson = (await highlightsRes.json()) as HighlightsResponse;
      if (!signal?.aborted && highlightsJson.success) setHighlights(highlightsJson);
    } catch {
      // Keep previous highlights on request failure.
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [environment]);

  React.useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  React.useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setPrefersReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  React.useEffect(() => {
    if (prefersReducedMotion || descriptorPaused) return;

    const interval = window.setInterval(() => {
      setDescriptorVisible(false);
      if (fadeTimeoutRef.current !== null) window.clearTimeout(fadeTimeoutRef.current);
      fadeTimeoutRef.current = window.setTimeout(() => {
        setDescriptorIndex((current) => (current + 1) % HERO_DESCRIPTORS.length);
        setDescriptorVisible(true);
      }, 180);
    }, 2000);

    return () => {
      window.clearInterval(interval);
      if (fadeTimeoutRef.current !== null) {
        window.clearTimeout(fadeTimeoutRef.current);
        fadeTimeoutRef.current = null;
      }
    };
  }, [descriptorPaused, prefersReducedMotion]);

  const highestStakeAgents = React.useMemo(() => {
    const rows = [...(highlights?.verifiedAgents || [])];
    rows.sort((a, b) => {
      const stakeA = BigInt(a.stake || "0");
      const stakeB = BigInt(b.stake || "0");
      if (stakeA === stakeB) return (Number(b.verifiedAt) || 0) - (Number(a.verifiedAt) || 0);
      return stakeA > stakeB ? -1 : 1;
    });
    return rows.slice(0, 4);
  }, [highlights?.verifiedAgents]);

  const verifiedShowcaseRows = React.useMemo(() => {
    const fallback = [
      { name: "Kleros", id: "1440", stake: "0.003", rank: 1 },
      { name: "xinfos AI Agent", id: "1142", stake: "0.002", rank: 2 },
      { name: "testMaldoAgent", id: "1411", stake: "0.001", rank: 3 },
      { name: "wen v2", id: "1143", stake: "0.001", rank: 4 },
    ];

    const length = environment === "mainnet" ? highestStakeAgents.length : 4;
    return Array.from({ length }).map((_, index) => {
      const item = highestStakeAgents[index];
      if (!item) return { ...fallback[index], href: withEnvironment("/verified"), external: false };

      const href = item.curateItemUrl || withEnvironment(`/agents/${encodeURIComponent(item.id)}?network=${item.network}`);
      return {
        name: item.name,
        id: item.agentId,
        stake: formatStake(item.stake, Number(highlights?.verifiedStakeDecimals || 18)),
        rank: index + 1,
        href,
        external: Boolean(item.curateItemUrl),
      };
    });
  }, [environment, highestStakeAgents, highlights?.verifiedStakeDecimals, withEnvironment]);

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,#010308_0%,#03070e_52%,#040a12_100%)]" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(152deg,rgba(34,211,238,0.08)_0%,transparent_35%)]" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(24deg,rgba(16,185,129,0.06)_0%,transparent_35%)]" />

      <main className="container mx-auto max-w-[1200px] px-5 py-12 sm:px-8 sm:py-16 lg:py-20">
        <section className="relative pb-8 pt-4 text-center sm:pt-8 lg:pt-12">
          <h1 className="text-balance text-6xl font-black tracking-[-0.04em] sm:text-7xl lg:text-8xl xl:text-[7.2rem]">
            <span className="bg-gradient-to-r from-cyan-300 via-cyan-200 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_40px_rgba(34,211,238,0.35)]">
              DEX
            </span>
            <span className="text-white/95">8004</span>
          </h1>
          <p className="sr-only">Decentralized Agent Registry, Agent Explorer, Trust Registry, and Custom Verification.</p>

          {prefersReducedMotion ? (
            <div className="mt-8 h-12">
              <div className="flex h-full flex-wrap items-center justify-center gap-2 text-xl sm:text-2xl">
                <span className="font-light text-white/50">Decentralized</span>
                {HERO_DESCRIPTORS.map((descriptor) => (
                  <span
                    key={descriptor}
                    className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-sm font-light text-cyan-200"
                  >
                    {descriptor}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div
              className="mt-8 h-12"
              onMouseEnter={() => setDescriptorPaused(true)}
              onMouseLeave={() => setDescriptorPaused(false)}
            >
              <div className="flex h-full items-center justify-center gap-3 text-xl sm:text-2xl">
                <span className="font-light text-white/50">Decentralized</span>
                <ChevronRight className="h-5 w-5 text-white/25" />
                <span
                  className={`font-light text-cyan-200 transition-all duration-200 ${
                    descriptorVisible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
                  }`}
                >
                  {HERO_DESCRIPTORS[descriptorIndex]}
                </span>
              </div>
            </div>
          )}

          <h2 className="mx-auto mt-10 max-w-4xl px-2 text-center text-lg font-normal leading-relaxed tracking-[-0.01em] text-white/70 sm:px-0 sm:text-xl">
            Discover agents, verify claims, and build portable trust through open registries and transparent dispute resolution.
          </h2>

          <div className="mx-auto mt-16 h-px w-full max-w-4xl bg-gradient-to-r from-transparent via-white/15 to-transparent" />
        </section>

        <section className="mt-32 grid items-center gap-14 lg:grid-cols-[0.88fr_1.12fr] lg:gap-20">
          <div className="relative rounded-lg border border-emerald-300/20 bg-[#07171a]/80 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-sm">
            <div className="mb-4 flex items-center justify-between border-b border-emerald-300/18 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-200" />
                <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-100/95">Verified agents</h4>
              </div>
              <Badge className="border-emerald-200/30 bg-emerald-200/12 text-emerald-100">Highest stake</Badge>
            </div>

            {loading ? (
              <div className="flex min-h-[260px] items-center justify-center text-white/75">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading verified agents...
              </div>
            ) : (
              <div className="space-y-2.5">
                {verifiedShowcaseRows.map((item) => (
                  <Link
                    key={`${item.rank}-${item.id}`}
                    href={item.href}
                    target={item.external ? "_blank" : undefined}
                    rel={item.external ? "noreferrer" : undefined}
                    className="block rounded-md border border-emerald-300/24 bg-[#041012] px-4 py-3 shadow-[0_0_0_1px_rgba(110,231,183,0.05),0_0_16px_rgba(16,185,129,0.1)] transition hover:border-emerald-200/45 hover:shadow-[0_0_0_1px_rgba(110,231,183,0.1),0_0_22px_rgba(16,185,129,0.14)]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-xl font-semibold text-white">
                          {item.name} <span className="text-sm text-white/55">#{item.id}</span>
                        </div>
                        <div className="mt-1 text-base font-semibold text-emerald-100">
                          Stake {item.stake} {highlights?.verifiedStakeSymbol || "WETH"}
                        </div>
                      </div>
                      <Badge className="border-emerald-200/30 bg-emerald-200/12 px-2 py-0 text-[11px] text-emerald-100">
                        #{item.rank}
                      </Badge>
                    </div>
                  </Link>
                ))}
                {environment === "mainnet" && verifiedShowcaseRows.length === 0 ? (
                  <div className="flex min-h-[180px] flex-col items-center justify-center rounded-md border border-dashed border-emerald-300/25 px-5 text-center">
                    <div className="font-medium text-white">No mainnet submissions yet</div>
                    <p className="mt-2 text-sm text-white/60">Be the first agent in the Ethereum Stake Curate registry.</p>
                  </div>
                ) : null}
              </div>
            )}

            <Button asChild className="mt-4 w-full border border-emerald-300/40 bg-emerald-300/18 text-white hover:bg-emerald-300/28">
              <Link href={withEnvironment("/verified")}>Verified</Link>
            </Button>
          </div>

          <div className="self-center px-1 sm:px-0">
            <h3 className="text-3xl font-black tracking-[-0.03em] text-white sm:text-4xl lg:text-[2.55rem]">
              Let your agent usage{" "}
              <span className="bg-gradient-to-r from-cyan-300 via-cyan-200 to-cyan-400 bg-clip-text text-transparent">
                skyrocket
              </span>
            </h3>
            <p className="mt-8 max-w-3xl text-xl leading-tight text-white/88 sm:text-[1.65rem]">
              Stake collateral as proof that your agent does what the metadata says. No costs. You can withdraw your
              collateral anytime. Stake as much as you feel confident, rank higher, and get chosen first.
            </p>
          </div>
        </section>

        <section className="mt-32 border-y border-white/12 py-14 sm:py-16">
          <div className="grid items-center gap-14 lg:grid-cols-[1fr_0.9fr] lg:gap-20">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase text-emerald-200">
                <MessageSquareText className="h-4 w-4" />
                Kleros Oracle feedback
              </div>
              <h3 className="mt-4 text-3xl font-black text-white sm:text-4xl">
                One request: global presence and recognition
              </h3>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/75">
                Receive feedback from the #1 decentralized justice protocol, recognized by jurisdictions worldwide. The result is published to the ERC-8004 Oracle, making it visible here and available to every compatible platform, including block explorers.
              </p>
            </div>

            <div className="border border-emerald-300/20 bg-[#06100f]/75">
              <div className="flex items-center justify-between border-b border-emerald-300/15 px-4 py-3">
                <span className="text-xs font-semibold uppercase text-white/55">Portable feedback</span>
                <Badge className="border-emerald-300/30 bg-emerald-300/12 text-emerald-100">ERC-8004</Badge>
              </div>
              <div className="space-y-0">
                <FeedbackSignal label="Source" value="Kleros Oracle" />
                <FeedbackSignal label="Outcome" value="Verification recorded" />
                <FeedbackSignal label="Benefit" value="More confidence, better discovery" />
              </div>
              <div className="flex items-center gap-2 border-t border-emerald-300/15 px-4 py-4 text-sm text-emerald-100">
                <BadgeCheck className="h-4 w-4" />
                Verifiable feedback users can inspect
              </div>
            </div>
          </div>
        </section>

        <section className="mt-32 grid items-center gap-14 lg:grid-cols-[0.86fr_1.14fr] lg:gap-20">
          <div className="order-2 relative rounded-lg border border-cyan-300/20 bg-[#040a12]/88 p-6 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-sm sm:p-7 lg:order-1">
            <div className="pointer-events-none absolute inset-0 rounded-lg bg-[linear-gradient(138deg,rgba(34,211,238,0.08)_0%,transparent_42%,transparent_62%,rgba(34,211,238,0.04)_100%)]" />
            <div className="mb-6 border-b border-cyan-300/18 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-300/30 bg-cyan-300/10">
                  <Activity className="h-4 w-4 text-cyan-300" />
                </span>
                <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100">History</h4>
              </div>
              <p className="mt-1 text-xs text-white/65">Registry + Curate timeline</p>
            </div>

            <div className="relative">
              <ul className="space-y-3">
                {STATIC_HISTORY_ROWS.map((item, index) => {
                  const isEmerald = item.tone === "emerald";
                  return (
                    <li
                      key={`${item.tag}-${index}`}
                      className="flex items-center gap-3 py-1.5"
                    >
                      <span
                        className={`inline-flex h-2.5 w-2.5 rounded-full ${
                          isEmerald ? "border-emerald-200/70 bg-emerald-300/80" : "border-cyan-200/70 bg-cyan-300/80"
                        } shadow-[0_0_10px_rgba(34,211,238,0.35)]`}
                      />

                      <span
                        className={`inline-flex h-6 min-w-[6.1rem] items-center justify-center rounded-full border px-2.5 text-[10px] font-semibold tracking-[0.08em] ${
                          isEmerald
                            ? "border-emerald-300/35 bg-emerald-300/15 text-emerald-100 shadow-[0_0_16px_rgba(16,185,129,0.2)]"
                            : "border-cyan-300/35 bg-cyan-300/14 text-cyan-100 shadow-[0_0_16px_rgba(34,211,238,0.2)]"
                        }`}
                      >
                        {item.tag}
                      </span>

                      <p className="min-w-0 truncate text-[0.98rem] font-medium leading-snug text-white/92">{item.title}</p>
                    </li>
                  );
                })}
              </ul>
            </div>

            <Button asChild className="mt-4 w-full border border-cyan-300/40 bg-cyan-300/18 text-white hover:bg-cyan-300/28">
              <Link href={withEnvironment("/explore")}>
                Explore
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>

          <div className="order-1 self-center px-1 sm:px-0 lg:order-2">
            <h3 className="text-3xl font-black tracking-[-0.03em] text-white sm:text-4xl lg:text-[2.65rem]">
              Safe, fast{" "}
              <span className="bg-gradient-to-r from-cyan-300 via-cyan-200 to-cyan-400 bg-clip-text text-transparent">
                interactions
              </span>
            </h3>
            <p className="mt-8 max-w-3xl text-xl leading-tight text-white/88 sm:text-[1.65rem]">
              Interact immediately with verified agents. You do not need to verify by yourself because someone already did it for you.
              If you want to inspect every detail, all the information is transparent and available.
            </p>
          </div>
        </section>

        <section className="mt-52">
          <h3 className="mx-auto max-w-5xl text-center text-2xl font-black tracking-[-0.03em] text-white sm:text-3xl lg:text-[2.6rem]">
            Think an agent broke the rules? Challenge the evidence
          </h3>
          <div className="mx-auto mt-6 h-px w-full max-w-5xl bg-gradient-to-r from-transparent via-white/25 to-transparent" />

          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <article className="group relative overflow-hidden rounded-lg border border-emerald-300/20 bg-[#050e12]/88 p-6 text-center transition-colors hover:border-emerald-200/38 sm:p-7">
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(150deg,rgba(16,185,129,0.14)_0%,transparent_55%)]" />
              <HandCoins className="mx-auto mb-5 h-11 w-11 text-emerald-100" />
              <p className="relative mx-auto max-w-[34ch] text-lg font-semibold leading-snug text-white/90 sm:text-xl">
                If an agent has collateral, you can{" "}
                <span className="bg-gradient-to-r from-emerald-200 via-emerald-300 to-emerald-400 bg-clip-text text-transparent">
                  claim a violation
                </span>
                . If you win the dispute, the collateral becomes yours.
              </p>
            </article>

            <article className="group relative overflow-hidden rounded-lg border border-amber-300/20 bg-[#120d06]/88 p-6 text-center transition-colors hover:border-amber-200/40 sm:p-7">
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(30deg,rgba(245,158,11,0.14)_0%,transparent_55%)]" />
              <ShieldAlert className="mx-auto mb-5 h-11 w-11 text-amber-100" />
              <Badge className="relative mb-4 border-amber-300/30 bg-amber-300/10 text-amber-100">Coming soon</Badge>
              <p className="relative mx-auto max-w-[34ch] text-lg font-semibold leading-snug text-white/90 sm:text-xl">
                Community reporting for agents without collateral will arrive with the{" "}
                <span className="bg-gradient-to-r from-amber-200 via-amber-300 to-orange-300 bg-clip-text text-transparent">
                  moderation workflow
                </span>{" "}
                .
              </p>
            </article>
          </div>

          <p className="mx-auto mt-8 max-w-4xl text-center text-base text-white/84 sm:text-lg">
            Curate challenges remain available now. Community reports, answers, and arbitration controls are being prepared for a later release.
          </p>

          <div className="mt-7 flex justify-center">
            <Button asChild className="border border-cyan-200/45 bg-cyan-200/18 px-6 text-white hover:bg-cyan-200/28">
              <Link href={withEnvironment("/trust")}>
                Analyze
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>

        <section className="mt-40 pb-2">
          <div className="relative overflow-hidden rounded-lg border border-cyan-300/15 bg-[#02060d]/82 p-8 text-center shadow-[0_22px_70px_rgba(0,0,0,0.4)] sm:p-12">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(34,211,238,0.12)_0%,rgba(34,211,238,0.04)_34%,transparent_70%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(130deg,transparent_0%,rgba(34,211,238,0.08)_54%,transparent_100%)]" />
            <h3 className="relative text-2xl font-black tracking-[-0.02em] text-white sm:text-3xl">
              Define what verified means for your market
            </h3>
            <p className="relative mx-auto mt-6 max-w-4xl text-base text-white/85 sm:text-lg">
              Set your own criteria, issue a trusted badge, and create a standard that products can use to grant access or privileges.
            </p>
            <div className="relative mt-7">
              <Button asChild className="border border-cyan-200/40 bg-cyan-200/18 text-white hover:bg-cyan-200/28">
                <Link href="/launch">
                  Build Your Standard
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function FeedbackSignal({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-emerald-300/10 px-4 py-4 last:border-b-0">
      <span className="text-xs uppercase text-white/45">{label}</span>
      <span className="text-right text-sm font-medium text-white/90">{value}</span>
    </div>
  );
}
