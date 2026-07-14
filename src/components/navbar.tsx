"use client";

import * as React from "react";
import { Bot, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useVerificationEnvironment } from "@/components/verification-environment-provider";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ConnectButton } from "@/components/web3/connect-button";
import type { VerificationEnvironment } from "@/lib/verification-environment";

const PRIMARY_NAV_LINKS = [
  { href: "/explore", label: "Explore" },
  { href: "/verified", label: "Verified Agents" },
  { href: "/launch", label: "Build a Standard" },
  { href: "/skills", label: "Skills" },
] as const;

const VERIFICATION_AWARE_NAV_PATHS = new Set(["/explore", "/verified"]);

export function Navbar() {
  const pathname = usePathname();
  const { environment, setEnvironment, withEnvironment } = useVerificationEnvironment();

  const resolveHref = (href: string) =>
    VERIFICATION_AWARE_NAV_PATHS.has(href) ? withEnvironment(href) : href;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/[0.08] bg-[#07070d]/90 backdrop-blur-xl">
      <div className="mx-auto h-14 w-full max-w-[1440px] px-3 sm:px-5">
        <div className="relative hidden h-full items-center lg:flex">
          <Brand href={withEnvironment("/")} className="absolute left-0" />

          <nav
            aria-label="Primary navigation"
            className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-white/[0.07] bg-white/[0.025] p-1"
          >
            {PRIMARY_NAV_LINKS.map((link) => (
              <NavLink
                key={link.href}
                href={resolveHref(link.href)}
                active={isActive(pathname, link.href)}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="absolute right-0 flex items-center gap-1.5">
            <VerificationEnvironmentSelector environment={environment} onChange={setEnvironment} />
            <Link
              href={withEnvironment("/my-agents")}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition ${
                isActive(pathname, "/my-agents")
                  ? "bg-white/10 text-white"
                  : "text-white/62 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              <Bot className="h-3.5 w-3.5" aria-hidden="true" />
              My agents
            </Link>
            <ConnectButton compact />
          </div>
        </div>

        <div className="flex h-full items-center justify-between gap-2 lg:hidden">
          <Brand href={withEnvironment("/")} />

          <div className="flex min-w-0 items-center gap-1">
            <VerificationEnvironmentSelector environment={environment} onChange={setEnvironment} compact />
            <Link
              href={withEnvironment("/my-agents")}
              aria-label="My agents"
              title="My agents"
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition ${
                isActive(pathname, "/my-agents")
                  ? "bg-white/10 text-white"
                  : "text-white/62 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              <Bot className="h-4 w-4" aria-hidden="true" />
            </Link>
            <ConnectButton compact />

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Open navigation"
                  className="text-white/70 hover:bg-white/[0.08] hover:text-white"
                >
                  <Menu className="h-4 w-4" aria-hidden="true" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" sideOffset={9} className="w-64 border-white/10 bg-[#0a1018]/98 p-2 shadow-2xl">
                <nav aria-label="Mobile navigation" className="space-y-0.5">
                  {PRIMARY_NAV_LINKS.map((link) => (
                    <MobileNavLink
                      key={link.href}
                      href={resolveHref(link.href)}
                      active={isActive(pathname, link.href)}
                    >
                      {link.label}
                    </MobileNavLink>
                  ))}
                  <div className="my-2 border-t border-white/[0.08]" />
                  <MobileNavLink href="/docs" active={isActive(pathname, "/docs")}>
                    Guide
                  </MobileNavLink>
                  <MobileNavLink href="/faq" active={isActive(pathname, "/faq")}>
                    FAQ
                  </MobileNavLink>
                </nav>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>
    </header>
  );
}

function Brand({ href, className = "" }: { href: string; className?: string }) {
  return (
    <Link href={href} className={`flex shrink-0 items-baseline font-semibold tracking-[-0.025em] ${className}`}>
      <span className="bg-gradient-to-r from-cyan-300 to-cyan-400 bg-clip-text text-[17px] text-transparent">DEX</span>
      <span className="text-[17px] text-white/90">8004</span>
    </Link>
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
        className={`h-8 appearance-none rounded-md border border-cyan-300/20 bg-cyan-300/[0.065] pl-2 pr-5 text-[11px] font-semibold text-cyan-100 outline-none transition hover:border-cyan-300/38 focus-visible:ring-2 focus-visible:ring-cyan-300/35 ${
          compact ? "w-[4.8rem]" : "w-[5.35rem]"
        }`}
      >
        <option value="testnet">Testnet</option>
        <option value="mainnet">Mainnet</option>
      </select>
      <span aria-hidden className="pointer-events-none absolute right-1.5 text-[9px] text-cyan-200/58">
        ▾
      </span>
    </label>
  );
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${
        active ? "bg-white/10 text-white shadow-sm" : "text-white/60 hover:bg-white/[0.055] hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}

function MobileNavLink({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex h-10 items-center rounded-lg px-3 text-sm font-medium transition ${
        active ? "bg-cyan-300/[0.1] text-cyan-100" : "text-white/68 hover:bg-white/[0.06] hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}
