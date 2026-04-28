"use client";

import { useSyncExternalStore } from "react";

const VARIANTS = [
  "/logo/inklee-0b3d9f.svg",
  "/logo/inklee-105f2d.svg",
  "/logo/inklee-cf2e2c.svg",
  "/logo/inklee-db88b9.svg",
  "/logo/inklee-e9b22b.svg",
  "/logo/inklee-f5f5f6.svg",
];

// Bone/white variant used as the SSR default — visible on the dark background.
const SSR_DEFAULT = "/logo/inklee-f5f5f6.svg";

// Picked once at module load in the browser — stable across re-renders
// and client-side navigation, changes on hard reload.
let _picked: string | null = null;
function getPicked(): string {
  if (!_picked) _picked = VARIANTS[Math.floor(Math.random() * VARIANTS.length)];
  return _picked;
}

// useSyncExternalStore: server snapshot = bone SVG (same <img> structure as
// the client snapshot). React handles the src divergence without a hydration
// warning, and the user sees an SVG immediately — no text→image flash.
const noop = () => () => {};
const getServerSnapshot = (): string => SSR_DEFAULT;
const getClientSnapshot = (): string => getPicked();

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
