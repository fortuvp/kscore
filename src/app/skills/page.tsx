import type { Metadata } from "next";
import { Bot, BookOpen, ChevronRight } from "lucide-react";
import Link from "next/link";

import { AgentSkillsGuide } from "@/components/agent-skills-guide";

export const metadata: Metadata = {
  title: "Skills",
  description: "Local machine-readable instructions for AI agents using KSCORE Verified Agents.",
};

export default function SkillsPage() {
  return (
    <div className="min-h-screen bg-[#05090f]">
      <div className="mx-auto w-full max-w-[1180px] px-5 py-10 sm:px-8 sm:py-14">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-white/40">
          <Link href="/docs" className="transition hover:text-white/75">
            Guide
          </Link>
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
          <span className="text-white/65">Skills</span>
        </nav>

        <header className="mt-7 max-w-3xl border-b border-white/[0.08] pb-9">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/[0.07] text-cyan-200">
            <Bot className="h-5 w-5" aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl">
            Guide &amp; Skills
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-white/58">
            Machine-readable instructions for discovering, submitting, challenging, and withdrawing Verified Agents.
          </p>
        </header>

        <AgentSkillsGuide />

        <section className="mt-12 flex flex-col gap-4 border-t border-white/[0.08] pt-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <BookOpen className="h-4 w-4 text-cyan-200" aria-hidden="true" />
              Need the product concepts first?
            </div>
            <p className="mt-1 text-sm text-white/48">Read statuses, collateral, challenges, and withdrawals in plain language.</p>
          </div>
          <Link
            href="/docs"
            className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-white/[0.035] px-4 text-sm font-medium text-white/75 transition hover:border-cyan-300/28 hover:text-white"
          >
            Open the guide
          </Link>
        </section>
      </div>
    </div>
  );
}
