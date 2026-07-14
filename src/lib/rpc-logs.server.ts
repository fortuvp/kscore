import "server-only";

import { createPublicClient } from "viem";

const DEFAULT_LOG_CHUNK_SIZE = 250_000n;
const MIN_LOG_CHUNK_SIZE = 1_000n;
const BLOCK_TIMESTAMP_CACHE_TTL_MS = 5 * 60_000;

type PublicClient = ReturnType<typeof createPublicClient>;
type RpcLog = Awaited<ReturnType<PublicClient["getLogs"]>>[number];

const blockTimestampCache = new Map<string, { expiresAt: number; value: number }>();

function isRangeLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return (
    normalized.includes("eth_getlogs is limited") ||
    normalized.includes("maximum allowed number of requested blocks") ||
    normalized.includes("request exceeds defined limit") ||
    normalized.includes("block range") ||
    normalized.includes("log response size exceeded") ||
    normalized.includes("query returned more than") ||
    normalized.includes("413")
  );
}

export async function getLogsWithAdaptiveChunking(
  client: PublicClient,
  request: Record<string, unknown>,
  fromBlock: bigint,
  toBlock: bigint,
  initialChunkSize = DEFAULT_LOG_CHUNK_SIZE
): Promise<RpcLog[]> {
  if (toBlock < fromBlock) return [];
  const logs: RpcLog[] = [];

  for (let cursor = fromBlock; cursor <= toBlock;) {
    let chunkSize = initialChunkSize;
    let batch: RpcLog[] | null = null;

    while (batch === null) {
      const batchToBlock = cursor + chunkSize > toBlock ? toBlock : cursor + chunkSize;
      try {
        batch = await (client.getLogs as (args: Record<string, unknown>) => Promise<RpcLog[]>)({
          ...request,
          fromBlock: cursor,
          toBlock: batchToBlock,
        });
        cursor = batchToBlock + 1n;
      } catch (error) {
        if (!isRangeLimitError(error) || chunkSize <= MIN_LOG_CHUNK_SIZE) throw error;
        chunkSize /= 2n;
        if (chunkSize < MIN_LOG_CHUNK_SIZE) chunkSize = MIN_LOG_CHUNK_SIZE;
      }
    }

    logs.push(...batch);
  }

  return logs;
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;

  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}

export async function getBlockTimestamps(
  chainId: number,
  clients: readonly PublicClient[],
  blockNumbers: readonly bigint[]
): Promise<Map<string, number>> {
  const unique = Array.from(new Set(blockNumbers.map((value) => value.toString()))).map(BigInt);
  const output = new Map<string, number>();

  await mapWithConcurrency(unique, 8, async (blockNumber) => {
    const key = `${chainId}:${blockNumber.toString()}`;
    const cached = blockTimestampCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      output.set(blockNumber.toString(), cached.value);
      return;
    }

    for (const client of clients) {
      try {
        const block = await client.getBlock({ blockNumber });
        const value = Number(block.timestamp);
        blockTimestampCache.set(key, {
          value,
          expiresAt: Date.now() + BLOCK_TIMESTAMP_CACHE_TTL_MS,
        });
        output.set(blockNumber.toString(), value);
        return;
      } catch {
        // Try the next configured RPC.
      }
    }
  });

  return output;
}
