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
});
