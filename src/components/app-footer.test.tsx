import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/verification-environment-provider", () => ({
  useVerificationEnvironment: () => ({
    withEnvironment: (href: string) => `${href}?verificationEnvironment=mainnet`,
  }),
}));

import { AppFooter } from "@/components/app-footer";

describe("AppFooter", () => {
  it("preserves the verification environment and omits Compare", () => {
    render(<AppFooter />);

    expect(screen.getByRole("link", { name: "Verified Agents" })).toHaveAttribute(
      "href",
      "/verified?verificationEnvironment=mainnet"
    );
    expect(screen.getByRole("link", { name: "My Agents" })).toHaveAttribute(
      "href",
      "/my-agents?verificationEnvironment=mainnet"
    );
    expect(screen.queryByText("Compare")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Skills" })).toHaveAttribute("href", "/skills");
    expect(screen.queryByRole("link", { name: /Source code/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "llms.txt" })).toHaveAttribute("href", "/llms.txt");
    expect(screen.getByRole("link", { name: "llms-full.txt" })).toHaveAttribute("href", "/llms-full.txt");
    expect(screen.getByRole("link", { name: "SKILL.md" })).toHaveAttribute("href", "/SKILL.md");
  });
});
