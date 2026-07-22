import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("requested UI copy and navigation", () => {
  it("removes Explore and uses certificate language on the launch page", () => {
    const launch = source("src/app/launch/page.tsx");
    const navbar = source("src/components/navbar.tsx");
    const footer = source("src/components/app-footer.tsx");

    expect(existsSync(resolve(process.cwd(), "src/app/explore/page.tsx"))).toBe(false);
    expect(navbar).not.toContain('href: "/explore"');
    expect(footer).not.toContain('href: "/explore"');
    expect(launch).toContain("Build a certificate the market can trust");
    expect(launch).toContain("Fully ERC-8004 compatible");
    expect(launch).toContain("discoverable on any block explorer, app, or agent");
    expect(launch).not.toContain("Anything can be verified");
    expect(launch).not.toContain("Compounding value");
    expect(launch).not.toContain("Built for a specific market");
    expect(launch).not.toContain("Certificate membership becomes a portable policy signal");
    expect(launch).not.toContain("Certificate network example");
    expect(launch).not.toContain("Turn your policy into a certificate products can trust");
    expect(launch).toContain("More agents, more promotion for your brand");
    expect(launch).toContain("Agents pursue your certificate because it is fair, fast, and boosts their discoverability.");
  });

  it("routes homepage analysis to verified agents and promotes customer-defined certificates", () => {
    const home = source("src/app/page.tsx");

    expect(home).toContain('<Link href={withEnvironment("/verified")}>');
    expect(home).not.toContain('<Link href={withEnvironment("/trust")}>');
    expect(home).toContain("Want to create a certificate on your own terms?");
    expect(home).toContain("Define what verified means for your customers");
    expect(home).toContain("create a certificate to grant access, privileges or just promote your brand");
  });

  it("uses direct report language for collateralized agents", () => {
    const reportDialog = source("src/components/pgtcr/challenge-agent-dialog.tsx");

    expect(reportDialog).toContain(">Report abuse</Button>");
    expect(reportDialog).toContain('DialogTitle>Report abuse</DialogTitle>');
    expect(reportDialog).toContain('Successful report reward');
    expect(reportDialog).toContain('report deposit is refunded if the report succeeds and lost if it fails');
    expect(reportDialog).toContain(': "Report"');
  });

  it("keeps em dashes out of displayed and generated copy", () => {
    const emDash = String.fromCodePoint(0x2014);
    const checkedFiles = [
      "src/app/layout.tsx",
      "src/app/docs/page.tsx",
      "src/app/faq/page.tsx",
      "src/app/launch/page.tsx",
      "src/components/pgtcr/submission-review-dialog.tsx",
      "public/SKILL.md",
      "public/llms.txt",
      "public/llms-full.txt",
    ];

    for (const file of checkedFiles) expect(source(file)).not.toContain(emDash);
  });

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

    expect(docs).toContain("KSCORE step-by-step guide");
    expect(docs).toContain("Press <strong>Submit your agent</strong>");
    expect(docs).toContain("<strong>Report abuse</strong>");
    expect(docs).toContain("Press <strong>Start withdraw</strong>");
    expect(docs).toContain('href="/skills"');
    expect(skills).toContain("Guide &amp; Skills");
    expect(skillsGuide).toContain("Read ${entryUrl} and follow it before interacting with KSCORE.");
    expect(skillsGuide).toContain("/llms-full.txt");
    expect(faq).toContain("Removed means a successful challenge and dispute");
    expect(faq).toContain("unchallenged voluntary withdrawal returns the locked stake");
    expect(faq).toContain("Challenging is not guaranteed profit");
  });

  it("shows the KSCORE brand only in the homepage header", () => {
    const home = source("src/app/page.tsx");

    expect(home).not.toContain('import { KScoreLogo }');
    expect(home).not.toContain("<KScoreLogo");
    expect(home).toContain("The trust layer for AI agents.");
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
