import type { MetadataRoute } from "next";

/**
 * Canonical marketing/SEO route list — single source of truth for both the
 * XML sitemap (`app/sitemap.ts`) and IndexNow submissions (`lib/indexnow.ts` +
 * `app/api/indexnow/route.ts`).
 *
 * ONLY public, indexable pages belong here. Booking/app surfaces are noindex
 * and disallowed in `robots.ts`; never add them, or IndexNow will push pages
 * we deliberately keep out of the index.
 */

export const MARKETING_ORIGIN = "https://inklee.app";

type ChangeFrequency = NonNullable<
  MetadataRoute.Sitemap[number]["changeFrequency"]
>;

type MarketingRoute = {
  /** Path with leading slash; "" is the marketing home. */
  path: string;
  changeFrequency: ChangeFrequency;
  priority: number;
};

export const MARKETING_ROUTES: MarketingRoute[] = [
  { path: "", changeFrequency: "monthly", priority: 1 },
  {
    path: "/tattoo-booking-software",
    changeFrequency: "monthly",
    priority: 0.95,
  },
  {
    path: "/instagram-booking-link-for-tattoo-artists",
    changeFrequency: "monthly",
    priority: 0.9,
  },
  { path: "/guest-spot-booking", changeFrequency: "monthly", priority: 0.9 },
  { path: "/tattoo-booking-form", changeFrequency: "monthly", priority: 0.9 },
  {
    path: "/tattoo-booking-software-vs-instagram-dms",
    changeFrequency: "monthly",
    priority: 0.85,
  },
  {
    path: "/tattoo-booking-software-vs-google-forms",
    changeFrequency: "monthly",
    priority: 0.85,
  },
  {
    path: "/tattoo-booking-software-vs-calendly",
    changeFrequency: "monthly",
    priority: 0.85,
  },
  {
    path: "/best-booking-app-for-tattoo-artists",
    changeFrequency: "monthly",
    priority: 0.85,
  },
  { path: "/tattoo-deposit-tool", changeFrequency: "monthly", priority: 0.85 },
  {
    path: "/tattoo-artist-waitlist",
    changeFrequency: "monthly",
    priority: 0.85,
  },
  {
    path: "/tattoo-appointment-reminders",
    changeFrequency: "monthly",
    priority: 0.85,
  },
  {
    path: "/tattoo-client-management",
    changeFrequency: "monthly",
    priority: 0.85,
  },
  { path: "/download", changeFrequency: "monthly", priority: 0.85 },
  { path: "/dm-chaos", changeFrequency: "monthly", priority: 0.8 },
  { path: "/about", changeFrequency: "monthly", priority: 0.6 },
  { path: "/help", changeFrequency: "monthly", priority: 0.6 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/imprint", changeFrequency: "yearly", priority: 0.3 },
];

/** Absolute canonical URL for a marketing path. */
export function marketingUrl(path: string): string {
  return `${MARKETING_ORIGIN}${path}`;
}

/** Every canonical marketing URL, in sitemap order. */
export const MARKETING_URLS: string[] = MARKETING_ROUTES.map((route) =>
  marketingUrl(route.path),
);
