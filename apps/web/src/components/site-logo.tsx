// Static, theme-aware inklee wordmark.
// Server-safe — no client JS, no hydration flash.
// Uses the html.dark CSS class applied in root layout.

const ASPECT = 3.484; // viewBox 946.5 × 271.7

export default function SiteLogo({ height = 20 }: { height?: number }) {
  const width = Math.round(height * ASPECT);
  const shared = {
    width,
    height,
    style: { width, height } as React.CSSProperties,
    draggable: false as const,
  };
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/branding/logos/inklee-logo-bone.svg"
        alt="Inklee"
        {...shared}
        className="dark:block hidden"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/branding/logos/inklee-logo-charcoal.svg"
        alt="Inklee"
        {...shared}
        className="dark:hidden block"
      />
    </>
  );
}
