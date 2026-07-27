import type { FaqItem } from "./marketing";
import { SITE_NAME, SITE_URL } from "./seo";

type JsonLd = Record<string, unknown>;

export function organizationSchema(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    description:
      "Tattoo booking intake tool for freelance and traveling tattoo artists.",
    logo: `${SITE_URL}/icon.svg`,
  };
}

export function websiteSchema(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
  };
}

export function softwareApplicationSchema(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: SITE_URL,
    description:
      "Tattoo booking intake tool that helps artists collect structured booking requests from Instagram and manage approvals, deposits, waitlists, and guest spots.",
  };
}

export function webPageSchema(input: {
  name: string;
  url: string;
  description: string;
}): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: input.name,
    url: input.url,
    description: input.description,
    isPartOf: {
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL,
    },
  };
}

/**
 * A claimed studio's entity markup (go-live plan S2b). Emitted ONLY for pages
 * that pass the full indexability gate, and only from owner-declared,
 * consented data that is also visible on the page.
 *
 * Deliberately NOT emitted, per the ratified SEO strategy: `aggregateRating`
 * or any review markup (no review system exists), `openingHours` (never
 * confirmed data), true coordinates or a street address for
 * approximate-location studios (the caller passes geo only for studios
 * showing an exact address), and anything inferred rather than declared.
 */
export function localBusinessSchema(input: {
  name: string;
  url: string;
  description: string | null;
  city: string | null;
  country: string | null;
  streetAddress: string | null;
  geo: { lat: number; lng: number } | null;
  images: string[];
  sameAs: string[];
}): JsonLd {
  const address: Record<string, string> = { "@type": "PostalAddress" };
  if (input.streetAddress) address.streetAddress = input.streetAddress;
  if (input.city) address.addressLocality = input.city;
  if (input.country) address.addressCountry = input.country;

  const schema: JsonLd = {
    "@context": "https://schema.org",
    "@type": "TattooParlor",
    name: input.name,
    url: input.url,
  };
  if (input.description) schema.description = input.description;
  if (Object.keys(address).length > 1) schema.address = address;
  if (input.geo) {
    schema.geo = {
      "@type": "GeoCoordinates",
      latitude: input.geo.lat,
      longitude: input.geo.lng,
    };
  }
  if (input.images.length > 0) schema.image = input.images;
  if (input.sameAs.length > 0) schema.sameAs = input.sameAs;
  return schema;
}

export function breadcrumbListSchema(
  items: Array<{ name: string; url: string }>,
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/** @deprecated use FaqItem from @/lib/marketing */
export type FaqEntry = FaqItem;

export function faqPageSchema(entries: FaqItem[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((e) => ({
      "@type": "Question",
      name: e.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: e.answer,
      },
    })),
  };
}
