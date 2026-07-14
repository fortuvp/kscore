import type { AgentHistoryEvent } from "@/types/agent-history";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function normalizeAgentHistoryEvents(events: readonly AgentHistoryEvent[]): AgentHistoryEvent[] {
  const registeredTransactions = new Set(
    events
      .filter((event) => event.kind === "registered" && event.transactionHash)
      .map((event) => `${event.chainId}:${event.transactionHash!.toLowerCase()}`)
  );

  const deduped = new Map<string, AgentHistoryEvent>();
  for (const event of events) {
    if (
      event.kind === "ownership_transferred" &&
      String(event.details.from || "").toLowerCase() === ZERO_ADDRESS &&
      event.transactionHash &&
      registeredTransactions.has(`${event.chainId}:${event.transactionHash.toLowerCase()}`)
    ) {
      continue;
    }

    const key = event.transactionHash
      ? event.source === "curate"
        ? `${event.chainId}:${event.transactionHash.toLowerCase()}:${event.kind}`
        : `${event.chainId}:${event.transactionHash.toLowerCase()}:${event.logIndex ?? "-"}:${event.kind}`
      : `${event.chainId}:${event.source}:${event.kind}:${event.blockNumber || event.timestamp}:${event.logIndex ?? "-"}`;
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, event);
      continue;
    }

    const exact = !existing.blockNumber && event.blockNumber ? event : existing;
    const enrichment = exact === event ? existing : event;
    deduped.set(key, {
      ...enrichment,
      ...exact,
      timestamp: exact.timestamp || enrichment.timestamp,
      actor: exact.actor || enrichment.actor,
      details: { ...enrichment.details, ...exact.details },
      externalUrl: exact.externalUrl || enrichment.externalUrl,
    });
  }

  return Array.from(deduped.values()).sort((left, right) => {
    if (right.timestamp !== left.timestamp) return right.timestamp - left.timestamp;
    const rightBlock = BigInt(right.blockNumber || 0);
    const leftBlock = BigInt(left.blockNumber || 0);
    if (rightBlock !== leftBlock) return rightBlock > leftBlock ? 1 : -1;
    return (right.logIndex || 0) - (left.logIndex || 0);
  });
}
