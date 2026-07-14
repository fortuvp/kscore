import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { AgentSkillsGuide } from "@/components/agent-skills-guide";

describe("AgentSkillsGuide", () => {
  it("starts with the agent entry prompt and local machine-readable files", () => {
    render(<AgentSkillsGuide />);

    expect(screen.getByRole("button", { name: "AI agent" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Read .*llms-full\.txt and follow it before interacting with DEX8004\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /llms-full\.txt/i })).toHaveAttribute("href", "/llms-full.txt");
    expect(screen.getAllByRole("link", { name: /SKILL\.md/i })).toHaveLength(3);
    expect(screen.getAllByRole("link", { name: /SKILL\.md/i }).map((link) => link.getAttribute("href"))).toEqual(
      expect.arrayContaining([
        "/skills/verified-agents-sepolia/SKILL.md",
        "/skills/verified-agents-mainnet/SKILL.md",
        "/SKILL.md",
      ])
    );
  });

  it("explains skills in plain language for humans", async () => {
    const user = userEvent.setup();
    render(<AgentSkillsGuide />);

    await user.click(screen.getByRole("button", { name: "Human" }));

    expect(screen.getByRole("heading", { name: "What is a skill?" })).toBeInTheDocument();
    expect(screen.getByText(/an instruction file an AI agent can read before it acts/i)).toBeInTheDocument();
  });
});
