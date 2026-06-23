import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Travel map: MapLibre GL is bundled (no CDN script). The CARTO basemap
      // style is on basemaps.cartocdn.com; its tiles/glyphs/sprites are on
      // tiles.basemaps.cartocdn.com (img + connect below); it runs a blob worker.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://plausible.io https://js.stripe.com https://maps.googleapis.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co https://basemaps.cartocdn.com https://tiles.basemaps.cartocdn.com",
      // *.ingest.*.sentry.io covers the region-scoped Sentry ingest hosts so the
      // browser Sentry client (instrumentation-client.ts) can actually upload
      // captured errors; without it the fetch is CSP-blocked and fails silently.
      "connect-src 'self' https://*.supabase.co https://plausible.io https://api.stripe.com https://maps.googleapis.com https://places.googleapis.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io https://basemaps.cartocdn.com https://tiles.basemaps.cartocdn.com",
      "font-src 'self'",
      "frame-src https://js.stripe.com",
      // MapLibre GL runs its renderer in a blob: web worker.
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // @inklee/shared ships as raw TS source (consumed by both web + the Expo app);
  // Next must transpile it rather than expect a prebuilt dist.
  transpilePackages: ["@inklee/shared"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "52mb",
    },
  },
  headers: async () => [
    {
      source: "/(.*)",
      headers: securityHeaders,
    },
  ],
  // /impressum -> /imprint moved to vercel.json `redirects` (edge-level,
  // consistent with the inkl.ee short-domain redirect pattern; see DECISIONS.md).
};

export default nextConfig;
