import Link from "next/link";
import { HelpCircle } from "lucide-react";

const FAQS = [
  {
    q: "What does collateralized mean?",
    a: "Collateralized means the agent owner locked a deposit in Curate. If misconduct is proven, the deposit can be challenged and potentially forfeited.",
  },
  {
    q: "Why can the same agent ID appear on multiple chains?",
    a: "Agent IDs can exist across networks. Trust checks in this explorer match both agent number (key0) and chain context (key2/CAIP) to avoid cross-chain confusion.",
  },
  {
    q: "Is community moderation available?",
    a: "Not yet. Moderation is visible as coming soon while reporting, answer, and arbitration policies are prepared.",
  },
  {
    q: "What is the difference between Trust and Moderation?",
    a: "Trust currently shows Curate verification status. Moderation will add the community reporting workflow in a later release.",
  },
  {
    q: "Why do rankings change after refresh?",
    a: "Rankings are computed from fresh subgraph data and activity snapshots. As new interactions happen, scores and order can shift.",
  },
];

export default function FaqPage() {
  return (
    <div className="container mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-3">
          <HelpCircle className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">FAQ</h1>
        </div>
        <p className="text-muted-foreground">Core questions about verification and multi-chain agent discovery.</p>
      </div>

      <div className="space-y-3">
        {FAQS.map((item) => (
          <section key={item.q} className="rounded-xl border border-border/50 bg-card/40 p-4">
            <h2 className="text-lg font-semibold">{item.q}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
          </section>
        ))}
      </div>

      <div className="mt-8 text-sm text-muted-foreground">
        Need more detail? Visit{" "}
        <Link href="/docs" className="text-primary hover:underline">
          Docs
        </Link>
        .
      </div>
    </div>
  );
}
