import { NextRequest, NextResponse } from "next/server";
import { fetchPgtcrItemByItemIdBytes } from "@/lib/pgtcr-subgraph";
import { getPgtcrDeployment } from "@/lib/curate-config";
import { getVerificationEnvironmentFromSearchParams } from "@/lib/verification-environment";

export async function GET(request: NextRequest) {
  const itemID = request.nextUrl.searchParams.get("itemID");
  if (!itemID) return NextResponse.json({ success: false, error: "Missing itemID" }, { status: 400 });
  const verificationEnvironment = getVerificationEnvironmentFromSearchParams(request.nextUrl.searchParams);

  try {
    const deployment = getPgtcrDeployment(verificationEnvironment);
    const item = await fetchPgtcrItemByItemIdBytes(itemID, verificationEnvironment);
    return NextResponse.json({
      success: true,
      verificationEnvironment,
      chainId: deployment.chainId,
      registryAddress: deployment.registryAddress,
      item,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to fetch PGTCR item" },
      { status: 500 }
    );
  }
}
