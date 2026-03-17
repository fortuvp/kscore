import { NextResponse } from "next/server";
import { getNetworkSummary } from "@/lib/network-summary.server";
import { describeAgentSubgraphConfig } from "@/lib/agent-subgraphs.server";

export async function GET() {
  try {
    const data = await getNetworkSummary();
    const items = data.map((item) => ({
      ...item,
      ...describeAgentSubgraphConfig(item.network),
    }));
    return NextResponse.json({
      success: true,
      generatedAt: new Date().toISOString(),
      items,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to compute network summary",
      },
      { status: 500 }
    );
  }
}
