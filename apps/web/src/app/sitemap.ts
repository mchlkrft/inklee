import type { MetadataRoute } from "next";
import { MARKETING_ROUTES, marketingUrl } from "@/lib/marketing-routes";

// lastModified is intentionally omitted: the previous implementation stamped
// every route with the generation time, falsely reporting all pages as newly
// modified on every build. There is no reliable per-route modification-date
// source, and inventing dates is worse than none (search engines ignore or
// distrust them). If a real per-route source ever exists, reintroduce it in
// marketing-routes.ts.
export default function sitemap(): MetadataRoute.Sitemap {
  return MARKETING_ROUTES.map((route) => ({
    url: marketingUrl(route.path),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
