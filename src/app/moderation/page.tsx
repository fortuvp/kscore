import { Clock3, Gavel, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function ModerationPage() {
  return (
    <div className="container mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="flex items-center gap-3">
        <Gavel className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-bold tracking-tight">Moderation</h1>
        <Badge className="border-amber-400/30 bg-amber-400/10 text-amber-200">Coming soon</Badge>
      </div>

      <section className="mt-10 flex min-h-[32rem] flex-col items-center justify-center border-y border-border/60 px-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-amber-300/25 bg-amber-300/10">
          <ShieldAlert className="h-7 w-7 text-amber-200" />
        </div>
        <h2 className="mt-6 text-2xl font-semibold">Flag harmful unverified agents</h2>
        <div className="mt-3 max-w-2xl space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            Did an unverified agent behave maliciously or cause harm? You will be able to flag it so other users can avoid interacting with it.
          </p>
          <p>
            Every report will go through an oracle review before a malicious label is approved and displayed. This protects users while giving the reported agent a transparent dispute process.
          </p>
        </div>
        <Button variant="outline" className="mt-7" disabled>
          <Clock3 className="mr-2 h-4 w-4" />
          Coming soon
        </Button>
      </section>
    </div>
  );
}
