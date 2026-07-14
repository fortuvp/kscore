import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refetch: vi.fn(async () => undefined),
  fetchIpfsJson: vi.fn(),
  uploadJsonToIpfs: vi.fn(),
  account: {
    address: undefined as `0x${string}` | undefined,
    isConnected: false,
  },
  chainId: 1,
  allowance: undefined as bigint | undefined,
  tokenBalance: undefined as bigint | undefined,
  nativeBalance: undefined as bigint | undefined,
  arbitrationCost: 25_000_000_000_000_000n as bigint | undefined,
  simulateContract: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
  readContract: vi.fn(),
  writeContractAsync: vi.fn(),
}));

vi.mock("wagmi", () => ({
  useAccount: () => mocks.account,
  useChainId: () => mocks.chainId,
  usePublicClient: () => ({
    simulateContract: mocks.simulateContract,
    waitForTransactionReceipt: mocks.waitForTransactionReceipt,
    readContract: mocks.readContract,
  }),
  useWriteContract: () => ({ writeContractAsync: mocks.writeContractAsync }),
  useBalance: () => ({ data: mocks.nativeBalance === undefined ? undefined : { value: mocks.nativeBalance } }),
  useReadContract: ({ functionName }: { functionName: string }) => ({
    data:
      functionName === "decimals"
        ? 18
        : functionName === "symbol"
          ? "stETH"
          : functionName === "arbitrationCost"
            ? mocks.arbitrationCost
            : functionName === "allowance"
              ? mocks.allowance
              : functionName === "balanceOf"
                ? mocks.tokenBalance
                : undefined,
    refetch: mocks.refetch,
  }),
}));
vi.mock("@/components/verification-environment-provider", () => ({
  useVerificationEnvironment: () => ({
    environment: "mainnet",
    deployment: {
      environment: "mainnet",
      label: "Mainnet",
      chainId: 1,
      chainName: "Ethereum",
      registryAddress: "0x118155741eea23f56b3bd59b0c1342d5daaa6d07",
      explorerBaseUrl: "https://etherscan.io",
      curateRegistryUrl: "https://curate.kleros.io/tcr/1/0x118155741eea23f56b3bd59b0c1342d5daaa6d07",
      subgraphUrl: "https://example.test/graphql",
      rpcUrls: [],
      flavor: "pgtcr",
    },
  }),
}));
vi.mock("@/lib/ipfs", () => ({
  fetchIpfsJson: mocks.fetchIpfsJson,
  ipfsToGatewayUrl: (value: string) => `https://cdn.kleros.link${value}`,
  uploadJsonToIpfs: mocks.uploadJsonToIpfs,
}));

import { CollateralizeAgentForm } from "@/components/pgtcr/collateralize-agent-form";
import { TooltipProvider } from "@/components/ui/tooltip";

describe("CollateralizeAgentForm", () => {
  afterEach(() => vi.unstubAllGlobals());

  beforeEach(() => {
    mocks.account.address = undefined;
    mocks.account.isConnected = false;
    mocks.chainId = 1;
    mocks.allowance = undefined;
    mocks.tokenBalance = undefined;
    mocks.nativeBalance = undefined;
    mocks.arbitrationCost = 25_000_000_000_000_000n;
    mocks.refetch.mockReset().mockResolvedValue(undefined);
    mocks.uploadJsonToIpfs.mockReset().mockResolvedValue("ipfs://item");
    mocks.simulateContract.mockReset().mockImplementation(async (request) => ({ request }));
    mocks.waitForTransactionReceipt.mockReset().mockResolvedValue({ status: "success", logs: [] });
    mocks.readContract.mockReset().mockResolvedValue(undefined);
    mocks.writeContractAsync
      .mockReset()
      .mockImplementation(async () => `0x${String(mocks.writeContractAsync.mock.calls.length).padStart(64, "0")}`);
    mocks.fetchIpfsJson.mockReset();
    mocks.fetchIpfsJson.mockResolvedValue({
      fileURI: "/ipfs/policy",
      metadata: {
        columns: [
          { label: "Agent Number", description: "Numeric ERC-8004 ID" },
          { label: "Agent URI", type: "uri", description: "Canonical registration URI" },
          { label: "Owner", type: "rich address", description: "Current owner" },
          { label: "Additional Info", description: "Factual policy evidence" },
        ],
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).startsWith("/api/kleros/verification?")) {
          return new Response(JSON.stringify({ success: true, found: false }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            success: true,
            verificationEnvironment: "mainnet",
            chainId: 1,
            registry: {
              id: "0x118155741eea23f56b3bd59b0c1342d5daaa6d07",
              token: "0xae7ab96520de3a18e5e1115eaab095312d7fe84",
              tokenSymbol: "stETH",
              tokenDecimals: 18,
              arbitrationCost: "25000000000000000",
              submissionMinDeposit: "20000000000000000",
              withdrawingPeriod: "43200",
              arbitrator: { id: "0x0000000000000000000000000000000000000001" },
              arbitrationSettings: [{ metaEvidenceURI: "/ipfs/meta", arbitratorExtraData: "0x", metadata: { policyURI: "/ipfs/policy" } }],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      })
    );
  });

  it("uses tooltips, contrasted fields, and a live bottom summary without duplicated tips", async () => {
    const user = userEvent.setup();
    mocks.arbitrationCost = undefined;
    render(
      <TooltipProvider>
        <CollateralizeAgentForm
          agentId="1"
          sourceNetwork="ethereum"
          sourceChainId={1}
          autoFilledAgentId="1"
          onAutoFill={vi.fn()}
          prefill={{
            agentURI: "ipfs://agent",
            owner: "0x0000000000000000000000000000000000000001",
            chainId: 1,
            additionalInfo: "Editable draft",
          }}
        />
      </TooltipProvider>
    );

    const summaryHeading = await screen.findByRole("heading", { name: "Summary" });
    expect(summaryHeading.closest("section")).not.toHaveClass("bg-gradient-to-b");
    expect(screen.getByLabelText("About the agent number")).toBeInTheDocument();
    expect(screen.getByLabelText("About policy review")).toBeInTheDocument();
    expect(screen.getByLabelText("About Agent URI")).toBeInTheDocument();
    expect(screen.queryByText("Verification network")).not.toBeInTheDocument();
    expect(screen.queryByText("Verification registry")).not.toBeInTheDocument();
    expect(screen.getByText("Collateralized stake")).toBeInTheDocument();
    expect(screen.getByText("Arbitration fee deposit")).toBeInTheDocument();
    expect(screen.getAllByText("0.025 ETH").length).toBeGreaterThan(0);
    expect(screen.getByText("Due at submission")).toBeInTheDocument();
    expect(screen.getByText("100% refundable on voluntary withdrawal")).toBeInTheDocument();
    expect(screen.getByText(/Network gas is not refunded/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /I have read the registry policy/i })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Auto-fill" }).compareDocumentPosition(screen.getByLabelText("Agent number")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "How to boost" }));
    expect(screen.getByText("Stake more. Rank higher.")).toBeInTheDocument();
    expect(screen.getByText(/gain leaderboard visibility and attract more clients/)).toBeInTheDocument();
    expect(screen.getByText(/Mainnet uses real funds/)).toBeInTheDocument();
    expect(screen.queryByText("tip")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Agent URI")).toHaveClass("bg-[#0b1220]");
  });

  it("opens a mobile-safe review and signs approval before the funded submission", async () => {
    const user = userEvent.setup();
    mocks.account.address = "0x00000000000000000000000000000000000000aa";
    mocks.account.isConnected = true;
    mocks.allowance = 0n;
    mocks.tokenBalance = 1_000_000_000_000_000_000n;
    mocks.nativeBalance = 1_000_000_000_000_000_000n;

    render(
      <TooltipProvider>
        <CollateralizeAgentForm
          agentId="1"
          sourceNetwork="ethereum"
          sourceChainId={1}
          autoFilledAgentId="1"
          onAutoFill={vi.fn()}
          prefill={{
            agentURI: "ipfs://agent",
            owner: "0x0000000000000000000000000000000000000001",
            chainId: 1,
            additionalInfo: "Editable draft",
          }}
        />
      </TooltipProvider>
    );

    const submitButton = await screen.findByRole("button", { name: "Submit on Ethereum" });
    await user.click(screen.getByRole("checkbox", { name: /I have read the registry policy/i }));
    await waitFor(() => expect(submitButton).toBeEnabled());
    await user.click(submitButton);

    expect(screen.getByRole("dialog")).toHaveClass("max-h-[92dvh]");
    expect(screen.getByRole("heading", { name: "Review your submission" })).toBeInTheDocument();
    expect(screen.getByText("Agent #1")).toBeInTheDocument();
    expect(screen.getAllByText("2 transactions")).toHaveLength(2);
    expect(screen.getByText(/pulls 0.02 stETH and posts 0.025 ETH/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start signing" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument());
    expect(mocks.simulateContract.mock.calls.map(([request]) => request.functionName)).toEqual([
      "approve",
      "addItem",
    ]);
    expect(mocks.simulateContract.mock.calls[1][0]).toMatchObject({
      functionName: "addItem",
      args: ["ipfs://item", 20_000_000_000_000_000n],
      value: 25_000_000_000_000_000n,
    });
    expect(mocks.writeContractAsync).toHaveBeenCalledTimes(2);
  });

  it("keeps a confirmed approval when the submission signature is retried", async () => {
    const user = userEvent.setup();
    mocks.account.address = "0x00000000000000000000000000000000000000aa";
    mocks.account.isConnected = true;
    mocks.allowance = 0n;
    mocks.tokenBalance = 1_000_000_000_000_000_000n;
    mocks.nativeBalance = 1_000_000_000_000_000_000n;
    mocks.writeContractAsync.mockImplementation(async () => {
      if (mocks.writeContractAsync.mock.calls.length === 2) {
        throw new Error("Submission signature rejected.");
      }
      return `0x${String(mocks.writeContractAsync.mock.calls.length).padStart(64, "0")}`;
    });

    render(
      <TooltipProvider>
        <CollateralizeAgentForm
          agentId="1"
          sourceNetwork="ethereum"
          sourceChainId={1}
          autoFilledAgentId="1"
          onAutoFill={vi.fn()}
          prefill={{
            agentURI: "ipfs://agent",
            owner: "0x0000000000000000000000000000000000000001",
            chainId: 1,
            additionalInfo: "Editable draft",
          }}
        />
      </TooltipProvider>
    );

    const submitButton = await screen.findByRole("button", { name: "Submit on Ethereum" });
    await user.click(screen.getByRole("checkbox", { name: /I have read the registry policy/i }));
    await waitFor(() => expect(submitButton).toBeEnabled());
    await user.click(submitButton);
    await user.click(screen.getByRole("button", { name: "Start signing" }));

    expect(await screen.findByText(/Submission signature rejected/)).toBeInTheDocument();
    expect(screen.getByText("Collateral approval is confirmed. No additional approval is needed.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry signing" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument());
    expect(mocks.simulateContract.mock.calls.map(([request]) => request.functionName)).toEqual([
      "approve",
      "addItem",
      "addItem",
    ]);
  });
});
