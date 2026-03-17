"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CurateLinkButtonProps = {
  href: string;
  children?: React.ReactNode;
  size?: React.ComponentProps<typeof Button>["size"];
  external?: boolean;
  className?: string;
};

export function CurateLinkButton({
  href,
  children = "View on Curate",
  size = "default",
  external = true,
  className,
}: CurateLinkButtonProps) {
  return (
    <Button
      asChild
      variant="outline"
      size={size}
      className={cn("border-cyan-400/35 text-cyan-200 hover:bg-cyan-400/10 hover:text-cyan-100", className)}
    >
      <Link href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}>
        {children}
      </Link>
    </Button>
  );
}
