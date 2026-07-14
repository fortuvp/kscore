import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refetch: vi.fn(async () => undefined),
  fetchIpfsJson: vi.fn(),
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: undefined, isConnected: false }),
  useChainId: () => 1,
  usePublicClient: () => undefined,
  useWriteContract: () => ({ writeContractAsync: vi.fn() }),
  useBalance: () => ({ data: undefined }),
  useReadContract: ({ functionName }: { functionName: string }) => ({
    data:
      functionName === "decimals"
        ? 18
        : functionName === "symbol"
          ? "stETH"
          : functionName === "arbitrationCost"
            ? 25_000_000_000_000_000n
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
  uploadJsonToIpfs: vi.fn(),
}));

import { CollateralizeAgentForm } from "@/components/pgtcr/collateralize-agent-form";
import { TooltipProvider } from "@/components/ui/tooltip";

describe("CollateralizeAgentForm", () => {
  afterEach(() => vi.unstubAllGlobals());

  beforeEach(() => {
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
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            success: true,
            verificationEnvironment: "mainnet",
            chainId: 1,
            registry: {
              id: "0x118155741eea23f56b3bd59b0c1342d5daaa6d07",
              token: "0xae7ab96520de3a18e5e1115eaab095312d7fe84",
              tokenSymbol: "stETH",
              tokenDecimals: 18,
              submissionMinDeposit: "20000000000000000",
              withdrawingPeriod: "43200",
              arbitrator: { id: "0x0000000000000000000000000000000000000001" },
              arbitrationSettings: [{ metaEvidenceURI: "/ipfs/meta", arbitratorExtraData: "0x", metadata: { policyURI: "/ipfs/policy" } }],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );
  });

  it("uses tooltips, contrasted fields, and a live bottom summary without duplicated tips", async () => {
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

    await waitFor(() => expect(screen.getByRole("heading", { name: "Before you submit" })).toBeInTheDocument());
    expect(screen.getByLabelText("About the agent number")).toBeInTheDocument();
    expect(screen.getByLabelText("How auto-fill works")).toBeInTheDocument();
    expect(screen.getByLabelText("About policy review")).toBeInTheDocument();
    expect(screen.getByLabelText("About Agent URI")).toBeInTheDocument();
    expect(screen.getByText("Verification network")).toBeInTheDocument();
    expect(screen.getByText(/You may start withdrawal whenever/)).toBeInTheDocument();
    expect(screen.getByText(/Mainnet uses real stETH and ETH/)).toBeInTheDocument();
    expect(screen.queryByText("tip")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Agent URI")).toHaveClass("bg-[#0b1220]");
  });
});
