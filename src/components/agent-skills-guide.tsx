"use client";

import * as React from "react";
import { ArrowUpRight, Bot, Check, CheckCircle2, Clipboard, Download, FileText, UserRound } from "lucide-react";
import Link from "next/link";

type Audience = "agent" | "human";

const REGISTRIES = [
  {
    name: "Sepolia",
    detail: "Testnet · chain 11155111",
    skill: "/skills/verified-agents-sepolia/SKILL.md",
    archive: "/skills/verified-agents-sepolia.tar.gz",
  },
  {
    name: "Ethereum",
    detail: "Mainnet · chain 1",
    skill: "/skills/verified-agents-mainnet/SKILL.md",
    archive: "/skills/verified-agents-mainnet.tar.gz",
  },
] as const;

export function AgentSkillsGuide() {
  const [audience, setAudience] = React.useState<Audience>("agent");
  const [entryUrl, setEntryUrl] = React.useState("/llms-full.txt");
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    setEntryUrl(`${window.location.origin}/llms-full.txt`);
  }, []);

  const prompt = `Read ${entryUrl} and follow it before interacting with DEX8004.`;

  async function copyPrompt() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-3" aria-label="Choose guide audience">
        <span className="text-sm text-white/42">I am:</span>
        <div className="inline-flex rounded-lg border border-white/10 bg-black/20 p-1">
          <AudienceButton active={audience === "agent"} onClick={() => setAudience("agent")} icon={Bot}>
            AI agent
          </AudienceButton>
          <AudienceButton active={audience === "human"} onClick={() => setAudience("human")} icon={UserRound}>
            Human
          </AudienceButton>
        </div>
      </div>

      {audience === "agent" ? (
        <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="min-w-0 space-y-9">
            <section>
              <StepHeader number="1" title="Give your agent one instruction" />
              <p className="mt-3 text-sm leading-6 text-white/52">
                This entry file routes the agent to the correct local registry overlay and the complete upstream Kleros operating instructions.
              </p>
              <div className="mt-4 rounded-xl border border-white/10 bg-[#090f17] p-3 sm:flex sm:items-center sm:gap-3 sm:p-4">
                <code className="block min-w-0 flex-1 [overflow-wrap:anywhere] font-mono text-[13px] leading-6 text-white/78">
                  <span className="mr-2 text-cyan-300">$</span>
                  {prompt}
                </code>
                <button
                  type="button"
                  onClick={copyPrompt}
                  className="mt-3 inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-white/12 bg-white/[0.035] px-3 text-xs font-semibold text-white/70 transition hover:border-cyan-300/30 hover:text-cyan-100 sm:mt-0"
                >
                  {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" /> : <Clipboard className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy prompt"}
                </button>
              </div>
            </section>

            <section className="border-t border-white/[0.08] pt-8">
              <StepHeader number="2" title="Let the router load the full context" />
              <div className="mt-4 space-y-3 text-sm leading-6 text-white/55">
                <Instruction>
                  Load the complete current Kleros Skills package and its <code className="text-cyan-100">kleros-curate</code> instructions.
                </Instruction>
                <Instruction>
                  Treat DEX8004 as a Stake Curate / PermanentGTCR (pGTCR) registry—not Scout or Light Curate.
                </Instruction>
                <Instruction>
                  Read policy, costs, periods, deposits, and item state live before preparing any transaction.
                </Instruction>
              </div>
              <a
                href="https://skills.kleros.io/"
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-cyan-200 transition hover:text-cyan-100 hover:underline hover:underline-offset-4"
              >
                Full Kleros Skills package
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </section>

            <section className="border-t border-white/[0.08] pt-8">
              <StepHeader number="3" title="Choose the verification registry" />
              <p className="mt-3 text-sm leading-6 text-white/52">
                The verification registry is independent from the chain where the ERC-8004 identity was created.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {REGISTRIES.map((registry) => (
                  <div key={registry.name} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                    <div className="font-semibold text-white">{registry.name}</div>
                    <div className="mt-1 text-xs text-white/40">{registry.detail}</div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        href={registry.skill}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 px-2.5 font-mono text-[11px] text-white/60 transition hover:border-cyan-300/25 hover:text-cyan-100"
                      >
                        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                        SKILL.md
                      </Link>
                      <Link
                        href={registry.archive}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 px-2.5 text-[11px] font-medium text-white/60 transition hover:border-cyan-300/25 hover:text-cyan-100"
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        Bundle
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="h-fit rounded-xl border border-white/10 bg-white/[0.022] p-4 lg:sticky lg:top-20">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Machine-readable files</div>
            <div className="mt-3 space-y-1">
              <FileLink href="/llms.txt" title="llms.txt" detail="Short routing index" />
              <FileLink href="/llms-full.txt" title="llms-full.txt" detail="Complete operating context" />
              <FileLink href="/SKILL.md" title="SKILL.md" detail="Local skill router" />
              <FileLink href="/.well-known/agent-skills/index.json" title="Discovery index" detail="Installable bundles" />
            </div>
            <p className="mt-4 border-t border-white/[0.08] pt-4 text-xs leading-5 text-white/38">
              These local files add DEX8004 addresses and safeguards. They do not replace the complete Kleros Skills package.
            </p>
          </aside>
        </div>
      ) : (
        <div className="mt-7 max-w-3xl space-y-9">
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-white">What is a skill?</h2>
            <p className="mt-3 text-sm leading-7 text-white/55">
              A skill is an instruction file an AI agent can read before it acts. It explains which registry to use, how to interpret statuses and collateral, and which safety checks must happen before a wallet transaction.
            </p>
          </section>
          <section className="border-t border-white/[0.08] pt-8">
            <h2 className="text-xl font-semibold tracking-tight text-white">What DEX8004 publishes</h2>
            <div className="mt-4 space-y-3">
              <Instruction>A short discovery index for agents that scan the website.</Instruction>
              <Instruction>A complete local guide covering both Verified Agents registries.</Instruction>
              <Instruction>Installable Sepolia and Ethereum overlays with addresses, status semantics, and pGTCR precautions.</Instruction>
            </div>
          </section>
          <section className="rounded-xl border border-amber-300/15 bg-amber-300/[0.045] p-5">
            <div className="text-sm font-semibold text-amber-100">Skills guide actions; it does not authorize them.</div>
            <p className="mt-2 text-sm leading-6 text-white/52">
              Agents must still show live amounts, simulate transactions, and ask for explicit approval before any signature or irreversible action.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}

function AudienceButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Bot;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition ${
        active ? "bg-white/10 text-white" : "text-white/45 hover:text-white/75"
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {children}
    </button>
  );
}

function StepHeader({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-6 w-6 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-300/[0.07] font-mono text-xs font-semibold text-cyan-200">
        {number}
      </span>
      <h2 className="text-lg font-semibold tracking-tight text-white">{title}</h2>
    </div>
  );
}

function Instruction({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <Check className="mt-1 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

function FileLink({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <Link href={href} className="block rounded-lg px-2.5 py-2 transition hover:bg-white/[0.05]">
      <div className="font-mono text-xs text-cyan-100/85">{title}</div>
      <div className="mt-0.5 text-[11px] text-white/35">{detail}</div>
    </Link>
  );
}
