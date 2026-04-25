"use client";

import { useEffect, useState } from "react";

// Light background → Animation-Emoji-02.svg
// Dark background  → Animation-Emoji-11.svg
const LIGHT_ICON = "/icons/dark/Animation-Emoji-02.svg";
const DARK_ICON = "/icons/light/Animation-Emoji-11.svg";

export interface BrandLoaderProps {
  /** Icon display size in px. Default 96. */
  size?: number;
  /** Optional text shown below the icon. */
  label?: string;
}

export default function BrandLoader({ size = 96, label }: BrandLoaderProps) {
  const [isDark, setIsDark] = useState(true);
  const [reducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const check = () =>
      setIsDark(document.documentElement.classList.contains("dark"));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);

  const src = isDark ? DARK_ICON : LIGHT_ICON;

  return (
    <div
      role="status"
      aria-label={label ?? "Loading"}
      className="flex flex-col items-center gap-3"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        style={{
          display: "block",
          animation: reducedMotion
            ? "none"
            : "inklee-float 2.6s ease-in-out infinite",
          willChange: "transform",
        }}
      />
      {label && (
        <p className="text-xs text-muted-foreground tracking-wide">{label}</p>
      )}
    </div>
  );
}
