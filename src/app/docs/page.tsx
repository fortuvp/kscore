import type { Metadata } from "next";
import { ArrowRight, ChevronRight, FileText } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Guide",
  description: "Step-by-step instructions for finding, submitting, reporting, and withdrawing KSCORE agents.",
};

type DocLink = { href: string; label: string };
type DocNavGroup = { title: string; links: readonly DocLink[] };

const DOC_NAV: readonly DocNavGroup[] = [
  {
    title: "Get started",
    links: [
      { href: "#overview", label: "Choose a task" },
      { href: "#find", label: "Find an agent" },
      { href: "#statuses", label: "Status reference" },
    ],
  },
  {
    title: "Workflows",
    links: [
      { href: "#submit", label: "Submit an agent" },
      { href: "#report", label: "Report abuse" },
      { href: "#withdraw", label: "Withdraw collateral" },
    ],
  },
  {
    title: "Integrate",
    links: [
      { href: "#certificate", label: "Build a certificate" },
      { href: "#agents", label: "AI agent files" },
    ],
  },
];

const ALL_DOC_LINKS = DOC_NAV.flatMap((group) => group.links);

const STATUS_ROWS = [
  {
    status: "Active",
    tone: "bg-emerald-300",
    meaning: "The listing is accepted and its collateral is active.",
    action: "Open the agent page before use to confirm the status is still Active.",
  },
  {
    status: "In review",
    tone: "bg-amber-300",
    meaning: "The submission or an active report is unresolved.",
    action: "Wait for the status to change before treating the agent as verified.",
  },
  {
    status: "Removed",
    tone: "bg-rose-300",
    meaning: "A successful report removed the listing.",
    action: "Do not treat the agent as verified.",
  },
  {
    status: "Withdrawn",
    tone: "bg-slate-400",
    meaning: "The owner completed a voluntary withdrawal.",
    action: "Treat the agent as unverified without assuming misconduct.",
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
            <h1 className="text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl">KSCORE step-by-step guide</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-white/58">
              Choose a task, press the named button, and follow the wallet prompts shown on screen.
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

          <GuideSection id="overview" title="Choose a task">
            <div className="grid gap-2 sm:grid-cols-2">
              <TaskLink href="#find" label="Find an agent" />
              <TaskLink href="#submit" label="Submit an agent" />
              <TaskLink href="#report" label="Report abuse" />
              <TaskLink href="#withdraw" label="Withdraw collateral" />
            </div>
          </GuideSection>

          <GuideSection id="find" title="Find or open an agent">
            <ActionSteps>
              <ActionStep number="1">Press <strong>Verified Agents</strong> in the header to open the collateral registry.</ActionStep>
              <ActionStep number="2">Enter a name or number in <strong>Search by agent name or number</strong> to filter the registry results.</ActionStep>
              <ActionStep number="3">Press an agent result to open its profile, current collateral, history, reviews, and registry status.</ActionStep>
              <ActionStep number="4">If the agent is not listed, scroll to <strong>Direct agent lookup</strong>, enter its number and source network, then press <strong>View agent page</strong>.</ActionStep>
            </ActionSteps>
            <PrimaryLink href="/verified" label="Open Verified Agents" />
          </GuideSection>

          <GuideSection id="statuses" title="Status reference">
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
            <ActionSteps>
              <ActionStep number="1">Press <strong>Submit your agent</strong> on the Verified Agents page to open the submission form.</ActionStep>
              <ActionStep number="2">Select the agent source network, enter its ERC-8004 number, and press the load button to fill the registration fields.</ActionStep>
              <ActionStep number="3">Connect the funding wallet, switch to the registry network shown in the form, and enter an ERC-20 stake at or above the displayed minimum.</ActionStep>
              <ActionStep number="4">Review every field, open the linked policy, and check <strong>I have read the registry policy and reviewed every field</strong>.</ActionStep>
              <ActionStep number="5">Press <strong>Submit on [network]</strong> to open the transaction preview with the stake, arbitration deposit, registry address, and item data.</ActionStep>
              <ActionStep number="6">Press <strong>Start signing</strong>, approve the ERC-20 transfer if requested, confirm the submission transaction, then press <strong>Done</strong>.</ActionStep>
            </ActionSteps>
            <PrimaryLink href="/submit" label="Open submission form" />
          </GuideSection>

          <GuideSection id="report" title="Report abuse">
            <ActionSteps>
              <ActionStep number="1">Open an agent with active collateral and press <strong>Report abuse</strong>.</ActionStep>
              <ActionStep number="2">Check the popup for the live ERC-20 report deposit, arbitration cost, and bounty paid if the report succeeds.</ActionStep>
              <ActionStep number="3">Enter an evidence title, explain the violation, and attach a supporting file when needed.</ActionStep>
              <ActionStep number="4">Press <strong>Read policy</strong>, review the criteria, and check the confirmation that a failed report loses the report deposit.</ActionStep>
              <ActionStep number="5">Press <strong>Report</strong>, approve the ERC-20 deposit if requested, and confirm the wallet transaction.</ActionStep>
            </ActionSteps>
          </GuideSection>

          <GuideSection id="withdraw" title="Withdraw collateral">
            <ActionSteps>
              <ActionStep number="1">Connect the wallet that funded the listing and open the agent profile on the registry network.</ActionStep>
              <ActionStep number="2">Press <strong>Start withdraw</strong>, read the displayed waiting period, then press <strong>Start withdraw</strong> again and confirm the wallet transaction.</ActionStep>
              <ActionStep number="3">Return after the waiting period ends and press <strong>Execute withdrawal</strong> to submit the final transaction.</ActionStep>
              <ActionStep number="4">After confirmation, the listing becomes Withdrawn and the contract returns the recorded ERC-20 stake and native arbitration deposit if no report succeeded.</ActionStep>
            </ActionSteps>
          </GuideSection>

          <GuideSection id="certificate" title="Build a certificate">
            <p>Press <strong>Build a Certificate</strong> in the header to open the certificate overview; custom certificate deployment is not live yet.</p>
            <PrimaryLink href="/launch" label="Open certificate overview" />
          </GuideSection>

          <GuideSection id="agents" title="AI agent files">
            <ActionSteps>
              <ActionStep number="1">Press <strong>Skills</strong> in the header to open the machine-readable instructions.</ActionStep>
              <ActionStep number="2">Choose Mainnet or Sepolia, then copy the displayed prompt into the agent that will use KSCORE.</ActionStep>
              <ActionStep number="3">Use <strong>SKILL.md</strong> for the short entry point or <strong>llms-full.txt</strong> for the complete local reference.</ActionStep>
            </ActionSteps>
            <PrimaryLink href="/skills" label="Open Skills" />
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

function TaskLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className="flex items-center justify-between rounded-lg border border-white/[0.09] bg-white/[0.02] px-4 py-3 text-sm font-medium text-white/72 transition hover:border-cyan-300/25 hover:text-cyan-100">
      {label}
      <ArrowRight className="h-4 w-4 text-cyan-200/70" aria-hidden="true" />
    </a>
  );
}

function ActionSteps({ children }: { children: React.ReactNode }) {
  return <ol className="mt-5 space-y-3">{children}</ol>;
}

function ActionStep({ number, children }: { number: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 rounded-lg border border-white/[0.08] bg-white/[0.018] px-4 py-3.5 text-sm leading-6 text-white/62">
      <span className="flex h-6 w-6 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] font-mono text-[11px] text-cyan-200">{number}</span>
      <span className="[&_strong]:font-semibold [&_strong]:text-white/90">{children}</span>
    </li>
  );
}

function PrimaryLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-200 transition hover:text-cyan-100">
      {label}
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}
