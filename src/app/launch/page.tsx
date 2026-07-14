"use client";

import * as React from "react";
import {
  BadgeCheck,
  Building2,
  Landmark,
  ListChecks,
  LockKeyhole,
  Network,
  SlidersHorizontal,
  TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const BADGE_EXAMPLES = [
  "payment-ready agents",
  "trading specialists",
  "financial services agents",
  "privacy-compliant agents",
  "jurisdiction-ready agents",
  "high-quality auditors",
] as const;

const LIST_PREVIEW = [
  { name: "Payment Operator", criteria: "KYB + policy", tone: "text-cyan-200" },
  { name: "Trading Strategist", criteria: "Risk tested", tone: "text-emerald-200" },
  { name: "High quality auditors", criteria: "Audit standard", tone: "text-amber-200" },
] as const;

export default function LaunchPage() {
  const [exampleIndex, setExampleIndex] = React.useState(0);

  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(
      () => setExampleIndex((current) => (current + 1) % BADGE_EXAMPLES.length),
      2800
    );
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="bg-[#05080d] text-white">
      <main className="container mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <section className="border-y border-white/10 py-14 text-center sm:py-20">
          <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase text-cyan-200">
            <ListChecks className="h-4 w-4" />
            Custom verification standards
          </div>
          <h1 className="mx-auto mt-5 max-w-4xl text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
            Build a standard the market can trust
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-white/70">
            Define what agents must prove, issue a recognizable verification badge, and let products check it before granting access, credentials, or preferred terms.
          </p>
          <p className="mx-auto mt-3 max-w-3xl text-sm font-medium text-white/90">
            Your evidence. Your reviewers. Your badge.
          </p>
          <div className="mt-8">
            <Button type="button" size="lg" className="bg-cyan-300 text-[#041014] hover:bg-cyan-200">
              Build Your Standard
            </Button>
          </div>

          <div className="mx-auto mt-12 max-w-3xl border border-white/12 bg-black/25 text-left">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="text-xs font-semibold uppercase text-white/55">Verified agent lists</span>
              <Badge className="border-emerald-400/25 bg-emerald-400/10 text-emerald-200">AVAILABLE BADGES</Badge>
            </div>
            {LIST_PREVIEW.map((agent, index) => (
              <div key={agent.name} className="flex items-center gap-3 border-b border-white/8 px-4 py-3 last:border-b-0">
                <span className="font-mono text-xs text-white/35">0{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{agent.name}</span>
                <span className={`text-xs ${agent.tone}`}>{agent.criteria}</span>
                <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-300" />
              </div>
            ))}
          </div>
        </section>

        <section className="grid items-center gap-8 border-b border-white/10 py-12 md:grid-cols-[0.38fr_1fr]">
          <div className="text-sm font-semibold text-white/55">Built for a specific market</div>
          <div>
            <div className="text-2xl font-semibold sm:text-3xl">
              Create a verified badge for{" "}
              <span key={BADGE_EXAMPLES[exampleIndex]} className="text-cyan-200">{BADGE_EXAMPLES[exampleIndex]}</span>
            </div>
            <p className="mt-3 text-sm text-white/60">Badge membership becomes a portable policy signal that any product can check.</p>
          </div>
        </section>

        <section className="border-b border-white/10 py-14">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-amber-200">
              <Network className="h-4 w-4" />
              Credential network example
            </div>
            <h2 className="mt-4 text-3xl font-semibold">Grant privileges only when the badge proves your policy</h2>
            <p className="mt-4 text-base leading-relaxed text-white/70">
              A network can issue credentials only to agents that pass verification. Protection does not stop at approval: if an agent later violates the policy, goes rogue, or is compromised, anyone can flag it and trigger a transparent dispute that can revoke its badge.
            </p>
          </div>

          <div className="mt-10 grid border-l border-t border-white/10 md:grid-cols-3">
            <UseCase icon={TrendingUp} title="Trading" copy="Require tested strategies, risk limits, and transparent operators." />
            <UseCase icon={Landmark} title="Financial services" copy="List agents approved for payments, underwriting, or regulated workflows." />
            <UseCase icon={LockKeyhole} title="Privacy" copy="Verify agents that handle user or A2A data responsibly by proving they do not retain or share it with third parties, or by providing TEE-backed attestations." />
          </div>
        </section>

        <section className="py-14">
          <h2 className="text-3xl font-semibold">A standard you control</h2>
          <div className="mt-8 grid gap-px bg-white/10 md:grid-cols-3">
            <Benefit icon={SlidersHorizontal} number="01" title="Define the criteria" copy="Choose the evidence, deposits, reviewers, and challenge rules." />
            <Benefit icon={Building2} number="02" title="Issue your badge" copy="Publish it under your brand and make it part of your product policy." />
            <Benefit icon={BadgeCheck} number="03" title="Gate real benefits" copy="Use badge membership for credentials, access, placement, or preferred terms." />
          </div>
        </section>

        <section className="flex flex-col gap-6 border-t border-white/10 py-12 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Turn your policy into a badge products can trust</h2>
            <p className="mt-2 text-sm text-white/60">Your organization defines what verified means; Kleros can support transparent challenges.</p>
          </div>
          <Button type="button" size="lg" className="shrink-0 bg-cyan-300 text-[#041014] hover:bg-cyan-200">
            Build Your Standard
          </Button>
        </section>
      </main>
    </div>
  );
}

function UseCase({ icon: Icon, title, copy }: { icon: React.ComponentType<{ className?: string }>; title: string; copy: string }) {
  return (
    <div className="min-h-44 border-b border-r border-white/10 p-6">
      <Icon className="h-5 w-5 text-cyan-200" />
      <h3 className="mt-5 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-white/60">{copy}</p>
    </div>
  );
}

function Benefit({
  icon: Icon,
  number,
  title,
  copy,
}: {
  icon: React.ComponentType<{ className?: string }>;
  number: string;
  title: string;
  copy: string;
}) {
  return (
    <div className="min-h-48 bg-[#05080d] p-6">
      <div className="flex items-center justify-between">
        <Icon className="h-5 w-5 text-emerald-200" />
        <span className="font-mono text-xs text-white/35">{number}</span>
      </div>
      <h3 className="mt-6 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-white/60">{copy}</p>
    </div>
  );
}
