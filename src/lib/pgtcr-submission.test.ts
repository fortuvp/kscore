import { describe, expect, it } from "vitest";

import {
  buildPgtcrItemValues,
  findDuplicatePgtcrItem,
  parseStakeDeposit,
  validateCaip10,
} from "@/lib/pgtcr-submission";

describe("PGTCR submission validation", () => {
  it("uses the live minimum only when the deposit is empty", () => {
    expect(parseStakeDeposit("", 18, 20n).value).toBe(20n);
    expect(parseStakeDeposit("not-a-number", 18, 20n)).toMatchObject({ value: null });
    expect(parseStakeDeposit("0.000000000000000019", 18, 20n).error).toContain("minimum");
  });

  it("validates EIP-155 CAIP-10 parts", () => {
    expect(validateCaip10("1", "0x0000000000000000000000000000000000000001")).toBeNull();
    expect(validateCaip10("01", "0x0000000000000000000000000000000000000001")).toContain("canonical");
    expect(validateCaip10("sepolia", "0x0000000000000000000000000000000000000001")).toContain("chain");
    expect(validateCaip10("11155111", "not-an-address")).toContain("address");
  });

  it("builds exact schema keys and rejects malformed URIs", () => {
    const columns = [
      { label: "Agent Number" },
      { label: "Agent URI", type: "uri" },
      { label: "Owner", type: "rich address" },
      { label: "Additional Info" },
    ];
    const values = {
      "Agent URI": "ipfs://bafy-agent",
      Owner__chain: "8453",
      Owner__address: "0x0000000000000000000000000000000000000001",
      "Additional Info": "Reviewed registration data",
    };

    expect(buildPgtcrItemValues({ columns, agentId: "42", values }).values).toEqual({
      "Agent Number": "42",
      "Agent URI": "ipfs://bafy-agent",
      Owner: "eip155:8453:0x0000000000000000000000000000000000000001",
      "Additional Info": "Reviewed registration data",
    });
    expect(
      buildPgtcrItemValues({ columns, agentId: "42", values: { ...values, "Agent URI": "plain text" } }).error
    ).toContain("URI");
    expect(
      buildPgtcrItemValues({ columns, agentId: "42", values: { ...values, "Agent URI": "https://" } }).error
    ).toContain("complete");
    expect(buildPgtcrItemValues({ columns, agentId: "0042", values }).values?.["Agent Number"]).toBe("42");
  });

  it("detects only active duplicate items", () => {
    expect(findDuplicatePgtcrItem([{ status: "Absent" }, { status: "Submitted" }])).toEqual({ status: "Submitted" });
    expect(findDuplicatePgtcrItem([{ status: "Absent" }])).toBeNull();
  });
});
