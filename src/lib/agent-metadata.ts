import type { Agent, AgentRegistrationFile } from "@/types/agent";

const DEFAULT_FETCH_TIMEOUT_MS = 4_000;
const SUCCESS_CACHE_TTL_MS = 5 * 60_000;
const FAILURE_CACHE_TTL_MS = 30_000;

export const IPFS_GATEWAY_BASE_URLS = [
  "https://cdn.kleros.link/ipfs/",
  "https://ipfs.io/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
] as const;

type CachedRegistrationFile = {
  expiresAt: number;
  value: AgentRegistrationFile | null;
  request?: Promise<AgentRegistrationFile | null>;
};

const registrationFileCache = new Map<string, CachedRegistrationFile>();

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
  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim());
}

function uniqueStrings(...groups: Array<readonly string[]>): string[] {
  const values = new Set<string>();
  for (const group of groups) {
    for (const value of group) {
      const trimmed = value.trim();
      if (trimmed) values.add(trimmed);
    }
  }
  return Array.from(values);
}

function findService(payload: Record<string, unknown>, serviceName: string) {
  const services = Array.isArray(payload.services) ? payload.services : [];
  const normalizedName = serviceName.toLowerCase();
  return services.find((service) => {
    if (!isRecord(service)) return false;
    const name = readOptionalString(service.name) || readOptionalString(service.type) || readOptionalString(service.protocol);
    return name?.toLowerCase() === normalizedName;
  });
}

function decodeBase64Utf8(value: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "base64").toString("utf8");
  }

  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function getIpfsPath(uri: string): string | null {
  const trimmed = uri.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("ipfs://")) {
    return trimmed.slice("ipfs://".length).replace(/^ipfs\//, "");
  }
  if (trimmed.startsWith("/ipfs/")) return trimmed.slice("/ipfs/".length);
  if (trimmed.startsWith("Qm") || trimmed.startsWith("baf")) return trimmed;

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const parsed = new URL(trimmed);
      const marker = "/ipfs/";
      const markerIndex = parsed.pathname.indexOf(marker);
      if (markerIndex >= 0) {
        return `${parsed.pathname.slice(markerIndex + marker.length)}${parsed.search}`;
      }
    } catch {
      return null;
    }
  }

  return null;
}

/** Returns browser/fetch-ready candidates while retaining alternate gateways for retries. */
export function getMetadataUriCandidates(uri: string | null | undefined): string[] {
  const trimmed = uri?.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("data:")) return [trimmed];

  const ipfsPath = getIpfsPath(trimmed);
  if (ipfsPath) {
    const gatewayCandidates = IPFS_GATEWAY_BASE_URLS.map((base) => `${base}${ipfsPath}`);
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return uniqueStrings([trimmed], gatewayCandidates);
    }
    return uniqueStrings(gatewayCandidates);
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return [trimmed];
  return [];
}

export function normalizeMetadataUri(uri: string | null | undefined): string | null {
  return getMetadataUriCandidates(uri)[0] || readOptionalString(uri);
}

export function createEmptyRegistrationFile(): AgentRegistrationFile {
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

export function normalizeAgentRegistrationFile(payload: unknown): AgentRegistrationFile {
  if (!isRecord(payload)) return createEmptyRegistrationFile();

  const mcpService = findService(payload, "mcp");
  const a2aService = findService(payload, "a2a");
  const ensService = findService(payload, "ens");
  const didService = findService(payload, "did");
  const supportedTrusts = readOptionalStringArray(payload.supportedTrusts);
  const mcpTools = readOptionalStringArray(payload.mcpTools);
  const mcpPrompts = readOptionalStringArray(payload.mcpPrompts);
  const mcpResources = readOptionalStringArray(payload.mcpResources);
  const a2aSkills = readOptionalStringArray(payload.a2aSkills);

  return {
    name: readOptionalString(payload.name),
    description: readOptionalString(payload.description),
    image: normalizeMetadataUri(readOptionalString(payload.image)),
    active: readOptionalBoolean(payload.active),
    x402Support: readOptionalBoolean(payload.x402Support),
    supportedTrusts: supportedTrusts.length ? supportedTrusts : readOptionalStringArray(payload.supportedTrust),
    mcpEndpoint: readOptionalString(payload.mcpEndpoint) || (isRecord(mcpService) ? readOptionalString(mcpService.endpoint) : null),
    mcpVersion: readOptionalString(payload.mcpVersion) || (isRecord(mcpService) ? readOptionalString(mcpService.version) : null),
    mcpTools: mcpTools.length ? mcpTools : isRecord(mcpService) ? readOptionalStringArray(mcpService.tools) : [],
    mcpPrompts: mcpPrompts.length ? mcpPrompts : isRecord(mcpService) ? readOptionalStringArray(mcpService.prompts) : [],
    mcpResources: mcpResources.length ? mcpResources : isRecord(mcpService) ? readOptionalStringArray(mcpService.resources) : [],
    a2aEndpoint: readOptionalString(payload.a2aEndpoint) || (isRecord(a2aService) ? readOptionalString(a2aService.endpoint) : null),
    a2aVersion: readOptionalString(payload.a2aVersion) || (isRecord(a2aService) ? readOptionalString(a2aService.version) : null),
    a2aSkills: a2aSkills.length ? a2aSkills : isRecord(a2aService) ? readOptionalStringArray(a2aService.skills) : [],
    ens: readOptionalString(payload.ens) || (isRecord(ensService) ? readOptionalString(ensService.endpoint) : null),
    did: readOptionalString(payload.did) || (isRecord(didService) ? readOptionalString(didService.endpoint) : null),
  };
}

/** Keeps richer primary fields while filling holes and combining list fields from fallbacks. */
export function mergeAgentRegistrationFiles(
  primary: AgentRegistrationFile | null | undefined,
  fallback: AgentRegistrationFile | null | undefined
): AgentRegistrationFile | null {
  if (!primary && !fallback) return null;
  const left = primary ? normalizeAgentRegistrationFile(primary) : createEmptyRegistrationFile();
  const right = fallback ? normalizeAgentRegistrationFile(fallback) : createEmptyRegistrationFile();

  return {
    name: left.name || right.name,
    description: left.description || right.description,
    image: left.image || right.image,
    active: left.active ?? right.active,
    x402Support: left.x402Support ?? right.x402Support,
    supportedTrusts: uniqueStrings(left.supportedTrusts, right.supportedTrusts),
    mcpEndpoint: left.mcpEndpoint || right.mcpEndpoint,
    mcpVersion: left.mcpVersion || right.mcpVersion,
    mcpTools: uniqueStrings(left.mcpTools, right.mcpTools),
    mcpPrompts: uniqueStrings(left.mcpPrompts, right.mcpPrompts),
    mcpResources: uniqueStrings(left.mcpResources, right.mcpResources),
    a2aEndpoint: left.a2aEndpoint || right.a2aEndpoint,
    a2aVersion: left.a2aVersion || right.a2aVersion,
    a2aSkills: uniqueStrings(left.a2aSkills, right.a2aSkills),
    ens: left.ens || right.ens,
    did: left.did || right.did,
  };
}

function positiveTimestamp(value: string | null | undefined): number {
  const parsed = Number(value || "0");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Merges the same registry agent from independent indexers/fallbacks. The preferred
 * record keeps canonical identity fields, while useful metadata and timestamps from
 * the secondary source fill gaps instead of being discarded wholesale.
 */
export function mergeAgentMetadataSources<T extends Agent>(preferred: T, secondary: Agent | null | undefined): T {
  if (!secondary) {
    return {
      ...preferred,
      registrationFile: preferred.registrationFile
        ? normalizeAgentRegistrationFile(preferred.registrationFile)
        : null,
    };
  }

  const preferredCreatedAt = positiveTimestamp(preferred.createdAt);
  const secondaryCreatedAt = positiveTimestamp(secondary.createdAt);
  const preferredUpdatedAt = positiveTimestamp(preferred.updatedAt);
  const secondaryUpdatedAt = positiveTimestamp(secondary.updatedAt);
  const preferredLastActivity = positiveTimestamp(preferred.lastActivity);
  const secondaryLastActivity = positiveTimestamp(secondary.lastActivity);

  return {
    ...secondary,
    ...preferred,
    agentURI: preferred.agentURI || secondary.agentURI,
    operators: preferred.operators.length ? preferred.operators : secondary.operators,
    createdAt: String(preferredCreatedAt || secondaryCreatedAt || 0),
    updatedAt: String(Math.max(preferredUpdatedAt, secondaryUpdatedAt)),
    lastActivity: String(Math.max(preferredLastActivity, secondaryLastActivity)),
    totalFeedback: String(Math.max(Number(preferred.totalFeedback || 0), Number(secondary.totalFeedback || 0))),
    registrationFile: mergeAgentRegistrationFiles(preferred.registrationFile, secondary.registrationFile),
    collateralized: preferred.collateralized ?? secondary.collateralized,
  } as T;
}

export function parseAgentRegistrationFileUri(uri: string | null | undefined): AgentRegistrationFile | null {
  const value = uri?.trim();
  if (!value) return null;
  const trimmed = value;
  if (!trimmed.startsWith("data:")) return null;
  const separatorIndex = trimmed.indexOf(",");
  if (separatorIndex === -1) return null;

  try {
    const metadata = trimmed.slice(5, separatorIndex).toLowerCase();
    const payload = trimmed.slice(separatorIndex + 1);
    const decoded = metadata.includes(";base64") ? decodeBase64Utf8(payload) : decodeURIComponent(payload);
    return normalizeAgentRegistrationFile(JSON.parse(decoded) as unknown);
  } catch {
    return null;
  }
}

async function fetchJsonCandidate(url: string, timeoutMs: number): Promise<AgentRegistrationFile> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json, text/plain;q=0.9, */*;q=0.1" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Metadata gateway returned ${response.status}`);
    const contentType = response.headers.get("content-type")?.toLowerCase() || "";
    if (contentType.includes("text/html")) throw new Error("Metadata gateway returned HTML");
    const text = await response.text();
    if (!text.trim()) throw new Error("Metadata file is empty");
    return normalizeAgentRegistrationFile(JSON.parse(text) as unknown);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRegistrationFile(uri: string, timeoutMs: number): Promise<AgentRegistrationFile | null> {
  const inline = parseAgentRegistrationFileUri(uri);
  if (inline) return inline;

  const candidates = getMetadataUriCandidates(uri);
  if (!candidates.length) return null;

  try {
    return await Promise.any(candidates.map((candidate) => fetchJsonCandidate(candidate, timeoutMs)));
  } catch {
    return null;
  }
}

export async function loadAgentRegistrationFile(
  uri: string | null | undefined,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS
): Promise<AgentRegistrationFile | null> {
  const trimmed = uri?.trim();
  if (!trimmed) return null;

  const inline = parseAgentRegistrationFileUri(trimmed);
  if (inline) return inline;

  const now = Date.now();
  const existing = registrationFileCache.get(trimmed);
  if (existing?.expiresAt && existing.expiresAt > now) return existing.value;
  if (existing?.request) return existing.request;

  const request = fetchRegistrationFile(trimmed, timeoutMs).then((value) => {
    registrationFileCache.set(trimmed, {
      value,
      expiresAt: Date.now() + (value ? SUCCESS_CACHE_TTL_MS : FAILURE_CACHE_TTL_MS),
    });
    return value;
  });

  registrationFileCache.set(trimmed, { value: null, expiresAt: 0, request });
  return request;
}

export function clearAgentRegistrationFileCache() {
  registrationFileCache.clear();
}
