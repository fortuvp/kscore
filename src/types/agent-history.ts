export type AgentHistorySource = "identity" | "reputation" | "validation" | "curate";

export type AgentHistoryKind =
  | "registered"
  | "uri_updated"
  | "metadata_set"
  | "ownership_transferred"
  | "feedback_received"
  | "feedback_revoked"
  | "feedback_response"
  | "validation_requested"
  | "validation_responded"
  | "curate_submitted"
  | "curate_challenged"
  | "curate_resolved"
  | "curate_evidence"
  | "curate_appealed"
  | "curate_withdrawal_started"
  | "curate_withdrawn";

export type AgentHistoryDetailValue = string | number | boolean | null;

export type AgentHistoryEvent = {
  source: AgentHistorySource;
  kind: AgentHistoryKind;
  chainId: number;
  timestamp: number;
  blockNumber: string | null;
  logIndex: number | null;
  transactionHash: string | null;
  actor: string | null;
  details: Record<string, AgentHistoryDetailValue>;
  externalUrl: string | null;
};

export type AgentHistorySourceError = {
  source: AgentHistorySource;
  message: string;
};
