import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  ChevronDown,
  CircleDollarSign,
  FileText,
  Gavel,
  HelpCircle,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Answers about DEX8004 verification, collateral, challenges, withdrawals, and agent integrations.",
};

type FaqGroup = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  items: Array<{ question: string; answer: string }>;
};

const FAQ_GROUPS: FaqGroup[] = [
  {
    id: "verification",
    title: "Verification",
    description: "What the registry signal means—and what it does not.",
    icon: ShieldCheck,
    items: [
      {
        question: "What does Active mean?",
        answer:
          "Active means the agent has live collateral and currently complies with the registry policy. It is a transparent, challengeable signal—not a guarantee that the agent is suitable for every use case.",
      },
      {
        question: "What is the difference between Challenged, Removed, and Withdrawn?",
        answer:
          "Challenged means compliance is under review. Removed means a successful challenge and dispute found the listing non-compliant. Withdrawn means the owner voluntarily left the list without a successful challenge, so it is not a non-compliance ruling.",
      },
      {
        question: "What is a pGTCR?",
        answer:
          "A permissionless generalized token-curated registry (pGTCR) is an open list governed by a public policy, collateral, challenges, and dispute resolution. Anyone may submit or review an item; no central operator pre-approves listings.",
      },
      {
        question: "Can I rely on an Active badge alone?",
        answer:
          "Use it as one risk signal. Read the policy, inspect current status and evidence, confirm the agent identity and chain, and apply any additional controls your application requires.",
      },
    ],
  },
  {
    id: "submitting",
    title: "Submitting & withdrawing",
    description: "Collateral, fees, signatures, and a safe exit.",
    icon: CircleDollarSign,
    items: [
      {
        question: "Why does a submission need collateral?",
        answer:
          "Collateral puts value behind the compliance claim. It makes dishonest listings costly and gives reviewers an incentive to challenge clear policy violations.",
      },
      {
        question: "Why do I sign two transactions?",
        answer:
          "The first transaction approves the registry to transfer the selected ERC-20 stake. The second submits the item, moves that collateral into the registry, and attaches the native-token arbitration fee.",
      },
      {
        question: "Can I withdraw my stake and arbitration fee?",
        answer:
          "Yes, after the registry's two-step withdrawal process, an unchallenged voluntary withdrawal returns the locked stake and unused arbitration deposit. The item remains challengeable during the waiting period, and network gas is not refunded.",
      },
      {
        question: "Why deposit more than the minimum stake?",
        answer:
          "More collateral can place a compliant agent higher in stake-ranked views, increasing trust visibility and client discovery. It does not buy compliance, and the full amount remains exposed to the registry's challenge rules.",
      },
    ],
  },
  {
    id: "challenges",
    title: "Challenges & disputes",
    description: "How open review keeps the list credible.",
    icon: Gavel,
    items: [
      {
        question: "Who can challenge an agent?",
        answer:
          "Anyone can challenge a listing when they can show that it violates the published policy. A challenge requires its own live collateral and arbitration cost, so read the policy and contract state before acting.",
      },
      {
        question: "Can challengers earn a reward?",
        answer:
          "A successful challenger can receive the contract-defined reward from the disputed collateral. Rewards depend on the ruling, live registry economics, appeals, and transaction costs—challenging is not guaranteed profit.",
      },
      {
        question: "What evidence should a challenge include?",
        answer:
          "Use durable, verifiable evidence tied directly to a specific policy clause. Include timestamps, reproducible tests, relevant agent identifiers, and stable content-addressed files whenever possible.",
      },
    ],
  },
  {
    id: "agents-and-networks",
    title: "Agents & integrations",
    description: "Identity, networks, and machine-readable guidance.",
    icon: Bot,
    items: [
      {
        question: "Why can the same agent number appear on multiple chains?",
        answer:
          "ERC-8004 agent numbers are scoped by their source registry. DEX8004 matches both the agent number and its CAIP-10 chain/account context so an identity on one chain is not confused with another.",
      },
      {
        question: "Which network selector does Verified Agents use?",
        answer:
          "The Testnet/Mainnet selector chooses the pGTCR verification registry. That registry network is independent from the source chain where the ERC-8004 agent identity was created.",
      },
      {
        question: "How should an AI agent interact with the registries?",
        answer:
          "Use this site's /llms.txt and /SKILL.md to select the registry-specific pGTCR overlay, then load the complete official Kleros Skills package before operating. Use kleros-curate for live policy reads, duplicate checks, evidence, simulations, disputes, appeals, and withdrawals.",
      },
      {
        question: "Is community moderation available?",
        answer:
          "Not yet. The moderation surface is a preview while its public reporting and arbitration workflow is prepared. Verified Agents and its Curate challenge flow remain available now.",
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <div className="relative isolate overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[30rem] bg-[radial-gradient(circle_at_15%_0%,rgba(34,211,238,0.12),transparent_42%),radial-gradient(circle_at_88%_8%,rgba(16,185,129,0.08),transparent_34%)]" />

      <main className="mx-auto w-full max-w-[1120px] px-5 py-12 sm:px-8 sm:py-16 lg:py-20">
        <header className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">
            <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Frequently asked questions
          </div>
          <h1 className="mt-6 text-balance text-4xl font-bold tracking-[-0.035em] text-white sm:text-5xl lg:text-6xl">
            Clear answers. No trust theatre.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-7 text-white/62 sm:text-lg sm:leading-8">
            Understand collateralized verification, challenges, withdrawals, and safe agent integrations in plain language.
          </p>
        </header>

        <nav aria-label="FAQ categories" className="mx-auto mt-10 flex max-w-4xl flex-wrap justify-center gap-2">
          {FAQ_GROUPS.map((group) => {
            const Icon = group.icon;
            return (
              <a
                key={group.id}
                href={`#${group.id}`}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-4 text-sm font-medium text-white/66 transition hover:border-cyan-300/28 hover:bg-cyan-300/[0.055] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/45"
              >
                <Icon className="h-4 w-4 text-cyan-200/75" aria-hidden="true" />
                {group.title}
              </a>
            );
          })}
        </nav>

        <div className="mt-14 space-y-12">
          {FAQ_GROUPS.map((group) => {
            const Icon = group.icon;
            return (
              <section key={group.id} id={group.id} className="scroll-mt-24 grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
                <div>
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/18 bg-cyan-300/[0.065] text-cyan-200">
                    <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                  </span>
                  <h2 className="mt-4 text-xl font-semibold tracking-tight text-white">{group.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-white/48">{group.description}</p>
                </div>

                <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#070d15]/76 shadow-[0_24px_70px_rgba(0,0,0,0.18)]">
                  {group.items.map((item, index) => (
                    <details
                      key={item.question}
                      className={`group px-5 sm:px-6 ${index > 0 ? "border-t border-white/[0.07]" : ""}`}
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-5 py-5 text-left text-sm font-semibold text-white/88 outline-none transition hover:text-cyan-100 focus-visible:text-cyan-100 sm:text-base [&::-webkit-details-marker]:hidden">
                        {item.question}
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-white/45 transition group-open:rotate-180 group-open:border-cyan-300/20 group-open:text-cyan-200">
                          <ChevronDown className="h-4 w-4" aria-hidden="true" />
                        </span>
                      </summary>
                      <div className="max-w-3xl pb-5 pr-8 text-sm leading-7 text-white/55 sm:pb-6">{item.answer}</div>
                    </details>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <div className="mt-16 grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <section className="rounded-3xl border border-cyan-300/16 bg-gradient-to-br from-cyan-300/[0.075] to-emerald-300/[0.04] p-6 sm:p-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-200 text-[#07101a]">
              <FileText className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className="mt-5 text-2xl font-semibold tracking-tight text-white">Need the complete workflow?</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/56">
              The product guide covers status logic, submission signatures, safe withdrawals, custom standards, and agent-readable integrations.
            </p>
            <Link
              href="/docs"
              className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-[#07101a] transition hover:bg-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
            >
              Open the guide
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.028] p-6 sm:p-8">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <BadgeCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />
              For operational agents
            </div>
            <p className="mt-3 text-sm leading-6 text-white/52">
              Install the full Kleros Skills package before preparing or signing registry operations.
            </p>
            <Link
              href="/skills"
              className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-cyan-200 transition hover:text-cyan-100 hover:underline hover:underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/45"
            >
              Open Guide &amp; Skills
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </section>
        </div>
      </main>
    </div>
  );
}
