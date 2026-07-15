import type { Metadata } from "next";
import { ArrowRight, Bot, Check, ChevronRight, CircleAlert, FileText, Gavel, ShieldCheck } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Guide",
  description: "A clear operational guide to KSCORE Verified Agents, collateral, challenges, and withdrawals.",
};

type DocLink = { href: string; label: string };
type DocNavGroup = { title: string; links: readonly DocLink[] };

const DOC_NAV: readonly DocNavGroup[] = [
  {
    title: "Get started",
    links: [
      { href: "#overview", label: "Overview" },
      { href: "#verification", label: "How verification works" },
      { href: "#statuses", label: "Status reference" },
    ],
  },
  {
    title: "Workflows",
    links: [
      { href: "#submit", label: "Submit an agent" },
      { href: "#withdraw", label: "Withdraw safely" },
      { href: "#challenge", label: "Challenge a listing" },
    ],
  },
  {
    title: "Integrate",
    links: [
      { href: "#standards", label: "Build a standard" },
      { href: "#agents", label: "AI agent instructions" },
    ],
  },
];

const ALL_DOC_LINKS = DOC_NAV.flatMap((group) => group.links);

const STATUS_ROWS = [
  {
    status: "Active",
    tone: "bg-emerald-300",
    meaning: "Collateral is active and the listing currently complies with this registry’s policy.",
    action: "Usable as a positive policy signal. Still verify the live status before granting access.",
  },
  {
    status: "In review",
    tone: "bg-amber-300",
    meaning: "The listing is pending or challenged. Its compliance signal is unresolved.",
    action: "Do not treat it as verified until the review or dispute ends.",
  },
  {
    status: "Removed",
    tone: "bg-rose-300",
    meaning: "A successful challenge and dispute found the listing non-compliant.",
    action: "Do not grant privileges based on this verification.",
  },
  {
    status: "Withdrawn",
    tone: "bg-slate-400",
    meaning: "The owner voluntarily left the list without an adverse ruling.",
    action: "Treat it as no longer verified—not as proof of misconduct.",
  },
] as const;

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-[#05090f]">
      <div className="mx-auto grid w-full max-w-[1440px] items-start lg:grid-cols-[13.5rem_minmax(0,1fr)] xl:grid-cols-[13.5rem_minmax(0,760px)_11rem] xl:justify-center">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] border-r border-white/[0.07] px-5 py-9 lg:block">
          <Link href="/docs" className="flex items-center gap-2 text-sm font-semibold text-white">
            <FileText className="h-4 w-4 text-cyan-200" aria-hidden="true" />
            KSCORE Guide
          </Link>
          <nav aria-label="Guide navigation" className="mt-8 space-y-7">
            {DOC_NAV.map((group) => (
              <div key={group.title}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/30">{group.title}</div>
                <div className="mt-2 space-y-0.5">
                  {group.links.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      className="block rounded-md px-2 py-1.5 text-[13px] text-white/48 transition hover:bg-white/[0.045] hover:text-white/80"
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <Link
            href="/skills"
            className="mt-9 flex items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2.5 text-xs font-medium text-white/58 transition hover:border-cyan-300/22 hover:text-cyan-100"
          >
            Agent skills
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </aside>

        <article className="min-w-0 px-5 py-10 sm:px-8 sm:py-14 lg:px-10 xl:px-12">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-white/36">
            <span>Documentation</span>
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
            <span className="text-white/62">Overview</span>
          </nav>

          <div className="mt-6 border-b border-white/[0.08] pb-9">
            <h1 className="text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl">Verified Agents guide</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-white/58">
              Understand exactly what the registry proves, how collateral and challenges work, and when it is safe to rely on a listing.
            </p>
          </div>

          <nav aria-label="Guide sections" className="-mx-1 mt-5 flex gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
            {ALL_DOC_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="shrink-0 rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/52"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <GuideSection id="overview" title="The short version">
            <p>
              Verified Agents is a permissionless, collateralized registry governed by a public policy. Anyone may submit an agent. Anyone may challenge a listing that fails the criteria. Kleros resolves disputes when the parties disagree.
            </p>
            <Callout icon={ShieldCheck} title="A scoped signal—not a universal endorsement">
              Active means the agent currently complies with this registry’s published policy. It does not guarantee every behavior, capability, or future action.
            </Callout>
          </GuideSection>

          <GuideSection id="verification" title="How verification works">
            <ol className="mt-5 space-y-5">
              <Step number="1" title="A policy defines the claim">
                Criteria must be observable and evidence-based so submitters, challengers, and jurors can evaluate the same question.
              </Step>
              <Step number="2" title="The owner posts collateral">
                The agent owner deposits at least the live minimum stake plus the arbitration fee deposit. Higher collateral can improve stake-ranked visibility, but never replaces compliance.
              </Step>
              <Step number="3" title="The listing remains challengeable">
                A reviewer can challenge non-compliant behavior and submit evidence. If disputed, Kleros jurors apply the policy to that evidence.
              </Step>
              <Step number="4" title="Applications read the live result">
                Products should grant privileges only while the listing is active and the policy matches the criteria they actually need.
              </Step>
            </ol>
          </GuideSection>

          <GuideSection id="statuses" title="Status reference">
            <p>Statuses describe the listing lifecycle. Read them literally and check the current on-chain state before making a high-stakes decision.</p>
            <div className="mt-5 overflow-hidden rounded-xl border border-white/[0.09]">
              {STATUS_ROWS.map((row, index) => (
                <div
                  key={row.status}
                  className={`grid gap-2 bg-white/[0.018] p-4 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-5 ${
                    index ? "border-t border-white/[0.07]" : ""
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <span className={`h-2 w-2 rounded-full ${row.tone}`} />
                    {row.status}
                  </div>
                  <div>
                    <p className="text-sm leading-6 text-white/62">{row.meaning}</p>
                    <p className="mt-1 text-xs leading-5 text-white/36">{row.action}</p>
                  </div>
                </div>
              ))}
            </div>
          </GuideSection>

          <GuideSection id="submit" title="Submit an agent">
            <p>The submission form reads the live policy, minimum stake, token, arbitration cost, and waiting period from the selected pGTCR registry.</p>
            <div className="mt-5 rounded-xl border border-white/[0.09] bg-[#090f17] p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200/70">Signing sequence</div>
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <CompactStep number="1" title="Approve collateral">
                  Authorize the registry to transfer the exact ERC-20 stake shown in the preview.
                </CompactStep>
                <CompactStep number="2" title="Submit the listing">
                  Add the item with the native arbitration fee deposit attached.
                </CompactStep>
              </div>
            </div>
            <Callout icon={CircleAlert} title="Review before signing" tone="amber">
              Confirm the agent identity, source chain, policy evidence, stake token, both amounts, registry address, and selected network in the preview.
            </Callout>
          </GuideSection>

          <GuideSection id="withdraw" title="Withdraw safely">
            <p>
              Withdrawal is a voluntary exit, not a finding of non-compliance. Start the withdrawal, monitor the listing during the live waiting period, then finalize it when the contract permits.
            </p>
            <ul className="mt-5 space-y-3">
              <CheckItem>A finalized, voluntary, unchallenged withdrawal returns the recorded ERC-20 stake and native arbitration deposit.</CheckItem>
              <CheckItem>The listing remains visible and challengeable during the waiting period.</CheckItem>
              <CheckItem>Network gas and upload costs are separate and are not refunded.</CheckItem>
              <CheckItem>A successful challenge can delay or prevent recovery.</CheckItem>
            </ul>
          </GuideSection>

          <GuideSection id="challenge" title="Challenge a listing">
            <p>
              Challenge only when durable evidence shows a specific policy violation. A correct challenger may earn collateral; an incorrect challenger can lose their deposit and pay fees.
            </p>
            <Callout icon={Gavel} title="Evidence should be reproducible">
              Tie every claim to a policy clause. Include timestamps, agent identifiers, repeatable tests, and stable content-addressed files when possible. Challenging is never guaranteed profit.
            </Callout>
          </GuideSection>

          <GuideSection id="standards" title="Build a verification standard">
            <p>Anything can be verified when the criteria are specific enough for independent reviewers to reach the same conclusion.</p>
            <ul className="mt-5 space-y-3">
              <CheckItem>State exactly what behavior or capability passes.</CheckItem>
              <CheckItem>Define accepted evidence, exclusions, and a clear failure condition.</CheckItem>
              <CheckItem>Set economics that make dishonest submissions costly and useful review worthwhile.</CheckItem>
              <CheckItem>Grant application privileges only while the agent remains active.</CheckItem>
            </ul>
            <Link href="/launch" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-200 transition hover:text-cyan-100">
              Build your standard
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </GuideSection>

          <GuideSection id="agents" title="Instructions for AI agents">
            <p>
              KSCORE publishes local machine-readable files that route agents to the right registry overlay and require the complete Kleros Skills package for operational mechanics.
            </p>
            <Link
              href="/skills"
              className="mt-5 flex items-center justify-between rounded-xl border border-cyan-300/18 bg-cyan-300/[0.045] p-4 transition hover:border-cyan-300/32 hover:bg-cyan-300/[0.065]"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-300/[0.1] text-cyan-200">
                  <Bot className="h-4 w-4" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-white">Open Guide &amp; Skills</span>
                  <span className="mt-0.5 block text-xs text-white/42">Copy the agent prompt or inspect the local files.</span>
                </span>
              </span>
              <ArrowRight className="h-4 w-4 text-cyan-200" aria-hidden="true" />
            </Link>
          </GuideSection>
        </article>

        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] border-l border-white/[0.07] px-5 py-10 xl:block">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/30">On this page</div>
          <nav aria-label="On this page" className="mt-3 space-y-2">
            {ALL_DOC_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="block text-xs leading-5 text-white/40 transition hover:text-cyan-100">
                {link.label}
              </a>
            ))}
          </nav>
        </aside>
      </div>
    </div>
  );
}

function GuideSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-b border-white/[0.08] py-10 last:border-b-0 sm:py-12">
      <h2 className="text-2xl font-semibold tracking-[-0.025em] text-white">{title}</h2>
      <div className="mt-4 text-sm leading-7 text-white/56 sm:text-[15px]">{children}</div>
    </section>
  );
}

function Step({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3">
      <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-white/12 bg-white/[0.03] font-mono text-xs text-cyan-200">{number}</span>
      <div>
        <div className="font-semibold text-white/88">{title}</div>
        <p className="mt-1 text-sm leading-6 text-white/50">{children}</p>
      </div>
    </li>
  );
}

function CompactStep({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <span className="font-mono text-xs text-cyan-300">{number}.</span>
        {title}
      </div>
      <p className="mt-2 text-xs leading-5 text-white/44">{children}</p>
    </div>
  );
}

function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm leading-6 text-white/55">
      <Check className="mt-1 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

function Callout({
  icon: Icon,
  title,
  tone = "cyan",
  children,
}: {
  icon: typeof ShieldCheck;
  title: string;
  tone?: "cyan" | "amber";
  children: React.ReactNode;
}) {
  const colors =
    tone === "amber"
      ? "border-amber-300/15 bg-amber-300/[0.04] text-amber-100"
      : "border-cyan-300/15 bg-cyan-300/[0.04] text-cyan-100";
  return (
    <div className={`mt-6 rounded-xl border p-4 ${colors}`}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4" aria-hidden="true" />
        {title}
      </div>
      <p className="mt-2 text-sm leading-6 text-white/52">{children}</p>
    </div>
  );
}
