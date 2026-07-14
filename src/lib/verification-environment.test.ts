import { describe, expect, it } from "vitest";

import {
  DEFAULT_VERIFICATION_ENVIRONMENT,
  getVerificationDeployment,
  parseVerificationEnvironment,
  withVerificationEnvironment,
} from "@/lib/verification-environment";

describe("verification environments", () => {
  it("defaults invalid and missing values to testnet", () => {
    expect(parseVerificationEnvironment(undefined)).toBe(DEFAULT_VERIFICATION_ENVIRONMENT);
    expect(parseVerificationEnvironment("production")).toBe("testnet");
    expect(parseVerificationEnvironment(" MAINNET ")).toBe("mainnet");
  });

  it("keeps the verification environment separate from other query parameters", () => {
    expect(withVerificationEnvironment("/agents/42?network=base#history", "mainnet")).toBe(
      "/agents/42?network=base&verificationEnvironment=mainnet#history"
    );
  });

  it("maps testnet and mainnet to isolated chains and registries", () => {
    const testnet = getVerificationDeployment("testnet");
    const mainnet = getVerificationDeployment("mainnet");
    expect(testnet.chainId).toBe(11155111);
    expect(mainnet.chainId).toBe(1);
    expect(testnet.registryAddress).not.toBe(mainnet.registryAddress);
    expect(mainnet.registryAddress.toLowerCase()).toBe("0x118155741eea23f56b3bd59b0c1342d5daaa6d07");
    expect(testnet.flavor).toBe("pgtcr");
    expect(mainnet.flavor).toBe("pgtcr");
  });
});
