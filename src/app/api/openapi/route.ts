import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    openapi: "3.0.3",
    info: {
      title: "ERC-8004 Agents Explorer API",
      version: "1.0.0",
      description: "Public API surface for discovery, stats, exports, and verification in the demo explorer.",
    },
    paths: {
      "/api/agents": {
        get: {
          summary: "List/search agents",
          parameters: [
            { name: "page", in: "query", schema: { type: "integer" } },
            { name: "pageSize", in: "query", schema: { type: "integer" } },
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "network", in: "query", schema: { type: "string" } },
            { name: "verificationEnvironment", in: "query", schema: { type: "string", enum: ["testnet", "mainnet"] } },
            { name: "sort", in: "query", schema: { type: "string" } },
            { name: "protocol", in: "query", schema: { type: "string" } },
          ],
        },
      },
      "/api/agents/[id]": { get: { summary: "Get agent detail by entity ID" } },
      "/api/agents/by-agent-id": { get: { summary: "Get agent detail by ERC-8004 agentId" } },
      "/api/agents/by-owner": { get: { summary: "Get agents by owner address" } },
      "/api/stats": {
        get: {
          summary: "Get dashboard stats/lists/activity",
          parameters: [
            { name: "sampleSize", in: "query", schema: { type: "integer" } },
            { name: "network", in: "query", schema: { type: "string" } },
            { name: "networks", in: "query", schema: { type: "string" } },
          ],
        },
      },
      "/api/export/agents": {
        get: {
          summary: "Export agent list as CSV or JSON",
          parameters: [
            { name: "format", in: "query", schema: { type: "string", enum: ["csv", "json"] } },
            { name: "network", in: "query", schema: { type: "string" } },
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer" } },
          ],
        },
      },
      "/api/export/leaderboard": {
        get: {
          summary: "Export leaderboard table as CSV or JSON",
          parameters: [
            { name: "tab", in: "query", schema: { type: "string" } },
            { name: "format", in: "query", schema: { type: "string", enum: ["csv", "json"] } },
            { name: "network", in: "query", schema: { type: "string" } },
          ],
        },
      },
      "/api/kleros/verification": {
        get: {
          summary: "Get Kleros Curate verification status for an agent",
          parameters: [
            { name: "agentId", in: "query", schema: { type: "string" } },
            { name: "network", in: "query", schema: { type: "string" } },
            { name: "verificationEnvironment", in: "query", schema: { type: "string", enum: ["testnet", "mainnet"] } },
          ],
        },
      },
      "/api/agents/history": {
        get: {
          summary: "Get normalized ERC-8004 and PGTCR history for an agent",
          parameters: [
            { name: "agentId", in: "query", schema: { type: "string" } },
            { name: "network", in: "query", schema: { type: "string" } },
            { name: "verificationEnvironment", in: "query", schema: { type: "string", enum: ["testnet", "mainnet"] } },
          ],
        },
      },
    },
  });
}
