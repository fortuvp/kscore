import Link from "next/link";
import { BookOpen } from "lucide-react";

const SECTIONS = [
  {
    id: "getting-started",
    title: "Getting Started",
    points: [
      "Use Explore to search by agent number.",
      "Use Compare to evaluate trust, identity, and integration features side by side.",
      "Use Trust to monitor collateralized and challenged agents.",
    ],
  },
  {
    id: "trust-model",
    title: "Trust Model",
    points: [
      "Collateral status is sourced from Kleros Curate.",
      "Verification is chain-aware: key0 (agent number) + key2 (CAIP-10 owner/chain context).",
      "Moderation is displayed as coming soon while its public workflow is prepared.",
    ],
  },
  {
    id: "moderation-flow",
    title: "Moderation (Coming Soon)",
    points: [
      "Community abuse reports are not available yet.",
      "Reality.eth answers and arbitration actions will be enabled in a later release.",
      "Existing verification and Curate challenge flows remain available.",
    ],
  },
  {
    id: "best-practices",
    title: "Agent Listing Best Practices",
    points: [
      "Publish stable metadata URIs and provide a high-quality image.",
      "Include MCP/A2A endpoints only when production-ready.",
      "Keep description, trust guarantees, and ownership data up to date.",
    ],
  },
];

export default function DocsPage() {
  return (
    <div className="container mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Docs</h1>
        </div>
        <p className="text-muted-foreground">Quick reference for agent discovery, verification, and trust features.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-xl border border-border/50 bg-card/40 p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">On this page</div>
          <nav className="mt-3 space-y-1.5 text-sm">
            {SECTIONS.map((section) => (
              <a key={section.id} href={`#${section.id}`} className="block text-muted-foreground hover:text-foreground">
                {section.title}
              </a>
            ))}
          </nav>
        </aside>

        <div className="space-y-4">
          {SECTIONS.map((section) => (
            <section key={section.id} id={section.id} className="rounded-xl border border-border/50 bg-card/40 p-5">
              <h2 className="text-xl font-semibold">{section.title}</h2>
              <ul className="mt-3 list-disc pl-5 text-sm text-muted-foreground">
                {section.points.map((point) => (
                  <li key={point} className="mb-1">
                    {point}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>

      <div className="mt-8 text-sm text-muted-foreground">
        Looking for short answers? Visit{" "}
        <Link href="/faq" className="text-primary hover:underline">
          FAQ
        </Link>
        .
      </div>
    </div>
  );
}
