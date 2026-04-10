import { AGENT_NETWORK_CHAIN_IDS, type AgentSubgraphNetwork } from "@/lib/agent-networks";
import { getAgentNetworkFromChainId, parseChainId } from "@/lib/block-explorer";
import type { AgentRegistrationFile, AgentWithDetails } from "@/types/agent";

const EMPTY_OWNER_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEFAULT_FETCH_TIMEOUT_MS = 3500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readOptionalBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readOptionalStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim());
}

function decodeBase64Utf8(value: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "base64").toString("utf8");
  }

  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function toGatewayUrl(uri: string): string | null {
  const trimmed = uri.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("ipfs://")) return `https://cdn.kleros.link/ipfs/${trimmed.slice("ipfs://".length)}`;
  if (trimmed.startsWith("/ipfs/")) return `https://cdn.kleros.link${trimmed}`;
  if (trimmed.startsWith("Qm") || trimmed.startsWith("baf")) return `https://cdn.kleros.link/ipfs/${trimmed}`;
  return null;
}

function normalizeImageUri(value: unknown): string | null {
  const image = readOptionalString(value);
  if (!image) return null;
  return toGatewayUrl(image) || image;
}

function createEmptyRegistrationFile(): AgentRegistrationFile {
  return {
    name: null,
    description: null,
    image: null,
    active: null,
    x402Support: null,
    supportedTrusts: [],
    mcpEndpoint: null,
    mcpVersion: null,
    mcpTools: [],
    mcpPrompts: [],
    mcpResources: [],
    a2aEndpoint: null,
    a2aVersion: null,
    a2aSkills: [],
    ens: null,
    did: null,
  };
}

function parseJsonLikeUri(uri: string): unknown | null {
  const trimmed = uri.trim();
  if (!trimmed.startsWith("data:")) return null;

  const separatorIndex = trimmed.indexOf(",");
  if (separatorIndex === -1) return null;

  const metadata = trimmed.slice(5, separatorIndex).toLowerCase();
  const payload = trimmed.slice(separatorIndex + 1);
  const decoded = metadata.includes(";base64")
    ? decodeBase64Utf8(payload)
    : decodeURIComponent(payload);

  return JSON.parse(decoded) as unknown;
}

export function normalizeCurateRegistrationFile(payload: unknown): AgentRegistrationFile {
  if (!isRecord(payload)) return createEmptyRegistrationFile();

  return {
    name: readOptionalString(payload.name),
    description: readOptionalString(payload.description),
    image: normalizeImageUri(payload.image),
    active: readOptionalBoolean(payload.active),
    x402Support: readOptionalBoolean(payload.x402Support),
    supportedTrusts: readOptionalStringArray(payload.supportedTrusts),
    mcpEndpoint: readOptionalString(payload.mcpEndpoint),
    mcpVersion: readOptionalString(payload.mcpVersion),
    mcpTools: readOptionalStringArray(payload.mcpTools),
    mcpPrompts: readOptionalStringArray(payload.mcpPrompts),
    mcpResources: readOptionalStringArray(payload.mcpResources),
    a2aEndpoint: readOptionalString(payload.a2aEndpoint),
    a2aVersion: readOptionalString(payload.a2aVersion),
    a2aSkills: readOptionalStringArray(payload.a2aSkills),
    ens: readOptionalString(payload.ens),
    did: readOptionalString(payload.did),
  };
}

export function parseCurateRegistrationFile(uri: string | null | undefined): AgentRegistrationFile | null {
  const trimmed = uri?.trim();
  if (!trimmed) return null;

  try {
    const payload = parseJsonLikeUri(trimmed);
    if (payload === null) return null;
    return normalizeCurateRegistrationFile(payload);
  } catch {
    return null;
  }
}

export async function loadCurateRegistrationFile(
  uri: string | null | undefined,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS
): Promise<AgentRegistrationFile | null> {
  const trimmed = uri?.trim();
  if (!trimmed) return null;

  const inline = parseCurateRegistrationFile(trimmed);
  if (inline) return inline;

  const url = toGatewayUrl(trimmed);
  if (!url) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json, text/plain;q=0.9, */*;q=0.1" },
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type")?.toLowerCase() || "";
    if (contentType.includes("text/html")) return null;

    const text = await response.text();
    if (!text.trim()) return null;

    return normalizeCurateRegistrationFile(JSON.parse(text) as unknown);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function extractCurateAgentNumber(agentIdLike: string): string {
  const trimmed = agentIdLike.trim();
  if (!trimmed) return trimmed;
  if (/^\d+$/.test(trimmed)) return trimmed;
  if (trimmed.startsWith("eip155:")) {
    const tail = trimmed.split(":").pop()?.trim();
    if (tail && /^\d+$/.test(tail)) return tail;
  }
  return trimmed;
}

export function parseCaip10Owner(value: string | null | undefined): {
  owner: string | null;
  chainId: string | null;
  network: AgentSubgraphNetwork | null;
} {
  const trimmed = value?.trim();
  if (!trimmed?.startsWith("eip155:")) {
    return { owner: null, chainId: null, network: null };
  }

  const parts = trimmed.split(":");
  const chainId = parts[1]?.trim() || null;
  const owner = parts.slice(2).join(":").trim() || null;
  const network = getAgentNetworkFromChainId(chainId);
  return { owner, chainId, network };
}

export function buildCurateFallbackAgent(params: {
  agentId: string;
  agentUri: string | null;
  key2: string | null;
  network: AgentSubgraphNetwork;
  includedAt: string | number | null | undefined;
  registrationFile?: AgentRegistrationFile | null;
}): AgentWithDetails {
  const registrationFile = params.registrationFile || createEmptyRegistrationFile();
  const caip10 = parseCaip10Owner(params.key2);
  const chainId = parseChainId(caip10.chainId) || AGENT_NETWORK_CHAIN_IDS[params.network];
  const timestamp = Number(params.includedAt) || Math.floor(Date.now() / 1000);

  return {
    id: params.agentId,
    agentId: params.agentId,
    chainId: String(chainId),
    owner: caip10.owner || EMPTY_OWNER_ADDRESS,
    operators: [],
    agentURI: params.agentUri,
    createdAt: String(timestamp),
    updatedAt: String(timestamp),
    totalFeedback: "0",
    lastActivity: String(timestamp),
    registrationFile,
    feedback: [],
    stats: null,
  };
}

