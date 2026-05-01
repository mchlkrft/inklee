"use client";

import { useSyncExternalStore } from "react";
import { getBrandColor } from "@/lib/brand-pick";

const LOGO: Record<string, string> = {
  blue: "/logo/inklee-0b3d9f.svg",
  bone: "/logo/inklee-f5f5f6.svg",
  green: "/logo/inklee-105f2d.svg",
  mustard: "/logo/inklee-e9b22b.svg",
  red: "/logo/inklee-cf2e2c.svg",
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
