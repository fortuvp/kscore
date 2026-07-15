"use client";

import { ArrowUpRight, Bot, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { useVerificationEnvironment } from "@/components/verification-environment-provider";

const GROUPS = [
  {
    title: "Discover",
    links: [
      { href: "/", label: "Home", verificationAware: true },
      { href: "/explore", label: "Explore", verificationAware: true },
      { href: "/verified", label: "Verified Agents", verificationAware: true },
      { href: "/leaderboard", label: "Leaderboard" },
    ],
  },
  {
    title: "Verify",
    links: [
      { href: "/submit", label: "Submit an agent", verificationAware: true },
      { href: "/launch", label: "Build your standard" },
      { href: "/trust", label: "Trust", verificationAware: true },
      { href: "/moderation", label: "Moderation · Soon" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/my-agents", label: "My Agents", verificationAware: true },
      { href: "/watchlist", label: "Watchlist" },
      { href: "/networks", label: "Networks" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/docs", label: "Guide" },
      { href: "/faq", label: "FAQ" },
      { href: "/skills", label: "Skills" },
    ],
  },
] as const;

export function AppFooter() {
  const { withEnvironment } = useVerificationEnvironment();

  return (
    <footer className="relative overflow-hidden border-t border-white/[0.08] bg-[#03070d]/92 px-5 py-10 text-sm text-white/68 sm:px-8 sm:py-12">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_15%_0%,rgba(34,211,238,0.07),transparent_38%),radial-gradient(circle_at_85%_0%,rgba(16,185,129,0.055),transparent_34%)]" />

      <div className="relative mx-auto w-full max-w-[1200px]">
        <div className="grid gap-10 border-b border-white/[0.07] pb-10 lg:grid-cols-[1.05fr_1.95fr] lg:gap-16">
          <div className="max-w-md">
            <Link href={withEnvironment("/")} className="inline-flex items-baseline font-semibold tracking-[-0.02em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/45">
              <span className="bg-gradient-to-r from-cyan-300 to-cyan-400 bg-clip-text text-xl text-transparent">K</span>
              <span className="text-xl text-white/92">SCORE</span>
            </Link>
            <p className="mt-4 text-sm leading-6 text-white/52">
              Open registry infrastructure for discovering, collateralizing, and evaluating ERC-8004 agents.
            </p>

            <a
              href="https://kleros.io/"
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-emerald-300/16 bg-emerald-300/[0.045] px-3 py-1.5 text-xs font-medium text-emerald-100 transition hover:border-emerald-300/30 hover:bg-emerald-300/[0.075] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/45"
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Disputes secured by Kleros
              <ArrowUpRight className="h-3 w-3 text-emerald-200/55" aria-hidden="true" />
            </a>
          </div>

          <div className="grid grid-cols-2 gap-x-7 gap-y-8 sm:grid-cols-4">
            {GROUPS.map((group) => (
              <div key={group.title}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/36">{group.title}</div>
                <div className="mt-4 space-y-2.5">
                  {group.links.map((link) => {
                    const href = "verificationAware" in link && link.verificationAware ? withEnvironment(link.href) : link.href;
                    const external = "external" in link && link.external;
                    return (
                      <Link
                        key={`${group.title}-${link.href}`}
                        href={href}
                        target={external ? "_blank" : undefined}
                        rel={external ? "noreferrer" : undefined}
                        className="group flex w-fit items-center gap-1 text-sm text-white/58 transition hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/45"
                      >
                        {link.label}
                        {external ? (
                          <ArrowUpRight className="h-3 w-3 text-white/25 transition group-hover:text-cyan-200/65" aria-hidden="true" />
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4 pt-6 text-xs text-white/38 sm:flex-row sm:items-center sm:justify-between">
          <p>Permissionless registry signals. Always verify live policy and status.</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 inline-flex items-center gap-1.5 text-white/48">
              <Bot className="h-3.5 w-3.5 text-cyan-200/65" aria-hidden="true" />
              Agent access
            </span>
            <Link
              href="/llms.txt"
              className="rounded-md border border-white/10 bg-white/[0.025] px-2 py-1 font-mono text-[11px] text-white/52 transition hover:border-cyan-300/22 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/45"
            >
              llms.txt
            </Link>
            <Link
              href="/SKILL.md"
              className="rounded-md border border-white/10 bg-white/[0.025] px-2 py-1 font-mono text-[11px] text-white/52 transition hover:border-cyan-300/22 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/45"
            >
              SKILL.md
            </Link>
            <Link
              href="/llms-full.txt"
              className="rounded-md border border-white/10 bg-white/[0.025] px-2 py-1 font-mono text-[11px] text-white/52 transition hover:border-cyan-300/22 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/45"
            >
              llms-full.txt
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
