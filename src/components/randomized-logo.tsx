"use client";

// SVG viewBox: 946.52 × 271.70 → aspect ratio ≈ 3.48 : 1
// Displayed at height 24px → width ≈ 84px
const VARIANTS = [
  "/logo/inklee-0b3d9f.svg", // blue
  "/logo/inklee-105f2d.svg", // green
  "/logo/inklee-cf2e2c.svg", // red
  "/logo/inklee-db88b9.svg", // pink
  "/logo/inklee-e9b22b.svg", // amber
  "/logo/inklee-f5f5f6.svg", // off-white
];

// Picked exactly once when this module loads in the browser.
// Stable across re-renders and client-side navigation.
// Changes on hard reload.
const picked = VARIANTS[Math.floor(Math.random() * VARIANTS.length)];

export default function RandomizedLogo({ height = 24 }: { height?: number }) {
  const width = Math.round(height * 3.484);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={picked}
      alt="inklee"
      width={width}
      height={height}
      style={{ width, height, display: "block" }}
      draggable={false}
    />
  );
}
