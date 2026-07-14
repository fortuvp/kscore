import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, type Hex } from "viem";
import { parseChainId } from "@/lib/block-explorer";

const REGISTER_SELECTOR = "0xf2c298be";
const SET_AGENT_URI_SELECTOR = "0x0af28bd3";

function getRpcUrl(chainId: number): string | null {
  if (chainId === 11155111) {
    return process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || null;
  }
  return null;
}

function getAgentRegistryAddress(chainId: number): `0x${string}` | null {
  if (chainId !== 11155111) return null;
  const value = process.env.NEXT_PUBLIC_AGENT_REGISTRY_SEPOLIA_ADDRESS;
  return value ? (value as `0x${string}`) : null;
}

async function findClosestBlockByTimestamp(
  client: ReturnType<typeof createPublicClient>,
  targetTs: number,
  head: bigint
) {
  let lo = 0n;
  let hi = head;
  let best = head;
  let bestDiff = Number.POSITIVE_INFINITY;

  while (lo <= hi) {
    const mid = (lo + hi) / 2n;
    const block = await client.getBlock({ blockNumber: mid });
    const ts = Number(block.timestamp);
    const diff = Math.abs(ts - targetTs);

    if (diff < bestDiff) {
      bestDiff = diff;
      best = mid;
    }

    if (ts === targetTs) return mid;
    if (ts < targetTs) lo = mid + 1n;
    else hi = mid - 1n;
  }

  return best;
}

async function findNearestOwnerTx(params: {
  client: ReturnType<typeof createPublicClient>;
  head: bigint;
  contractAddress: `0x${string}`;
  owner: string;
  targetTs: number;
  selector?: string;
}) {
  const { client, head, contractAddress, owner, targetTs, selector } = params;
  const ownerLower = owner.toLowerCase();
  const contractLower = contractAddress.toLowerCase();

  const around = await findClosestBlockByTimestamp(client, targetTs, head);
  const start = around > 20n ? around - 20n : 0n;
  const end = around + 20n > head ? head : around + 20n;

  const candidates: Array<{ hash: Hex; delta: number; blockNumber: bigint }> = [];

  for (let blockNumber = start; blockNumber <= end; blockNumber++) {
    const block = await client.getBlock({ blockNumber, includeTransactions: true });
    const blockTs = Number(block.timestamp);

    for (const tx of block.transactions as Array<{
      hash?: Hex;
      from?: string;
      to?: string | null;
      input?: Hex;
    }>) {
      if (!tx?.hash || !tx?.to || !tx?.from || !tx?.input) continue;
      if (tx.to.toLowerCase() !== contractLower) continue;
      if (tx.from.toLowerCase() !== ownerLower) continue;
      if (selector && !tx.input.toLowerCase().startsWith(selector)) continue;

      candidates.push({
        hash: tx.hash,
        delta: Math.abs(blockTs - targetTs),
        blockNumber,
      });
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => a.delta - b.delta || Number(b.blockNumber - a.blockNumber));
  return candidates[0].hash;
}

export async function GET(request: NextRequest) {
  try {
    const chainIdRaw = request.nextUrl.searchParams.get("chainId");
    const owner = request.nextUrl.searchParams.get("owner")?.trim();
    const createdAtRaw = request.nextUrl.searchParams.get("createdAt");
    const updatedAtRaw = request.nextUrl.searchParams.get("updatedAt");

    if (!chainIdRaw || !owner || !createdAtRaw) {
      return NextResponse.json(
        { success: false, error: "Missing required params: chainId, owner, createdAt" },
        { status: 400 }
      );
    }

    const chainId = parseChainId(chainIdRaw);
    if (!chainId) {
      return NextResponse.json({ success: false, error: "Invalid chainId" }, { status: 400 });
    }

    const createdAt = Number(createdAtRaw);
    const updatedAt = Number(updatedAtRaw || createdAtRaw);
    if (!Number.isFinite(createdAt) || createdAt <= 0) {
      return NextResponse.json({ success: false, error: "Invalid createdAt" }, { status: 400 });
    }

    const contractAddress = getAgentRegistryAddress(chainId);
    const rpcUrl = getRpcUrl(chainId);
    if (!contractAddress || !rpcUrl) {
      return NextResponse.json({
        success: true,
        createdTxHash: null,
        updatedTxHash: null,
        contractAddress: null,
      });
    }

    const client = createPublicClient({ transport: http(rpcUrl) });
    const head = await client.getBlockNumber();

    const createdTxHash =
      (await findNearestOwnerTx({
        client,
        head,
        contractAddress,
        owner,
        targetTs: createdAt,
        selector: REGISTER_SELECTOR,
      })) ||
      (await findNearestOwnerTx({
        client,
        head,
        contractAddress,
        owner,
        targetTs: createdAt,
      }));

    let updatedTxHash: Hex | null = null;
    if (Number.isFinite(updatedAt) && updatedAt > createdAt) {
      updatedTxHash =
        (await findNearestOwnerTx({
          client,
          head,
          contractAddress,
          owner,
          targetTs: updatedAt,
          selector: SET_AGENT_URI_SELECTOR,
        })) ||
        (await findNearestOwnerTx({
          client,
          head,
          contractAddress,
          owner,
          targetTs: updatedAt,
        }));
    } else {
      updatedTxHash = createdTxHash;
    }

    if (updatedTxHash && createdTxHash && updatedTxHash.toLowerCase() === createdTxHash.toLowerCase()) {
      updatedTxHash = createdTxHash;
    }

    return NextResponse.json({
      success: true,
      contractAddress,
      createdTxHash,
      updatedTxHash,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to resolve history tx hashes" },
      { status: 500 }
    );
  }
}
