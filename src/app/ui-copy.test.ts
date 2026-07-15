import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("requested UI copy and navigation", () => {
  it("removes Compare from the footer without deleting the route", () => {
    const layout = source("src/app/layout.tsx");
    const footer = source("src/components/app-footer.tsx");
    expect(layout).toContain("<AppFooter />");
    expect(footer).not.toContain('{ href: "/compare", label: "Compare" }');
    expect(source("src/app/compare/page.tsx")).toContain("Agent Compare");
  });

  it("removes only the item History subtitle", () => {
    expect(source("src/app/agents/[id]/page.tsx")).not.toContain("Registry + Curate timeline");
    expect(source("src/app/agents/[id]/page.tsx")).not.toContain("Last observed activity");
    expect(source("src/app/page.tsx")).toContain("Registry + Curate timeline");
  });

  it("publishes a documentation-style guide and local agent skills page", () => {
    const docs = source("src/app/docs/page.tsx");
    const faq = source("src/app/faq/page.tsx");
    const skills = source("src/app/skills/page.tsx");
    const skillsGuide = source("src/components/agent-skills-guide.tsx");

    expect(docs).toContain("Signing sequence");
    expect(docs).toContain("A scoped signal—not a universal endorsement");
    expect(docs).toContain('href="/skills"');
    expect(skills).toContain("Guide &amp; Skills");
    expect(skillsGuide).toContain("Read ${entryUrl} and follow it before interacting with KSCORE.");
    expect(skillsGuide).toContain("/llms-full.txt");
    expect(faq).toContain("Removed means a successful challenge and dispute");
    expect(faq).toContain("unchallenged voluntary withdrawal returns the locked stake");
    expect(faq).toContain("challenging is not guaranteed profit");
  });

  it("provides a keyboard skip link across the app", () => {
    const layout = source("src/app/layout.tsx");
    expect(layout).toContain('href="#main-content"');
    expect(layout).toContain('id="main-content"');
    expect(layout).toContain('href="/llms.txt"');
    expect(layout).toContain('href="/llms-full.txt"');
    expect(layout).toContain('rel="agent-skill"');
  });

  it("publishes portable agent files and keeps one ERC-8004 source-chain selector", () => {
    const llms = source("public/llms-full.txt");
    const submitFlow = source("src/components/pgtcr/submit-agent-flow.tsx");
    const submitForm = source("src/components/pgtcr/collateralize-agent-form.tsx");
    const submissionBuilder = source("src/lib/pgtcr-submission.ts");

    expect(llms).not.toContain("localhost");
    expect(llms).toContain("/skills/verified-agents-mainnet/SKILL.md");
    expect(submitFlow).not.toContain("Agent&apos;s ERC-8004 network");
    expect(submissionBuilder).toContain('itemValues[key] = `eip155:${chain}:${address}`');
    expect(submitForm).toContain('id="summary-title"');
  });
});
