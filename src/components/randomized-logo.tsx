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

// Picked once at module load in the browser — stable across re-renders
// and client-side navigation, changes on hard reload.
let _picked: string | null = null;
function getPicked(): string {
  if (!_picked) _picked = VARIANTS[Math.floor(Math.random() * VARIANTS.length)];
  return _picked;
}

// useSyncExternalStore: server snapshot = null (renders fallback),
// client snapshot = the picked variant. React handles the divergence
// cleanly with no hydration warnings.
const noop = () => () => {};
const getServerSnapshot = (): string | null => null;
const getClientSnapshot = (): string | null => getPicked();

export default function RandomizedLogo({ height = 24 }: { height?: number }) {
  const src = useSyncExternalStore(noop, getClientSnapshot, getServerSnapshot);
  const width = Math.round(height * 3.484);

  if (!src) {
    return (
      <span className="text-base font-semibold tracking-tight text-foreground">
        inklee
      </span>
    );
  }

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
