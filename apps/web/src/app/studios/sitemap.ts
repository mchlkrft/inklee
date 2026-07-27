import type { MetadataRoute } from "next";
import { listIndexableStudioSlugs } from "@/lib/server/studio-page";
import { SITE_URL } from "@/lib/seo";

// The studio sitemap segment (/studios/sitemap.xml), go-live plan S2b.
//
// Deliberately SEPARATE from the root sitemap and from MARKETING_ROUTES: that
// list auto-feeds IndexNow, and studio pages must never be pushed to Bing and
// Yandex on publish. This segment is generated from the indexability gate
// alone, so a page that would render `noindex` can never appear here.
//
// Empty while the public map is dark (the gate's `publicSurfaceReady`
// condition), which also keeps this route harmless before the flip.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const slugs = await listIndexableStudioSlugs();
  return slugs.map((slug) => ({
    url: `${SITE_URL}/studios/${slug}`,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));
}
