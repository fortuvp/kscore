import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearAgentRegistrationFileCache,
  getMetadataUriCandidates,
  loadAgentRegistrationFile,
  mergeAgentRegistrationFiles,
  normalizeAgentRegistrationFile,
} from "@/lib/agent-metadata";

describe("agent metadata", () => {
  afterEach(() => {
    clearAgentRegistrationFileCache();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("turns IPFS URIs into retryable browser URLs", () => {
    const candidates = getMetadataUriCandidates("ipfs://bafy-image/avatar.png");
    expect(candidates).toHaveLength(3);
    expect(candidates[0]).toBe("https://cdn.kleros.link/ipfs/bafy-image/avatar.png");
    expect(candidates[1]).toContain("ipfs.io/ipfs/");
  });

  it("merges sparse sources field by field", () => {
    const primary = normalizeAgentRegistrationFile({ name: "Indexed agent", supportedTrusts: ["reputation"] });
    const fallback = normalizeAgentRegistrationFile({
      description: "Fetched from the canonical URI",
      image: "ipfs://bafy-image",
      supportedTrusts: ["validation"],
    });
    const merged = mergeAgentRegistrationFiles(primary, fallback);

    expect(merged).toMatchObject({
      name: "Indexed agent",
      description: "Fetched from the canonical URI",
      image: "https://cdn.kleros.link/ipfs/bafy-image",
      supportedTrusts: ["reputation", "validation"],
    });
  });

  it("retries metadata gateways and caches successful results", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("cdn.kleros.link")) throw new Error("gateway unavailable");
      return new Response(JSON.stringify({ name: "Recovered agent" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadAgentRegistrationFile("ipfs://bafy-metadata")).resolves.toMatchObject({ name: "Recovered agent" });
    const callsAfterFirstLoad = fetchMock.mock.calls.length;
    await loadAgentRegistrationFile("ipfs://bafy-metadata");
    expect(fetchMock).toHaveBeenCalledTimes(callsAfterFirstLoad);
  });

  it("temporarily caches complete gateway failures", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T10:00:00Z"));
    const fetchMock = vi.fn(async () => {
      throw new Error("offline");
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadAgentRegistrationFile("ipfs://bafy-missing")).resolves.toBeNull();
    const callsAfterFailure = fetchMock.mock.calls.length;
    await expect(loadAgentRegistrationFile("ipfs://bafy-missing")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(callsAfterFailure);

    vi.setSystemTime(new Date("2026-07-14T10:00:31Z"));
    await expect(loadAgentRegistrationFile("ipfs://bafy-missing")).resolves.toBeNull();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterFailure);
  });
});
