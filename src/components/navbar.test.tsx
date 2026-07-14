import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/verified" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock("@/components/web3/connect-button", () => ({ ConnectButton: () => <button>Wallet</button> }));
vi.mock("@/components/verification-environment-provider", () => ({
  useVerificationEnvironment: () => ({
    environment: "testnet",
    setEnvironment: vi.fn(),
    withEnvironment: (href: string) => `${href}?verificationEnvironment=testnet`,
  }),
}));

import { Navbar } from "@/components/navbar";

describe("Navbar", () => {
  it("renders the verification environment selector for desktop and mobile navigation", () => {
    render(<Navbar />);
    const selectors = screen.getAllByLabelText("Verification registry network");
    expect(selectors).toHaveLength(2);
    expect(selectors.every((selector) => selector.textContent === "Testnet")).toBe(true);
    expect(
      screen.getAllByRole("link", { name: "Explore" }).every((link) =>
        link.getAttribute("href")?.includes("verificationEnvironment=testnet")
      )
    ).toBe(true);
  });

  it("keeps Skills local and removes the mistaken Source code navigation item", () => {
    render(<Navbar />);

    expect(
      screen
        .getAllByRole("link", { name: "Skills" })
        .every((link) => link.getAttribute("href") === "/skills" && link.getAttribute("target") === null)
    ).toBe(true);
    expect(screen.queryByRole("link", { name: "Source code" })).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary navigation" })).not.toHaveClass("border");
  });
});
