import { describe, expect, it, vi } from "vitest";

import { executeConfirmedTransaction } from "@/lib/confirmed-transaction";

describe("executeConfirmedTransaction", () => {
  it("simulates before writing and waits for the receipt", async () => {
    const calls: string[] = [];
    const simulate = vi.fn(async () => {
      calls.push("simulate");
      return { to: "registry" };
    });
    const write = vi.fn(async () => {
      calls.push("write");
      return "0xhash";
    });
    const wait = vi.fn(async () => {
      calls.push("wait");
      return { status: "success" };
    });

    await expect(executeConfirmedTransaction({ simulate, write, wait })).resolves.toMatchObject({ hash: "0xhash" });
    expect(calls).toEqual(["simulate", "write", "wait"]);
  });

  it("does not write when simulation fails", async () => {
    const write = vi.fn(async () => "0xhash");
    await expect(
      executeConfirmedTransaction({
        simulate: async () => {
          throw new Error("simulation rejected");
        },
        write,
        wait: async () => ({ status: "success" }),
      })
    ).rejects.toThrow("simulation rejected");
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects a reverted receipt", async () => {
    await expect(
      executeConfirmedTransaction({
        simulate: async () => ({ request: true }),
        write: async () => "0xhash",
        wait: async () => ({ status: "reverted" }),
      })
    ).rejects.toThrow("reverted");
  });
});
