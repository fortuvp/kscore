import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Web3Provider } from "@/components/web3/web3-provider";
import { Navbar } from "@/components/navbar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppFooter } from "@/components/app-footer";

const appSans = Inter({
  variable: "--font-app-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "DEX8004 — Verifiable Trust for AI Agents",
    template: "%s · DEX8004",
  },
  description: "Discover, collateralize, and evaluate ERC-8004 agents through open, Kleros-backed registries.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${appSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          forcedTheme="dark"
          disableTransitionOnChange
        >
          <Web3Provider>
            <TooltipProvider>
              <a
                href="#main-content"
                className="fixed left-4 top-3 z-[100] -translate-y-20 rounded-lg bg-cyan-100 px-4 py-2 text-sm font-semibold text-slate-950 shadow-xl transition focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-cyan-300"
              >
                Skip to content
              </a>
              <Navbar />
              <main id="main-content" className="min-h-[calc(100vh-3.5rem)] overflow-x-hidden">
                {children}
              </main>
              <AppFooter />
              <Toaster />
            </TooltipProvider>
          </Web3Provider>
        </ThemeProvider>
      </body>
    </html>
  );
}
