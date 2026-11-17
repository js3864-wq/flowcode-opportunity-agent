"use client";

import { useState } from "react";

/** A site's favicon, with the domain's first letter as a fallback when it cannot load. */
export function SiteIcon({ domain, size = 20 }: { domain: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const letter = domain.replace(/^www\./, "").charAt(0).toUpperCase();
  return (
    <span
      aria-hidden
      className="relative mt-0.5 inline-flex shrink-0 items-center justify-center overflow-hidden rounded bg-concrete text-[10px] font-semibold text-muted"
      style={{ width: size, height: size }}
    >
      {letter}
      {!failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
          alt=""
          width={size}
          height={size}
          className="absolute inset-0 h-full w-full bg-paper object-contain"
          onError={() => setFailed(true)}
          loading="lazy"
        />
      ) : null}
    </span>
  );
}
