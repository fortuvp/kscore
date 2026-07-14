"use client";

import Link from "next/link";

import { useVerificationEnvironment } from "@/components/verification-environment-provider";

const GROUPS = [
  {
    title: "Explore",
    links: [
      { href: "/", label: "Home", verificationAware: true },
      { href: "/explore", label: "Explore", verificationAware: true },
      { href: "/leaderboard", label: "Leaderboard" },
    ],
  },
  {
    title: "Verify",
    links: [
      { href: "/trust", label: "Trust", verificationAware: true },
      { href: "/verified", label: "Verified Agents", verificationAware: true },
      { href: "/moderation", label: "Moderation - Coming soon" },
      { href: "/launch", label: "Build Your Standard" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/my-agents", label: "My Agents", verificationAware: true },
      { href: "/networks", label: "Networks" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/docs", label: "Docs" },
      { href: "/faq", label: "FAQ" },
    ],
  },
] as const;

export function AppFooter() {
  const { withEnvironment } = useVerificationEnvironment();

  return (
    <footer className="border-t border-white/[0.08] bg-[#070b12]/80 px-4 py-5 text-sm text-white/70 sm:px-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <span className="font-medium tracking-wide">
          Secured by <span className="font-semibold text-cyan-300">Kleros</span>
        </span>
        <div className="grid gap-6 text-sm sm:grid-cols-2 md:grid-cols-4">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <div className="mb-2 text-xs uppercase tracking-wider text-white/45">{group.title}</div>
              <div className="space-y-1.5">
                {group.links.map((link) => (
                  <Link
                    key={`${group.title}-${link.href}`}
                    href={"verificationAware" in link && link.verificationAware ? withEnvironment(link.href) : link.href}
                    className="block text-white/70 transition hover:text-cyan-300 hover:underline"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
