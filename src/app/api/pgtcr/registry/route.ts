import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { mainnet, sepolia } from "viem/chains";
import { ERC20_ABI } from "@/lib/abi/erc20";
import { IARBITRATOR_ABI } from "@/lib/abi/iArbitrator";
import { fetchPgtcrRegistryInfo } from "@/lib/pgtcr-subgraph";
import { getPgtcrDeployment } from "@/lib/curate-config";
import { getVerificationEnvironmentFromSearchParams } from "@/lib/verification-environment";

export async function GET(request: NextRequest) {
  const verificationEnvironment = getVerificationEnvironmentFromSearchParams(request.nextUrl.searchParams);
  try {
    const deployment = getPgtcrDeployment(verificationEnvironment);
    const registry = await fetchPgtcrRegistryInfo(verificationEnvironment);
    const tokenAddress = registry?.token as `0x${string}` | undefined;
    const arbitratorAddress = registry?.arbitrator?.id as `0x${string}` | undefined;
    const arbitratorExtraData = registry?.arbitrationSettings?.[0]?.arbitratorExtraData as `0x${string}` | undefined;
    let tokenSymbol: string | null = null;
    let tokenDecimals: number | null = null;
    let arbitrationCost: string | null = null;

    if (tokenAddress || (arbitratorAddress && arbitratorExtraData)) {
      const rpcUrls = deployment.rpcUrls;
      const chain = verificationEnvironment === "mainnet" ? mainnet : sepolia;

      for (const rpcUrl of rpcUrls) {
        const client = createPublicClient({
          chain,
          transport: http(rpcUrl),
        });

        if (tokenAddress && (tokenSymbol === null || tokenDecimals === null)) {
          try {
            const [symbol, decimals] = await Promise.all([
              client.readContract({
                address: tokenAddress,
                abi: ERC20_ABI,
                functionName: "symbol",
              }),
              client.readContract({
                address: tokenAddress,
                abi: ERC20_ABI,
                functionName: "decimals",
              }),
            ]);
            tokenSymbol = String(symbol || "");
            tokenDecimals = Number(decimals ?? 18);
          } catch {
            // Keep trying the remaining RPCs.
          }
        }

        if (arbitratorAddress && arbitratorExtraData && arbitrationCost === null) {
          try {
            const cost = await client.readContract({
              address: arbitratorAddress,
              abi: IARBITRATOR_ABI,
              functionName: "arbitrationCost",
              args: [arbitratorExtraData],
            });
            arbitrationCost = cost.toString();
          } catch {
            // Keep trying the remaining RPCs.
          }
        }

        if (
          (!tokenAddress || (tokenSymbol !== null && tokenDecimals !== null)) &&
          (!arbitratorAddress || !arbitratorExtraData || arbitrationCost !== null)
        ) {
          break;
        }
      }
    }

    return NextResponse.json({
      success: true,
      verificationEnvironment,
      chainId: deployment.chainId,
      registryAddress: deployment.registryAddress,
      registry: {
        ...registry,
        verificationEnvironment,
        chainId: deployment.chainId,
        tokenSymbol,
        tokenDecimals,
        arbitrationCost,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to fetch PGTCR registry" },
      { status: 500 }
    );
  }
}
