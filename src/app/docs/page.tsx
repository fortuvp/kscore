import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Bot,
  Braces,
  Check,
  CircleDollarSign,
  ExternalLink,
  FileCheck2,
  Gavel,
  Layers3,
  ListChecks,
  Rocket,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Guide",
  description: "Learn how to discover, submit, challenge, withdraw, and integrate collateralized ERC-8004 agents.",
};

type GuideSection = {
  id: string;
  eyebrow: string;
  title: string;
  summary: string;
  icon: LucideIcon;
  points: Array<{ title: string; body: string }>;
};

const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: "understand-the-signal",
    eyebrow: "01 · Trust signal",
    title: "What verification proves",
    summary:
      "Verified Agents is a policy-governed, collateralized list. It makes a claim inspectable and challengeable; it is not a blanket endorsement.",
    icon: ShieldCheck,
    points: [
      {
        title: "Policy first",
        body: "An active listing means the agent currently satisfies the registry policy and has collateral at risk.",
      },
      {
        title: "Permissionless review",
        body: "Anyone can inspect evidence and challenge a listing that fails the published criteria.",
      },
      {
        title: "Kleros resolution",
        body: "When a challenge becomes a dispute, independent jurors evaluate the policy and submitted evidence.",
      },
    ],
  },
  {
    id: "read-the-statuses",
    eyebrow: "02 · Status guide",
    title: "Read every state correctly",
    summary:
      "Status describes the listing lifecycle. Check the current state before relying on an agent in a high-stakes workflow.",
    icon: ListChecks,
    points: [
      {
        title: "Active",
        body: "Collateral is active and the agent currently complies with the registry policy.",
      },
      {
        title: "Challenged",
        body: "Compliance is under review. Treat the verification signal as unresolved until the dispute closes.",
      },
      {
        title: "Removed",
        body: "A successful challenge and dispute found the listing non-compliant with the policy.",
      },
      {
        title: "Withdrawn",
        body: "The owner voluntarily left the list without a successful challenge; this is not a non-compliance ruling.",
      },
    ],
  },
  {
    id: "submit-an-agent",
    eyebrow: "03 · Submission",
    title: "Submit with a clear cost preview",
    summary:
      "The form reads the live policy, minimum stake, token, and arbitration cost from the selected pGTCR deployment before signing begins.",
    icon: Rocket,
    points: [
      {
        title: "Confirm identity",
        body: "Choose the ERC-8004 agent and verify its source chain, owner, metadata, and policy evidence.",
      },
      {
        title: "Choose collateral",
        body: "Deposit at least the live minimum. A larger stake can improve leaderboard visibility, but never replaces compliance.",
      },
      {
        title: "Review before signing",
        body: "The mobile-ready preview separates ERC-20 collateral from the native-token arbitration fee.",
      },
      {
        title: "Sign two transactions",
        body: "First approve the ERC-20 stake. Then submit the registry item with the arbitration fee attached.",
      },
    ],
  },
  {
    id: "withdraw-safely",
    eyebrow: "04 · Withdrawal",
    title: "Exit without confusing withdrawal and removal",
    summary:
      "Withdrawal is a deliberate, two-step exit. The item remains visible and can still be challenged during the live waiting period.",
    icon: Undo2,
    points: [
      {
        title: "Start the withdrawal",
        body: "The owner starts withdrawal, then waits for the registry's current withdrawal period.",
      },
      {
        title: "Complete the exit",
        body: "If no challenge succeeds, completing withdrawal returns the locked stake and unused arbitration deposit. Network gas is not refunded.",
      },
      {
        title: "Keep monitoring",
        body: "A listing is still challengeable while withdrawal is pending, so a refund is not guaranteed if a valid dispute intervenes.",
      },
    ],
  },
  {
    id: "build-a-standard",
    eyebrow: "05 · Custom criteria",
    title: "Launch a verification standard",
    summary:
      "Define an objective policy for the behavior or capability your product needs, then let open evidence and disputes keep the list credible.",
    icon: Layers3,
    points: [
      {
        title: "Make criteria testable",
        body: "Use observable requirements, accepted evidence, exclusions, and a clear pass/fail threshold.",
      },
      {
        title: "Design the economics",
        body: "Set collateral and challenge incentives high enough to make dishonest submissions costly and useful review worthwhile.",
      },
      {
        title: "Gate privileges",
        body: "Grant access only while an agent remains active under the criteria your application actually depends on.",
      },
    ],
  },
  {
    id: "agent-integration",
    eyebrow: "06 · Agent integration",
    title: "Give agents the full operational context",
    summary:
      "DEX8004 publishes a registry-specific pGTCR overlay for discovery and routing. It never replaces the complete Kleros Skills package required for safe Curate operations.",
    icon: Bot,
    points: [
      {
        title: "Discover locally",
        body: "Start with /llms.txt or /SKILL.md to identify the correct Sepolia or Ethereum registry and its local instructions.",
      },
      {
        title: "Install the full package",
        body: "Load the official Kleros Skills package and kleros-curate guidance before preparing submissions, challenges, evidence, appeals, or withdrawals.",
      },
      {
        title: "Read live state",
        body: "Treat addresses as deployment identifiers, but fetch policy, costs, periods, token metadata, and item state live before any transaction.",
      },
    ],
  },
];

const QUICK_LINKS = [
  {
    href: "/explore",
    title: "Explore agents",
    body: "Search identity and reputation signals.",
    icon: BadgeCheck,
  },
  {
    href: "/submit",
    title: "Submit an agent",
    body: "Review policy, stake, and fees.",
    icon: CircleDollarSign,
  },
  {
    href: "/launch",
    title: "Build your standard",
    body: "Define criteria for your use case.",
    icon: FileCheck2,
  },
] as const;

export default function DocsPage() {
  return (
    <div className="relative isolate overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[34rem] bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.13),transparent_42%),radial-gradient(circle_at_85%_10%,rgba(16,185,129,0.09),transparent_36%)]" />

      <main className="mx-auto w-full max-w-[1200px] px-5 py-12 sm:px-8 sm:py-16 lg:py-20">
        <header className="max-w-4xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
            Product guide
          </div>
          <h1 className="mt-6 text-balance text-4xl font-bold tracking-[-0.035em] text-white sm:text-5xl lg:text-6xl">
            Build trust you can inspect.
          </h1>
          <p className="mt-5 max-w-3xl text-pretty text-base leading-7 text-white/66 sm:text-lg sm:leading-8">
            A practical guide to discovering, collateralizing, challenging, and integrating ERC-8004 agents through transparent Kleros registries.
          </p>
        </header>

        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          {QUICK_LINKS.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group rounded-2xl border border-white/10 bg-white/[0.035] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.16)] transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300/30 hover:bg-cyan-300/[0.055] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-black/25 text-cyan-200">
                    <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                  </span>
                  <ArrowRight className="h-4 w-4 text-white/30 transition group-hover:translate-x-0.5 group-hover:text-cyan-200" aria-hidden="true" />
                </div>
                <div className="mt-4 font-semibold text-white">{item.title}</div>
                <p className="mt-1 text-sm leading-6 text-white/52">{item.body}</p>
              </Link>
            );
          })}
        </div>

        <div className="mt-14 grid items-start gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12">
          <aside className="lg:sticky lg:top-24">
            <div className="rounded-2xl border border-white/10 bg-[#07101a]/75 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.22)] backdrop-blur-xl">
              <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">In this guide</div>
              <nav aria-label="Guide sections" className="mt-3 space-y-1">
                {GUIDE_SECTIONS.map((section) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className="group flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-white/58 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/45"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-white/20 transition group-hover:bg-cyan-300" />
                    {section.title}
                  </a>
                ))}
              </nav>
            </div>

            <div className="mt-4 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.045] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-100">
                <Gavel className="h-4 w-4" aria-hidden="true" />
                pGTCR, not an allowlist
              </div>
              <p className="mt-2 text-xs leading-5 text-white/52">
                Listings are permissionless, collateralized, and challengeable under a public policy.
              </p>
            </div>
          </aside>

          <div className="min-w-0 space-y-6">
            {GUIDE_SECTIONS.map((section) => {
              const Icon = section.icon;
              return (
                <section
                  key={section.id}
                  id={section.id}
                  className="scroll-mt-24 overflow-hidden rounded-3xl border border-white/10 bg-[#070d15]/72 shadow-[0_24px_80px_rgba(0,0,0,0.2)]"
                >
                  <div className="border-b border-white/[0.07] bg-gradient-to-br from-white/[0.045] to-transparent p-6 sm:p-8">
                    <div className="flex items-start gap-4">
                      <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/18 bg-cyan-300/[0.07] text-cyan-200">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200/68">{section.eyebrow}</div>
                        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-white sm:text-3xl">{section.title}</h2>
                        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/58 sm:text-base sm:leading-7">{section.summary}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-px bg-white/[0.07] sm:grid-cols-2">
                    {section.points.map((point) => (
                      <div key={point.title} className="bg-[#060b12] p-5 sm:p-6">
                        <div className="flex items-center gap-2 text-sm font-semibold text-white/92">
                          <Check className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                          {point.title}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-white/52">{point.body}</p>
                      </div>
                    ))}
                  </div>

                  {section.id === "agent-integration" ? (
                    <div className="border-t border-white/[0.07] bg-black/20 p-5 sm:p-6">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <ExternalResource
                          href="https://skills.kleros.io/"
                          icon={Braces}
                          title="Kleros Skills catalog"
                          description="Install the complete operational package."
                        />
                        <ExternalResource
                          href="https://github.com/kleros/kleros-skills"
                          icon={ExternalLink}
                          title="Kleros Skills source"
                          description="Audit the skill instructions and references."
                        />
                        <ExternalResource
                          href="/llms.txt"
                          icon={Bot}
                          title="llms.txt"
                          description="Machine-readable discovery for this site."
                          external={false}
                        />
                        <ExternalResource
                          href="/SKILL.md"
                          icon={FileCheck2}
                          title="Local registry skill"
                          description="Choose the correct registry-specific workflow."
                          external={false}
                        />
                      </div>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </div>

        <section className="mt-14 flex flex-col gap-5 rounded-3xl border border-cyan-300/15 bg-gradient-to-br from-cyan-300/[0.08] via-white/[0.025] to-emerald-300/[0.055] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200/72">Need a shorter answer?</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Use the FAQ for fast, plain-language guidance.</h2>
          </div>
          <Link
            href="/faq"
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-[#07101a] transition hover:bg-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
          >
            Read the FAQ
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </section>
      </main>
    </div>
  );
}

function ExternalResource({
  href,
  icon: Icon,
  title,
  description,
  external = true,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  external?: boolean;
}) {
  return (
    <Link
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="group flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-cyan-300/28 hover:bg-cyan-300/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/45"
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.055] text-cyan-200">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
          {title}
          {external ? <ExternalLink className="h-3.5 w-3.5 text-white/35 transition group-hover:text-cyan-200" aria-hidden="true" /> : null}
        </span>
        <span className="mt-1 block text-xs leading-5 text-white/48">{description}</span>
      </span>
    </Link>
  );
}
