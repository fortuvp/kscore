"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@/components/web3/connect-button";
import { useVerificationEnvironment } from "@/components/verification-environment-provider";
import type { VerificationEnvironment } from "@/lib/verification-environment";

const DESKTOP_NAV_LINKS = [
  { href: "/explore", label: "Explore" },
  { href: "/verified", label: "Verified Agents" },
  { href: "/launch", label: "Build Your Standard" },
] as const;

const MOBILE_NAV_LINKS = [
  { href: "/explore", label: "Explore" },
  { href: "/launch", label: "Build Your Standard" },
  { href: "/verified", label: "Verified Agents" },
  { href: "/moderation", label: "Moderate (Soon)" },
] as const;

const VERIFICATION_AWARE_NAV_PATHS = new Set(["/explore", "/verified"]);

export function Navbar() {
  const pathname = usePathname();
  const { environment, setEnvironment, withEnvironment } = useVerificationEnvironment();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#07070d]/85 backdrop-blur-xl">
      <div className="relative hidden h-14 w-full items-center px-4 lg:flex sm:px-6">
        <Link href={withEnvironment("/")} className="flex items-center font-semibold tracking-tight">
          <span className="bg-gradient-to-r from-cyan-300 to-cyan-400 bg-clip-text text-lg text-transparent">DEX</span>
          <span className="text-lg text-white/90">8004</span>
        </Link>

        <nav className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1">
          {DESKTOP_NAV_LINKS.map((link) => (
            <NavLink
              key={link.href}
              href={VERIFICATION_AWARE_NAV_PATHS.has(link.href) ? withEnvironment(link.href) : link.href}
              active={isActive(pathname, link.href)}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <VerificationEnvironmentSelector environment={environment} onChange={setEnvironment} />
          <Link
            href={withEnvironment("/my-agents")}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              isActive(pathname, "/my-agents") ? "bg-white/12 text-white" : "text-white/70 hover:bg-white/8 hover:text-white"
            }`}
          >
            My Agents
          </Link>
          <ConnectButton />
        </div>
      </div>

      <div className="lg:hidden">
        <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
          <Link href={withEnvironment("/")} className="flex items-center font-semibold tracking-[0.01em]">
            <span className="bg-gradient-to-r from-cyan-300 to-cyan-400 bg-clip-text text-base text-transparent">DEX</span>
            <span className="text-base text-white/90">8004</span>
          </Link>
          <div className="flex items-center gap-1">
            <VerificationEnvironmentSelector environment={environment} onChange={setEnvironment} compact />
            <Link
              href={withEnvironment("/my-agents")}
              className={`rounded-lg px-2.5 py-2 text-sm font-medium transition ${
                isActive(pathname, "/my-agents") ? "bg-white/12 text-white" : "text-white/70 hover:bg-white/8 hover:text-white"
              }`}
            >
              My Agents
            </Link>
            <ConnectButton compact />
          </div>
        </div>
        <div className="bg-gradient-to-b from-white/[0.02] to-transparent">
          <nav className="flex snap-x snap-mandatory items-center gap-2 overflow-x-auto px-3 py-2.5 text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {MOBILE_NAV_LINKS.map((link) => (
              <SwipeNavLink
                key={link.href}
                href={VERIFICATION_AWARE_NAV_PATHS.has(link.href) ? withEnvironment(link.href) : link.href}
                active={isActive(pathname, link.href)}
              >
                {link.label}
              </SwipeNavLink>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}

function VerificationEnvironmentSelector({
  environment,
  onChange,
  compact = false,
}: {
  environment: VerificationEnvironment;
  onChange: (environment: VerificationEnvironment) => void;
  compact?: boolean;
}) {
  return (
    <label className="relative inline-flex shrink-0 items-center">
      <span className="sr-only">Verification registry network</span>
      <select
        aria-label="Verification registry network"
        title="Verification registry network"
        value={environment}
        onChange={(event) => onChange(event.target.value as VerificationEnvironment)}
        className={`h-9 appearance-none rounded-lg border border-cyan-300/25 bg-cyan-300/[0.08] pl-2.5 pr-7 text-xs font-medium text-cyan-100 outline-none transition hover:border-cyan-300/45 focus-visible:ring-2 focus-visible:ring-cyan-300/40 ${
          compact ? "w-[5.75rem]" : "w-[6.75rem]"
        }`}
      >
        <option value="testnet">Testnet</option>
        <option value="mainnet">Mainnet</option>
      </select>
      <span aria-hidden className="pointer-events-none absolute right-2 text-[10px] text-cyan-200/70">
        ▾
      </span>
    </label>
  );
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ href, active, children }: { href: string; active?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
        active ? "bg-white/12 text-white" : "text-white/70 hover:bg-white/8 hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}

function SwipeNavLink({ href, active, children }: { href: string; active?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`snap-start whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
        active
          ? "border-cyan-300/45 bg-cyan-300/18 text-cyan-100 shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset]"
          : "border-white/15 bg-white/[0.04] text-white/75 hover:border-white/35 hover:bg-white/[0.08] hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}
