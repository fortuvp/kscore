"use client";

import * as React from "react";
import {
  BadgeCheck,
  Building2,
  Gauge,
  Landmark,
  LockKeyhole,
  Megaphone,
  Network,
  RefreshCw,
  SlidersHorizontal,
  TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const CERTIFICATE_EXAMPLES = [
  "payment-ready agents",
  "trading specialists",
  "financial services agents",
  "privacy-compliant agents",
  "jurisdiction-ready agents",
  "high-quality auditors",
] as const;

const LIST_PREVIEW = [
  { name: "Payment Operator", criteria: "KYB + policy", tone: "text-cyan-200" },
  { name: "Trading Strategist", criteria: "Min 0.7 WETH collateral", tone: "text-emerald-200" },
  { name: "High quality auditors", criteria: "Audit criteria", tone: "text-amber-200" },
] as const;

export default function LaunchPage() {
  const [exampleIndex, setExampleIndex] = React.useState(0);

  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(
      () => setExampleIndex((current) => (current + 1) % CERTIFICATE_EXAMPLES.length),
      2800
    );
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="bg-[#05080d] text-white">
      <main className="container mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <section className="pb-14 text-center sm:pb-20">
          <h1 className="mx-auto max-w-4xl text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
            Build a certificate the market can trust
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-white/70">
            Define what agents must prove and launch the verification before granting a certificate, access, or preferred terms.
          </p>
          <p className="mx-auto mt-3 max-w-3xl text-sm font-medium text-white/90">
            Your requirements. Your reviewers. Your certificate.
          </p>
          <div className="mt-8">
            <Button type="button" size="lg" className="bg-cyan-300 text-[#041014] hover:bg-cyan-200">
              Build Your Certificate
            </Button>
          </div>

          <div className="mx-auto mt-12 max-w-3xl border border-white/12 bg-black/25 text-left">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="text-xs font-semibold uppercase text-white/55">Certificate holders</span>
              <Badge className="border-emerald-400/25 bg-emerald-400/10 text-emerald-200">CERTIFICATE</Badge>
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

        <div className="border-b border-white/10 pb-10">
          <div className="mx-auto max-w-4xl overflow-hidden border border-cyan-300/20 bg-cyan-300/[0.045]">
            <div className="grid items-center gap-5 px-6 py-5 sm:grid-cols-[auto_1fr] sm:px-7">
              <div className="flex items-center gap-2.5 text-sm font-bold uppercase tracking-[0.14em] text-cyan-100">
                <span className="relative flex h-11 w-11 items-center justify-center rounded-full border border-cyan-200/30 bg-cyan-200/10">
                  <Network className="h-5 w-5" aria-hidden="true" />
                  <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[#071016] bg-emerald-300" />
                </span>
                Fully ERC-8004 compatible
              </div>
              <p className="text-base leading-7 text-white/72 sm:border-l sm:border-white/10 sm:pl-6">
                Your certificate will be discoverable on any block explorer, app, or agent that supports ERC-8004.
              </p>
            </div>
          </div>
        </div>

        <section className="border-b border-white/10 py-12 text-center">
          <div className="whitespace-nowrap text-[clamp(0.7rem,3.2vw,1.875rem)] font-semibold tracking-tight">
            Create a verified certificate for{" "}
            <span key={CERTIFICATE_EXAMPLES[exampleIndex]} className="text-cyan-200">{CERTIFICATE_EXAMPLES[exampleIndex]}</span>
          </div>
        </section>

        <section className="border-b border-white/10 py-14">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-semibold">Grant privileges only when the agent complies with your criteria.</h2>
            <p className="mt-4 text-base leading-relaxed text-white/70">
              A network can issue certificates only to agents that pass verification. Protection does not stop at approval: if an agent later violates the policy, goes rogue, or is compromised, anyone can flag it and trigger a transparent dispute that can revoke its certificate.
            </p>
          </div>

          <div className="mt-10 grid border-l border-t border-white/10 md:grid-cols-3">
            <UseCase icon={TrendingUp} title="Trading" copy="Require tested strategies, risk limits, and transparent operators." />
            <UseCase icon={Landmark} title="Financial services" copy="Use trust scores to identify agents approved for payments, loan underwriting, and other high-assurance workflows." />
            <UseCase icon={LockKeyhole} title="Privacy" copy="Verify agents that handle user or A2A data responsibly by proving they do not retain or share it with third parties, or by providing TEE-backed attestations." />
          </div>
        </section>

        <section className="py-14">
          <h2 className="text-3xl font-semibold">A certificate you control</h2>
          <div className="mt-8 grid gap-px bg-white/10 md:grid-cols-3">
            <Benefit icon={SlidersHorizontal} number="01" title="Define the criteria" copy="Choose the evidence, deposits, reviewers, and challenge rules." />
            <Benefit icon={Building2} number="02" title="Issue your certificate" copy="Publish it under your brand and make it part of your product policy." />
            <Benefit icon={BadgeCheck} number="03" title="Gate real benefits" copy="Use certificate membership for access, placement, or preferred terms." />
          </div>
        </section>

        <section className="relative overflow-hidden border-y border-white/10 py-14 sm:py-20">
          <div className="pointer-events-none absolute -right-32 top-1/2 h-80 w-80 -translate-y-1/2 rounded-full bg-cyan-300/[0.06] blur-3xl" />
          <div className="relative grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
            <div className="max-w-md">
              <h2 className="text-3xl font-semibold leading-tight sm:text-4xl">Turn Trust Into Growth</h2>
              <p className="mt-5 text-base leading-relaxed text-white/65">
                Cut due diligence costs while verifying more agents than anyone else.
              </p>
              <Button type="button" size="lg" className="mt-7 bg-cyan-300 text-[#041014] hover:bg-cyan-200">
                Build Your Certificate
              </Button>
            </div>

            <div className="divide-y divide-white/10">
              <GrowthPoint
                icon={Megaphone}
                title="More agents, more promotion for your brand"
                copy="Verified agents become ambassadors for your certificate across the ecosystem."
              />
              <GrowthPoint
                icon={Gauge}
                title="A certificate agents want"
                copy="Agents pursue your certificate because it is fair, fast, and boosts their discoverability."
              />
              <GrowthPoint
                icon={RefreshCw}
                title="Keep compliance current"
                copy="Update your terms and agents can adapt themselves without adding operational risk for you."
              />
            </div>
          </div>
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

function GrowthPoint({
  icon: Icon,
  title,
  copy,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  copy: string;
}) {
  return (
    <div className="group grid gap-4 py-7 first:pt-0 last:pb-0 sm:grid-cols-[3rem_1fr] sm:gap-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-300/[0.07] text-cyan-200 ring-1 ring-inset ring-cyan-300/15 transition-colors duration-300 group-hover:bg-cyan-300/[0.12] group-hover:ring-cyan-300/30">
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div>
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/60">{copy}</p>
      </div>
    </div>
  );
}
