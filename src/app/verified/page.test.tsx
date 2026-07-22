import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

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

function stubVerifiedItems(
  items: Array<Record<string, unknown>>,
  activities: Array<Record<string, unknown>> = []
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/pgtcr/items")) {
        return {
          json: async () => ({
            success: true,
            items,
            verificationEnvironment: "mainnet",
            chainId: 1,
          }),
        };
      }
      if (url.includes("/api/verified/activity")) {
        return {
          json: async () => ({ success: true, activities }),
        };
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
}

describe("Verified Agents mainnet empty state", () => {
  beforeEach(() => {
    window.localStorage.clear();
    pushMock.mockReset();
    stubVerifiedItems([]);
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

  it("keeps the primary submission action prominent and correctly routed", async () => {
    render(<VerifiedAgentsPage />);

    const submitLink = await screen.findByRole("link", { name: "Submit your agent" });
    const resultsCount = screen.getByText((_content, element) => element?.getAttribute("aria-live") === "polite");
    expect(submitLink).toHaveAttribute("href", "/submit?verificationEnvironment=mainnet");
    expect(submitLink.closest("a")).toHaveClass("bg-cyan-300");
    expect(submitLink.compareDocumentPosition(resultsCount) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText("List with refundable collateral")).not.toBeInTheDocument();
  });

  it("opens a non-collateralized agent directly by number and network", async () => {
    const user = userEvent.setup();
    render(<VerifiedAgentsPage />);

    await user.type(screen.getByRole("textbox", { name: "Agent number" }), "1436");
    await user.selectOptions(screen.getByRole("combobox", { name: "Agent network" }), "base");
    await user.click(screen.getByRole("button", { name: "View agent page" }));

    expect(pushMock).toHaveBeenCalledWith(
      "/agents/1436?network=base&lookup=agentId&verificationEnvironment=mainnet"
    );
  });

  it("places direct lookup after the registry results and presents the page benefits clearly", async () => {
    const user = userEvent.setup();
    render(<VerifiedAgentsPage />);

    const results = await screen.findByText("No verified agents on Ethereum mainnet yet");
    const directLookup = screen.getByRole("heading", { name: "Can't find the agent you're looking for?" });
    const reviewAction = screen.getByRole("button", { name: "review" });

    expect(results.compareDocumentPosition(directLookup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(reviewAction.closest("p")).toHaveTextContent(
      "Get a certified review 01 for your agent. Discover 02 trusted agents. Report 03 misbehavior and get rewarded."
    );

    await user.hover(reviewAction);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Boost discoverability");
    expect(screen.getByRole("tooltip")).toHaveTextContent(/ERC-8004-compatible apps/);
    expect(screen.getByRole("button", { name: "discover" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "report" })).toBeInTheDocument();
  });

  it("shows oracle review and revocation activity with agent references", async () => {
    stubVerifiedItems([], [
      {
        id: "positive",
        kind: "oracle_positive",
        agentId: "1436",
        network: "sepolia",
        timestamp: 1778717604,
        transactionHash: "0xpositive",
        externalUrl: "https://sepolia.etherscan.io/tx/0xpositive",
      },
      {
        id: "revoked",
        kind: "oracle_revoked",
        agentId: "1142",
        network: "sepolia",
        timestamp: 1778694648,
        transactionHash: "0xrevoked",
        externalUrl: "https://sepolia.etherscan.io/tx/0xrevoked",
      },
    ]);

    render(<VerifiedAgentsPage />);

    expect(await screen.findByText(/Kleros Oracle left a positive review for/)).toBeInTheDocument();
    expect(screen.getByText(/Kleros Oracle revoked a review for/)).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Recent activity" }).querySelector(".max-h-64")).toHaveClass(
      "overflow-y-auto"
    );
    expect(screen.getByRole("link", { name: "Agent #1436" })).toHaveAttribute(
      "href",
      "/agents/1436?network=sepolia&lookup=agentId&verificationEnvironment=mainnet"
    );
    expect(screen.getByRole("link", { name: "Agent #1142" })).toBeInTheDocument();
  });

  it("explains each registry outcome in plain language", async () => {
    const user = userEvent.setup();
    render(<VerifiedAgentsPage />);
    const guideButton = await screen.findByRole("button", { name: "Status guide" });

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await user.hover(guideButton);

    const guide = screen.getByRole("tooltip");
    expect(guide).toHaveTextContent("Status guide");
    expect(guide).toHaveTextContent("The agent has active collateral and currently complies with the policy.");
    expect(guide).toHaveTextContent("A challenge and dispute found the agent non-compliant.");
    expect(guide).toHaveTextContent("Voluntarily removed from the registry without a challenge.");
  });

  it("offers an accessible view switch and restores the saved layout", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<VerifiedAgentsPage />);
    const cardView = screen.getByRole("button", { name: "Card view" });
    const listView = screen.getByRole("button", { name: "List view" });

    expect(cardView).toHaveAttribute("aria-pressed", "true");
    await user.click(listView);
    expect(listView).toHaveAttribute("aria-pressed", "true");
    expect(window.localStorage.getItem("verified-agents-view")).toBe("list");

    unmount();
    render(<VerifiedAgentsPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute("aria-pressed", "true"));
  });

  it("keeps voluntary withdrawals separate from disputed removals", async () => {
    const now = Math.floor(Date.now() / 1000);
    stubVerifiedItems([
      {
        id: "active",
        itemID: "active",
        status: "Submitted",
        includedAt: String(now - 100),
        stake: "1000000000000000000",
        withdrawingTimestamp: "0",
        metadata: { key0: "", key1: null, key2: null },
        registry: { submissionPeriod: "0", reinclusionPeriod: "0" },
      },
      {
        id: "removed",
        itemID: "removed",
        status: "Absent",
        includedAt: String(now - 100),
        stake: "0",
        withdrawingTimestamp: "0",
        metadata: { key0: "", key1: null, key2: null },
        registry: { submissionPeriod: "0", reinclusionPeriod: "0" },
      },
      {
        id: "withdrawn",
        itemID: "withdrawn",
        status: "Absent",
        includedAt: String(now - 100),
        stake: "0",
        withdrawingTimestamp: String(now - 10),
        metadata: { key0: "", key1: null, key2: null },
        registry: { submissionPeriod: "0", reinclusionPeriod: "0" },
      },
      {
        id: "review",
        itemID: "review",
        status: "Disputed",
        includedAt: String(now - 100),
        stake: "1000000000000000000",
        withdrawingTimestamp: "0",
        metadata: { key0: "", key1: null, key2: null },
        registry: { submissionPeriod: "0", reinclusionPeriod: "0" },
      },
    ]);

    const user = userEvent.setup();
    render(<VerifiedAgentsPage />);
    const withdrawnFilter = await screen.findByRole("button", { name: /^Withdrawn/ });
    const removedFilter = screen.getByRole("button", { name: /^Removed/ });
    const activeFilter = screen.getByRole("button", { name: /^Active/ });
    const reviewFilter = screen.getByRole("button", { name: /^In review/ });
    expect(withdrawnFilter).toHaveTextContent("1");
    expect(removedFilter).toHaveTextContent("1");
    expect(activeFilter).toHaveTextContent("1");
    expect(reviewFilter).toHaveTextContent("1");

    await user.click(withdrawnFilter);
    const withdrawnAgent = screen.getByRole("link", { name: /Agent withdrawn/ });
    expect(within(withdrawnAgent).getByText("Withdrawn")).toBeInTheDocument();
    expect(screen.queryByText("Agent removed")).not.toBeInTheDocument();

    await user.click(removedFilter);
    const removedAgent = screen.getByRole("link", { name: /Agent removed/ });
    expect(within(removedAgent).getByText("Removed")).toBeInTheDocument();
    expect(screen.queryByText("Agent withdrawn")).not.toBeInTheDocument();
  });
});
