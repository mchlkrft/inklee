import type { MetadataRoute } from "next";
import { publicMapEnabled } from "@/lib/map-features";

export default function robots(): MetadataRoute.Robots {
  // The studio sitemap segment is announced only once the public surface is
  // live; while the map is dark the route exists but resolves to an empty
  // document, and pointing crawlers at it would be noise (go-live plan S2b).
  const sitemaps = [
    "https://inklee.app/sitemap.xml",
    ...(publicMapEnabled() ? ["https://inklee.app/studios/sitemap.xml"] : []),
  ];
  return {
    rules: {
      userAgent: "*",
      // Longest-match wins, so this narrow allow survives the /api/ disallow
      // below. Claimed studio pages serve their images through the media
      // proxy; without this, the LocalBusiness `image` property and every
      // og:image would be uncrawlable (go-live plan S2b).
      allow: ["/", "/api/studio-media/"],
      disallow: [
        "/api/",
        "/admin",
        "/admin/",
        "/dashboard",
        "/dashboard/",
        "/bookings",
        "/bookings/",
        "/flash",
        "/flash/",
        "/travel",
        "/travel/",
        "/settings",
        "/settings/",
        "/analytics",
        "/notifications",
        "/onboarding",
        "/onboarding/",
        "/auth/",
        "/dev/",
        "/request/",
        "/login",
        "/signup",
        "/forgot-password",
        "/reset-password",
      ],
    },
    sitemap: sitemaps,
  };
}
