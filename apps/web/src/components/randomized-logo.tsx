"use client";

import { useSyncExternalStore } from "react";
import { getBrandColor } from "@/lib/brand-pick";

// Palette reduced 2026-05-25 to bone / mustard / rosa. See `lib/brand-pick.ts`.
const LOGO: Record<string, string> = {
  bone: "/logo/inklee-f5f5f6.svg",
  mustard: "/logo/inklee-e9b22b.svg",
  rosa: "/logo/inklee-db88b9.svg",
};

const SSR_DEFAULT = "/logo/inklee-f5f5f6.svg";

const noop = () => () => {};
const getServerSnapshot = (): string => SSR_DEFAULT;
const getClientSnapshot = (): string => LOGO[getBrandColor()];

export default function RandomizedLogo({ height = 24 }: { height?: number }) {
  const src = useSyncExternalStore(noop, getClientSnapshot, getServerSnapshot);
  const width = Math.round(height * 3.484);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="inklee"
      width={width}
      height={height}
      style={{ width, height, display: "block" }}
      draggable={false}
    />
  );
}
