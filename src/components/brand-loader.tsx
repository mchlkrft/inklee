"use client";

import { useSyncExternalStore } from "react";

const VARIANTS = [
  "/branding/illustrations/spiderweb/spiderweb-blue.svg",
  "/branding/illustrations/spiderweb/spiderweb-bone.svg",
  "/branding/illustrations/spiderweb/spiderweb-green.svg",
  "/branding/illustrations/spiderweb/spiderweb-mustard.svg",
  "/branding/illustrations/spiderweb/spiderweb-red.svg",
  "/branding/illustrations/spiderweb/spiderweb-rosa.svg",
];

// Bone is visible on the dark background — safe SSR default, no flash.
const SSR_DEFAULT = "/branding/illustrations/spiderweb/spiderweb-bone.svg";

// Picked once at module load — stable across re-renders and soft navigation,
// changes on hard reload (same behaviour as RandomizedLogo).
let _picked: string | null = null;
function getPicked(): string {
  if (!_picked) _picked = VARIANTS[Math.floor(Math.random() * VARIANTS.length)];
  return _picked;
}

const noop = () => () => {};
const getServerSnapshot = (): string => SSR_DEFAULT;
const getClientSnapshot = (): string => getPicked();

export interface BrandLoaderProps {
  /** Icon display size in px. Default 96. */
  size?: number;
  /** Optional text shown below the icon. */
  label?: string;
}

export default function BrandLoader({ size = 96, label }: BrandLoaderProps) {
  const src = useSyncExternalStore(noop, getClientSnapshot, getServerSnapshot);

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
          animation: "inklee-float 2.6s ease-in-out infinite",
          willChange: "transform",
        }}
        className="motion-reduce:![animation:none]"
      />
      {label && (
        <p className="text-xs text-muted-foreground tracking-wide">{label}</p>
      )}
    </div>
  );
}
