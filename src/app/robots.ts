import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
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
    sitemap: "https://inklee.app/sitemap.xml",
  };
}
