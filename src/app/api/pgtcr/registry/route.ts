import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { mainnet, sepolia } from "viem/chains";
import { ERC20_ABI } from "@/lib/abi/erc20";
import { fetchPgtcrRegistryInfo } from "@/lib/pgtcr-subgraph";
import { getPgtcrDeployment } from "@/lib/curate-config";
import { getVerificationEnvironmentFromSearchParams } from "@/lib/verification-environment";

export async function GET(request: NextRequest) {
  const verificationEnvironment = getVerificationEnvironmentFromSearchParams(request.nextUrl.searchParams);
  try {
    const deployment = getPgtcrDeployment(verificationEnvironment);
    const registry = await fetchPgtcrRegistryInfo(verificationEnvironment);
    const tokenAddress = registry?.token as `0x${string}` | undefined;
    let tokenSymbol: string | null = null;
    let tokenDecimals: number | null = null;

    if (tokenAddress) {
      const rpcUrls = deployment.rpcUrls;
      const chain = verificationEnvironment === "mainnet" ? mainnet : sepolia;

      for (const rpcUrl of rpcUrls) {
        try {
          const client = createPublicClient({
            chain,
            transport: http(rpcUrl),
          });
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
          break;
        } catch {
          // Try the next RPC if this provider is temporarily unavailable.
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
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to fetch PGTCR registry" },
      { status: 500 }
    );
  }
}
