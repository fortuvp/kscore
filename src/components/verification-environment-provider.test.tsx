import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const wagmi = vi.hoisted(() => ({
  connected: true,
  switchChain: vi.fn(),
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({ isConnected: wagmi.connected }),
  useSwitchChain: () => ({ switchChain: wagmi.switchChain }),
}));

import {
  VerificationEnvironmentProvider,
  useVerificationEnvironment,
} from "@/components/verification-environment-provider";

function Harness() {
  const { environment, setEnvironment, withEnvironment } = useVerificationEnvironment();
  return (
    <div>
      <output>{environment}</output>
      <output>{withEnvironment("/verified?network=base")}</output>
      <button onClick={() => setEnvironment("mainnet")}>Mainnet</button>
    </div>
  );
}

describe("VerificationEnvironmentProvider", () => {
  beforeEach(() => {
    wagmi.connected = true;
    wagmi.switchChain.mockReset();
    window.localStorage.clear();
    window.history.replaceState({}, "", "/verified");
  });

  it("restores a persisted environment", async () => {
    window.localStorage.setItem("kscore.verificationEnvironment", "mainnet");
    render(<VerificationEnvironmentProvider><Harness /></VerificationEnvironmentProvider>);
    await waitFor(() => expect(screen.getByText("mainnet")).toBeInTheDocument());
  });

  it("persists selection, updates links, and requests a connected chain switch", async () => {
    render(<VerificationEnvironmentProvider><Harness /></VerificationEnvironmentProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Mainnet" }));

    expect(window.localStorage.getItem("kscore.verificationEnvironment")).toBe("mainnet");
    expect(window.location.search).toContain("verificationEnvironment=mainnet");
    expect(screen.getByText(/network=base&verificationEnvironment=mainnet/)).toBeInTheDocument();
    expect(wagmi.switchChain).toHaveBeenCalledWith({ chainId: 1 });
  });
});
