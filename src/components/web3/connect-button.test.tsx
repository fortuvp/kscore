import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("wagmi", () => ({
  useAccount: () => ({
    address: "0x00000000000000000000000000000000000000aa",
    isConnected: true,
  }),
  useConnect: () => ({ connectors: [], connect: vi.fn(), status: "idle", error: null }),
  useDisconnect: () => ({ disconnect: vi.fn() }),
  useChainId: () => 1,
  useSwitchChain: () => ({ switchChain: vi.fn(), status: "idle", error: null }),
}));

vi.mock("@/components/verification-environment-provider", () => ({
  useVerificationEnvironment: () => ({
    environment: "mainnet",
    deployment: { chainId: 1, chainName: "Ethereum", label: "Mainnet" },
  }),
}));

import { ConnectButton } from "@/components/web3/connect-button";

describe("ConnectButton", () => {
  it("shows only the shortened address in compact connected mode", () => {
    render(<ConnectButton compact />);

    expect(screen.getByRole("button", { name: "0x0000...00aa" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Wallet" })).not.toBeInTheDocument();
  });
});
