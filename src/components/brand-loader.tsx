"use client";

import { useSyncExternalStore } from "react";
import { getBrandColor } from "@/lib/brand-pick";

const SPIDERWEB: Record<string, string> = {
  blue: "/branding/illustrations/spiderweb/spiderweb-blue.svg",
  bone: "/branding/illustrations/spiderweb/spiderweb-bone.svg",
  green: "/branding/illustrations/spiderweb/spiderweb-green.svg",
  mustard: "/branding/illustrations/spiderweb/spiderweb-mustard.svg",
  red: "/branding/illustrations/spiderweb/spiderweb-red.svg",
  rosa: "/branding/illustrations/spiderweb/spiderweb-rosa.svg",
};

const SSR_DEFAULT = "/branding/illustrations/spiderweb/spiderweb-bone.svg";

const noop = () => () => {};
const getServerSnapshot = (): string => SSR_DEFAULT;
const getClientSnapshot = (): string => SPIDERWEB[getBrandColor()];

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
