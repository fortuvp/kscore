import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentSubgraphNetwork } from "@/lib/agent-networks";

vi.mock("next/navigation", () => ({
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/verification-environment-provider", () => ({
  useVerificationEnvironment: () => ({
    environment: "mainnet",
    withEnvironment: (href: string) => href,
  }),
}));

type MockFormProps = {
  sourceNetwork: AgentSubgraphNetwork | null;
  autoFillLoading?: boolean;
  autoFilledAgentId?: string | null;
  onAutoFill?: (agentId: string) => void | Promise<void>;
  onSourceNetworkChange?: (network: AgentSubgraphNetwork) => void;
  prefill?: { owner?: string | null; agentURI?: string | null };
};

vi.mock("@/components/pgtcr/collateralize-agent-form", () => ({
  CollateralizeAgentForm: (props: MockFormProps) => (
    <div>
      <button type="button" onClick={() => props.onSourceNetworkChange?.("sepolia")}>Choose Sepolia</button>
      <button type="button" onClick={() => props.onSourceNetworkChange?.("ethereum")}>Choose Ethereum</button>
      <button type="button" onClick={() => void props.onAutoFill?.("1")}>Run Auto-fill</button>
      <span data-testid="selected-network">{props.sourceNetwork || "none"}</span>
      <span data-testid="loaded-owner">{props.prefill?.owner || "none"}</span>
      <span data-testid="loaded-agent-id">{props.autoFilledAgentId || "none"}</span>
      {props.autoFillLoading ? <span>Looking up agent</span> : null}
    </div>
  ),
}));

import { SubmitAgentFlow } from "@/components/pgtcr/submit-agent-flow";

function lookupResponse(network: AgentSubgraphNetwork, owner?: string) {
  return new Response(
    JSON.stringify({
      success: true,
      found: Boolean(owner),
      network,
      item: owner
        ? { agentId: "1", chainId: String(network === "ethereum" ? 1 : 11155111), owner, agentURI: "ipfs://agent" }
        : null,
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

describe("SubmitAgentFlow Auto-fill", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("checks live data first and falls back once when needed", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(lookupResponse("sepolia"))
      .mockResolvedValueOnce(lookupResponse("sepolia", "0x0000000000000000000000000000000000000001"));
    vi.stubGlobal("fetch", fetchMock);

    render(<SubmitAgentFlow />);
    await user.click(screen.getByRole("button", { name: "Choose Sepolia" }));
    await waitFor(() => expect(screen.getByTestId("selected-network")).toHaveTextContent("sepolia"));
    await user.click(screen.getByRole("button", { name: "Run Auto-fill" }));

    await waitFor(() => expect(screen.getByTestId("loaded-owner")).toHaveTextContent("0x0000000000000000000000000000000000000001"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("fresh=1");
    expect(String(fetchMock.mock.calls[1][0])).not.toContain("fresh=1");
  });

  it("does not let an older network lookup overwrite the latest selection", async () => {
    const user = userEvent.setup();
    let resolveSepolia: ((response: Response) => void) | undefined;
    const sepoliaResponse = new Promise<Response>((resolve) => {
      resolveSepolia = resolve;
    });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("network=sepolia")) return sepoliaResponse;
      return Promise.resolve(lookupResponse("ethereum", "0x00000000000000000000000000000000000000ee"));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SubmitAgentFlow />);
    await user.click(screen.getByRole("button", { name: "Choose Sepolia" }));
    await waitFor(() => expect(screen.getByTestId("selected-network")).toHaveTextContent("sepolia"));
    await user.click(screen.getByRole("button", { name: "Run Auto-fill" }));
    await user.click(screen.getByRole("button", { name: "Choose Ethereum" }));
    await waitFor(() => expect(screen.getByTestId("selected-network")).toHaveTextContent("ethereum"));
    await user.click(screen.getByRole("button", { name: "Run Auto-fill" }));

    await waitFor(() => expect(screen.getByTestId("loaded-owner")).toHaveTextContent("0x00000000000000000000000000000000000000ee"));
    await act(async () => {
      resolveSepolia?.(lookupResponse("sepolia", "0x00000000000000000000000000000000000000aa"));
      await Promise.resolve();
    });
    expect(screen.getByTestId("loaded-owner")).toHaveTextContent("0x00000000000000000000000000000000000000ee");
    expect(screen.getByTestId("loaded-agent-id")).toHaveTextContent("1");
  });
});
