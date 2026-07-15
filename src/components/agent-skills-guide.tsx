"use client";

import * as React from "react";
import { CheckCircle2, Clipboard } from "lucide-react";
import Link from "next/link";

export function AgentSkillsGuide() {
  const [entryUrl, setEntryUrl] = React.useState("/llms-full.txt");
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    setEntryUrl(`${window.location.origin}/llms-full.txt`);
  }, []);

  const prompt = `Read ${entryUrl} and follow it before interacting with KSCORE.`;

  async function copyPrompt() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <section className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight text-white">Give your agent one instruction</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/52">
          This prompt loads the complete operating context published by the current KSCORE deployment.
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
        <p className="mt-3 text-xs leading-5 text-white/38">
          The address uses this website&apos;s current origin, so production automatically points to the hosted file.
        </p>
      </section>

      <aside className="h-fit rounded-xl border border-white/10 bg-white/[0.022] p-4 lg:sticky lg:top-20">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Machine-readable files</div>
        <div className="mt-3 space-y-1">
          <FileLink href="/llms.txt" title="llms.txt" detail="Short routing index" />
          <FileLink href="/llms-full.txt" title="llms-full.txt" detail="Complete operating context" />
          <FileLink href="/SKILL.md" title="SKILL.md" detail="Local skill router" />
          <FileLink href="/.well-known/agent-skills/index.json" title="Discovery index" detail="Installable bundles" />
        </div>
        <p className="mt-4 border-t border-white/[0.08] pt-4 text-xs leading-5 text-white/38">
          These local files add KSCORE addresses and safeguards. They also route agents to the complete Kleros Skills package.
        </p>
      </aside>
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
