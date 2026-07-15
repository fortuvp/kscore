/* eslint-disable @next/next/no-img-element */

import * as React from "react";

export function KScoreMark({ alt = "", ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  return <img src="/brand/kscore-mark.svg" alt={alt} {...props} />;
}

export function KScoreWordmark({
  alt = "",
  bold = false,
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement> & { bold?: boolean }) {
  return <img src={bold ? "/brand/kscore-wordmark-bold.svg" : "/brand/kscore-wordmark.svg"} alt={alt} {...props} />;
}

export function KScoreLockup({ alt = "KSCORE", ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  return <img src="/brand/kscore-lockup.svg" alt={alt} {...props} />;
}

export function KScoreLogo({
  className = "",
  markClassName = "h-7 w-7",
  wordmarkClassName = "h-3.5 w-auto",
}: {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <KScoreMark className={markClassName} />
      <KScoreWordmark className={wordmarkClassName} />
      <span className="sr-only">KSCORE</span>
    </span>
  );
}
