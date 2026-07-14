import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/verification-environment-provider", () => ({
  useVerificationEnvironment: () => ({
    environment: "testnet",
    withEnvironment: (href: string) => href,
  }),
}));

import ExplorePage from "@/app/explore/page";

describe("Explore verified-agent leaderboard", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/stats")) {
          return {
            json: async () => ({
              success: true,
              generatedAt: new Date().toISOString(),
              stats: { totalAgents: 2, active7d: 2, totalReviews: 0 },
              lists: { trending: [], topRated: [], mostReviewed: [] },
              activityPreview: [],
            }),
          };
        }

        return {
          json: async () => ({
            success: true,
            verifiedStakeSymbol: "PNK",
            verifiedStakeDecimals: 18,
            verifiedAgents: [
              {
                id: "alpha-id",
                agentId: "1",
                name: "Alpha Agent",
                network: "sepolia",
                stake: "5000000000000000000",
                verifiedAt: 100,
              },
              {
                id: "beta-id",
                agentId: "2",
                name: "Beta Agent",
                network: "sepolia",
                stake: "2000000000000000000",
                verifiedAt: 200,
              },
            ],
            moderation: [],
          }),
        };
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("foregrounds collateral and keeps the most-staked agent highlighted across sort modes", async () => {
    const user = userEvent.setup();
    render(<ExplorePage />);

    expect(await screen.findByRole("heading", { name: "Verified agents (Curate)" })).toBeInTheDocument();
    const alphaLink = screen.getByRole("link", { name: /Alpha Agent/ });
    expect(within(alphaLink).getByText("Most staked")).toBeInTheDocument();
    expect(within(alphaLink).getByText("Collateralized stake")).toBeInTheDocument();
    expect(alphaLink).toHaveTextContent("5");
    expect(alphaLink).toHaveTextContent("PNK");

    const latestButton = screen.getByRole("button", { name: "Latest" });
    await user.click(latestButton);
    expect(latestButton).toHaveAttribute("aria-pressed", "true");
    expect(within(screen.getByRole("link", { name: /Alpha Agent/ })).getByText("Most staked")).toBeInTheDocument();

    const rankedAgentLinks = screen
      .getAllByRole("link")
      .filter((link) => /Alpha Agent|Beta Agent/.test(link.textContent || ""));
    expect(rankedAgentLinks[0]).toHaveTextContent("Beta Agent");
  });
});
