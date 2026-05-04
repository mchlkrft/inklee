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
