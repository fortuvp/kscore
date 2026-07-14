import { isAddress, parseUnits } from "viem";

export type PgtcrSchemaColumn = {
  label: string;
  type?: string;
  description?: string;
  isIdentifier?: boolean;
};

export function normalizePgtcrColumnKey(label: string) {
  return label.trim();
}

export function isPgtcrAddressColumn(column: Pick<PgtcrSchemaColumn, "label" | "type">) {
  const label = column.label.trim().toLowerCase();
  const type = (column.type || "").trim().toLowerCase();
  return label === "key2" || label.includes("caip") || type.includes("rich") || type.includes("address");
}

export function parseStakeDeposit(value: string, decimals: number, minimum: bigint) {
  const trimmed = value.trim();
  if (!trimmed) return { value: minimum, error: null };
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return { value: null, error: "Enter a valid non-negative token amount." };
  }

  try {
    const parsed = parseUnits(trimmed, decimals);
    if (parsed < minimum) {
      return { value: parsed, error: "The stake must be at least the registry minimum." };
    }
    return { value: parsed, error: null };
  } catch {
    return { value: null, error: `Enter no more than ${decimals} decimal places.` };
  }
}

export function validateCaip10(chainId: string, address: string) {
  const chain = chainId.trim();
  const account = address.trim();
  if (!/^[1-9]\d*$/.test(chain)) return "Choose a canonical positive EIP-155 chain.";
  if (!isAddress(account)) return "Enter a valid EVM address.";
  return null;
}

function isValidSubmissionUri(value: string) {
  if (/^ipfs:\/\/(?:ipfs\/)?[^\s/?#]+(?:\/[^\s]*)?$/i.test(value)) return true;
  if (/^\/ipfs\/[^\s/?#]+(?:\/[^\s]*)?$/i.test(value)) return true;
  if (/^ar:\/\/[^\s/?#]+(?:\/[^\s]*)?$/i.test(value)) return true;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function validatePgtcrField(column: PgtcrSchemaColumn, value: string) {
  const trimmed = value.trim();
  if (!trimmed) return `${column.label} is required.`;

  const label = column.label.trim().toLowerCase();
  const type = (column.type || "").trim().toLowerCase();
  if (label.includes("uri") || type.includes("uri")) {
    if (!isValidSubmissionUri(trimmed)) {
      return `${column.label} must be a complete HTTP(S), IPFS, or Arweave URI.`;
    }
  }
  return null;
}

export function buildPgtcrItemValues({
  columns,
  agentId,
  values,
}: {
  columns: PgtcrSchemaColumn[];
  agentId: string;
  values: Record<string, string>;
}) {
  const rawAgentId = agentId.trim();
  if (!/^\d+$/.test(rawAgentId)) {
    return { values: null, error: "Enter a valid numeric ERC-8004 agent number." };
  }
  const numericAgentId = BigInt(rawAgentId).toString();

  if (!columns.length || columns.some((column) => !column.label.trim())) {
    return { values: null, error: "The live registry schema is missing valid column labels." };
  }
  const labels = columns.map((column) => normalizePgtcrColumnKey(column.label));
  if (new Set(labels).size !== labels.length) {
    return { values: null, error: "The live registry schema contains duplicate column labels." };
  }

  const identifier = normalizePgtcrColumnKey(columns[0]?.label || "");
  const itemValues: Record<string, string> = {};

  for (const column of columns) {
    const key = normalizePgtcrColumnKey(column.label);
    if (key === identifier) {
      itemValues[key] = numericAgentId;
      continue;
    }

    if (isPgtcrAddressColumn(column)) {
      const chain = (values[`${key}__chain`] || "").trim();
      const address = (values[`${key}__address`] || "").trim();
      const error = validateCaip10(chain, address);
      if (error) return { values: null, error: `${column.label}: ${error}` };
      itemValues[key] = `eip155:${chain}:${address}`;
      continue;
    }

    const value = (values[key] || "").trim();
    const error = validatePgtcrField(column, value);
    if (error) return { values: null, error };
    itemValues[key] = value;
  }

  return { values: itemValues, error: null };
}

export function findDuplicatePgtcrItem<T extends { status?: string | null }>(items: T[]) {
  return items.find((item) => item.status && item.status !== "Absent") || null;
}
