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
    expect(selectors.every((selector) => selector.textContent?.includes("Testnet") && selector.textContent?.includes("Mainnet"))).toBe(true);
    expect(
      screen.getAllByRole("link", { name: "Explore" }).every((link) =>
        link.getAttribute("href")?.includes("verificationEnvironment=testnet")
      )
    ).toBe(true);
  });

  it("links to the Kleros skills package and its source from both navigation layouts", () => {
    render(<Navbar />);

    expect(
      screen
        .getAllByRole("link", { name: "Skills" })
        .every((link) => link.getAttribute("href") === "https://skills.kleros.io/" && link.getAttribute("target") === "_blank")
    ).toBe(true);
    expect(
      screen
        .getAllByRole("link", { name: "Source code" })
        .every(
          (link) =>
            link.getAttribute("href") === "https://github.com/kleros/kleros-skills" &&
            link.getAttribute("target") === "_blank"
        )
    ).toBe(true);
  });
});
