import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  collectAgentHistory: vi.fn(),
}));

vi.mock("@/lib/agent-history.server", () => ({
  collectAgentHistory: mocks.collectAgentHistory,
}));

import { GET } from "@/app/api/agents/history/route";

describe("GET /api/agents/history", () => {
  beforeEach(() => {
    mocks.collectAgentHistory.mockReset();
  });

  it("isolates mainnet verification data and returns partial source failures", async () => {
    mocks.collectAgentHistory.mockResolvedValue({
      chainId: 8453,
      events: [
        {
          source: "identity",
          kind: "registered",
          chainId: 8453,
          timestamp: 123,
          blockNumber: "10",
          logIndex: 1,
          transactionHash: "0xabc",
          actor: null,
          details: {},
          externalUrl: "https://basescan.org/tx/0xabc",
        },
      ],
      errors: [{ source: "reputation", message: "RPC range unavailable" }],
    });

    const response = await GET(
      new NextRequest(
        "http://localhost/api/agents/history?agentId=7&network=base&verificationEnvironment=mainnet"
      )
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.collectAgentHistory).toHaveBeenCalledWith({
      agentId: "7",
      network: "base",
      verificationEnvironment: "mainnet",
    });
    expect(json).toMatchObject({
      success: true,
      network: "base",
      verificationEnvironment: "mainnet",
      verificationChainId: 1,
      chainId: 8453,
      partial: true,
    });
    expect(json.events[0].externalUrl).toContain("basescan.org");
  });

  it("defaults old URLs to testnet and rejects malformed IDs before reading logs", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/agents/history?agentId=not-a-number&network=sepolia")
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.events).toEqual([]);
    expect(json).toMatchObject({ verificationEnvironment: "testnet", verificationChainId: 11155111 });
    expect(mocks.collectAgentHistory).not.toHaveBeenCalled();
  });
});
