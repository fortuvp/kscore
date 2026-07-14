import { describe, expect, it } from "vitest";

import { normalizeAgentHistoryEvents } from "@/lib/agent-history";
import type { AgentHistoryEvent } from "@/types/agent-history";

function event(overrides: Partial<AgentHistoryEvent>): AgentHistoryEvent {
  return {
    source: "identity",
    kind: "registered",
    chainId: 11155111,
    timestamp: 100,
    blockNumber: "10",
    logIndex: 0,
    transactionHash: "0xabc",
    actor: null,
    details: {},
    externalUrl: null,
    ...overrides,
  };
}

describe("normalizeAgentHistoryEvents", () => {
  it("coalesces mint transfers, deduplicates logs, and sorts newest first", () => {
    const registered = event({ kind: "registered", timestamp: 100, logIndex: 1 });
    const mintTransfer = event({
      kind: "ownership_transferred",
      timestamp: 100,
      logIndex: 0,
      details: {
        from: "0x0000000000000000000000000000000000000000",
        to: "0x1234",
      },
    });
    const feedback = event({
      source: "reputation",
      kind: "feedback_received",
      timestamp: 200,
      blockNumber: "20",
      logIndex: 3,
      transactionHash: "0xdef",
    });

    const result = normalizeAgentHistoryEvents([registered, mintTransfer, feedback, { ...feedback }]);

    expect(result.map((item) => item.kind)).toEqual(["feedback_received", "registered"]);
  });

  it("coalesces indexed Curate rows with exact logs and preserves enrichment", () => {
    const indexed = event({
      source: "curate",
      kind: "curate_withdrawal_started",
      chainId: 11155111,
      transactionHash: "0xwithdraw",
      blockNumber: null,
      logIndex: null,
      actor: "0xowner",
      details: { status: "Absent" },
    });
    const exact = event({
      source: "curate",
      kind: "curate_withdrawal_started",
      chainId: 11155111,
      transactionHash: "0xwithdraw",
      blockNumber: "123",
      logIndex: 4,
      actor: null,
      details: { itemID: "0xitem" },
    });

    expect(normalizeAgentHistoryEvents([indexed, exact])).toEqual([
      expect.objectContaining({
        blockNumber: "123",
        logIndex: 4,
        actor: "0xowner",
        details: { status: "Absent", itemID: "0xitem" },
      }),
    ]);
  });
});
