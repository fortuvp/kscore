import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("wagmi", () => ({
  useReadContract: () => ({ data: "stETH" }),
}));

vi.mock("@/components/verification-environment-provider", () => ({
  useVerificationEnvironment: () => ({
    environment: "mainnet",
    deployment: {
      chainId: 1,
      chainName: "Ethereum",
      label: "Mainnet",
    },
    withEnvironment: (href: string) => {
      const url = new URL(href, "http://localhost");
      url.searchParams.set("verificationEnvironment", "mainnet");
      return `${url.pathname}${url.search}`;
    },
  }),
}));

import VerifiedAgentsPage from "@/app/verified/page";

describe("Verified Agents mainnet empty state", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/pgtcr/items")) {
          return { json: async () => ({ success: true, items: [], verificationEnvironment: "mainnet", chainId: 1 }) };
        }
        return {
          json: async () => ({
            success: true,
            verificationEnvironment: "mainnet",
            chainId: 1,
            registry: { token: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84" },
          }),
        };
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a real-funds-aware submission CTA when mainnet has no items", async () => {
    render(<VerifiedAgentsPage />);
    expect(await screen.findByText("No verified agents on Ethereum mainnet yet")).toBeInTheDocument();
    expect(screen.getByText(/Mainnet submissions use real funds/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Submit the first agent" })).toHaveAttribute(
      "href",
      "/submit?verificationEnvironment=mainnet"
    );
  });
});
