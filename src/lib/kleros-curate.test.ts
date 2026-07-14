import { describe, expect, it } from "vitest";

import {
  selectPreferredCurateLookup,
  type CurateLookupResult,
} from "@/lib/kleros-curate";

function lookup(status: string, itemID: string): CurateLookupResult {
  return {
    found: true,
    mode: "pgtcr",
    verificationEnvironment: "testnet",
    chainId: 11155111,
    registryAddress: "0x3162df9669affa8b6b6ff2147afa052249f00447",
    status,
    itemID,
    curateRegistryUrl: "https://curate.kleros.io/tcr/11155111/0x3162df9669affa8b6b6ff2147afa052249f00447",
  };
}

describe("Curate lifecycle selection", () => {
  it("does not let a newer Absent lifecycle hide an older active duplicate", () => {
    const selected = selectPreferredCurateLookup([
      lookup("Absent", "0xabsent"),
      lookup("Submitted", "0xactive"),
    ]);

    expect(selected?.itemID).toBe("0xactive");
  });

  it("keeps the newest historical lifecycle when no item is active", () => {
    expect(
      selectPreferredCurateLookup([
        lookup("Absent", "0xnewest"),
        lookup("Absent", "0xolder"),
      ])?.itemID
    ).toBe("0xnewest");
  });
});
