import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { ERC20_ABI } from "@/lib/abi/erc20";
import { fetchPgtcrRegistryInfo } from "@/lib/pgtcr-subgraph";

export async function GET() {
  try {
    const registry = await fetchPgtcrRegistryInfo();
    const tokenAddress = registry?.token as `0x${string}` | undefined;
    let tokenSymbol: string | null = null;
    let tokenDecimals: number | null = null;

    if (tokenAddress) {
      const rpcUrls = [
        process.env.SEPOLIA_RPC_URL?.trim(),
        process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL?.trim(),
        sepolia.rpcUrls.default.http[0],
      ].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);

      for (const rpcUrl of rpcUrls) {
        try {
          const client = createPublicClient({
            chain: sepolia,
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
      registry: {
        ...registry,
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
