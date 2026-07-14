"use client";

import { useMemo, useState } from "react";

import { getMetadataUriCandidates } from "@/lib/agent-metadata";
import { cn } from "@/lib/utils";

const FALLBACK_TONES = [
  "from-cyan-500/25 to-blue-700/20 text-cyan-100",
  "from-emerald-500/25 to-teal-700/20 text-emerald-100",
  "from-violet-500/25 to-indigo-700/20 text-violet-100",
  "from-amber-500/25 to-orange-700/20 text-amber-100",
] as const;

function stableTone(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return FALLBACK_TONES[Math.abs(hash) % FALLBACK_TONES.length];
}

function initials(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "AI";
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join("") || "AI";
}

export function AgentImage({
  src,
  alt,
  className,
  fallbackClassName,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackClassName?: string;
}) {
  const candidates = useMemo(() => getMetadataUriCandidates(src), [src]);
  const [failureState, setFailureState] = useState<{ src: string | null; count: number }>({
    src: src || null,
    count: 0,
  });
  const candidateIndex = failureState.src === (src || null) ? failureState.count : 0;

  const candidate = candidates[candidateIndex];
  if (candidate) {
    return (
      // Metadata images are user-provided and may be hosted on arbitrary IPFS gateways.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={candidate}
        alt={alt}
        className={className}
        onError={() =>
          setFailureState((current) => ({
            src: src || null,
            count: current.src === (src || null) ? current.count + 1 : 1,
          }))
        }
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={alt}
      className={cn(
        "flex items-center justify-center bg-gradient-to-br font-semibold tracking-wide",
        stableTone(alt),
        className,
        fallbackClassName
      )}
    >
      {initials(alt)}
    </div>
  );
}
