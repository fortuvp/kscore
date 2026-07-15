import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AgentSkillsGuide } from "@/components/agent-skills-guide";

describe("AgentSkillsGuide", () => {
  it("shows one deployment-aware agent prompt and the local machine-readable files", () => {
    render(<AgentSkillsGuide />);

    expect(screen.getByText(/Read .*llms-full\.txt and follow it before interacting with KSCORE\./)).toBeInTheDocument();
    expect(screen.getByText(/production automatically points to the hosted file/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /llms-full\.txt/i })).toHaveAttribute("href", "/llms-full.txt");
    expect(screen.getByRole("link", { name: /SKILL\.md/i })).toHaveAttribute("href", "/SKILL.md");
    expect(screen.queryByRole("button", { name: "Human" })).not.toBeInTheDocument();
    expect(screen.queryByText("Let the router load the full context")).not.toBeInTheDocument();
    expect(screen.queryByText("Choose the verification registry")).not.toBeInTheDocument();
  });
});
