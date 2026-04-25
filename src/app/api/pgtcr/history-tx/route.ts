import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { getCurateRegistryAddress } from "@/lib/curate-config";

const ITEM_STARTS_WITHDRAWING_EVENT = parseAbiItem(
  "event ItemStartsWithdrawing(bytes32 indexed _itemID)"
);
const ITEM_STATUS_CHANGE_EVENT = parseAbiItem(
  "event ItemStatusChange(bytes32 indexed _itemID, uint8 _status)"
);

function getRpcUrls() {
  return [
    process.env.SEPOLIA_RPC_URL?.trim(),
    process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL?.trim(),
    sepolia.rpcUrls.default.http[0],
  ].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
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

async function resolveWithdrawalHistory(params: {
  itemID: Hex;
  withdrawStartedAt?: number | null;
}) {
  const registryAddress = getCurateRegistryAddress("pgtcr") as `0x${string}`;
  const rpcUrls = getRpcUrls();

  for (const rpcUrl of rpcUrls) {
    try {
      const client = createPublicClient({
        chain: sepolia,
        transport: http(rpcUrl),
      });
      const head = await client.getBlockNumber();
      const closestWithdrawBlock =
        params.withdrawStartedAt && params.withdrawStartedAt > 0
          ? await findClosestBlockByTimestamp(client, params.withdrawStartedAt, head)
          : null;
      const fromBlock =
        closestWithdrawBlock && closestWithdrawBlock > 256n
          ? closestWithdrawBlock - 256n
          : 0n;

      const [startLogs, statusLogs] = await Promise.all([
        client.getLogs({
          address: registryAddress,
          event: ITEM_STARTS_WITHDRAWING_EVENT,
          args: { _itemID: params.itemID },
          fromBlock,
          toBlock: head,
        }),
        client.getLogs({
          address: registryAddress,
          event: ITEM_STATUS_CHANGE_EVENT,
          args: { _itemID: params.itemID },
          fromBlock,
          toBlock: head,
        }),
      ]);

      const startLog = startLogs[startLogs.length - 1] || null;
      const absentStatusLogs = statusLogs.filter((log) => Number(log.args._status ?? -1) === 0);
      const executedLog = startLog
        ? absentStatusLogs.find((log) => log.blockNumber > startLog.blockNumber) ||
          absentStatusLogs[absentStatusLogs.length - 1] ||
          null
        : absentStatusLogs[absentStatusLogs.length - 1] || null;

      const blocks = await Promise.all([
        startLog ? client.getBlock({ blockNumber: startLog.blockNumber }) : Promise.resolve(null),
        executedLog ? client.getBlock({ blockNumber: executedLog.blockNumber }) : Promise.resolve(null),
      ]);

      return {
        success: true as const,
        withdrawStartedTxHash: startLog?.transactionHash || null,
        withdrawStartedAt: blocks[0] ? Number(blocks[0].timestamp) : null,
        withdrawExecutedTxHash: executedLog?.transactionHash || null,
        withdrawExecutedAt: blocks[1] ? Number(blocks[1].timestamp) : null,
      };
    } catch {
      // Try the next RPC provider.
    }
  }

  throw new Error("Failed to resolve Curate withdrawal history");
}

export async function GET(request: NextRequest) {
  const itemIDRaw = request.nextUrl.searchParams.get("itemID")?.trim();
  const withdrawStartedAtRaw = request.nextUrl.searchParams.get("withdrawStartedAt");

  if (!itemIDRaw) {
    return NextResponse.json({ success: false, error: "Missing itemID" }, { status: 400 });
  }

  try {
    const withdrawStartedAt = withdrawStartedAtRaw ? Number(withdrawStartedAtRaw) : null;
    const result = await resolveWithdrawalHistory({
      itemID: itemIDRaw as Hex,
      withdrawStartedAt: Number.isFinite(withdrawStartedAt) ? withdrawStartedAt : null,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to resolve Curate history tx hashes" },
      { status: 500 }
    );
  }
}
