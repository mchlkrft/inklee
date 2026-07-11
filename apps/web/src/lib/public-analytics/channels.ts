/**
 * Deterministic acquisition-channel classification. One shared module, pure,
 * unit-tested; nothing else may re-derive channels.
 *
 * Precedence: explicit UTM parameters, then known search engines, then known
 * social networks, then any other external referrer, then direct.
 */

export const CHANNELS = [
  "direct",
  "organic_search",
  "paid_search",
  "organic_social",
  "paid_social",
  "email",
  "referral",
  "other",
] as const;

export type Channel = (typeof CHANNELS)[number];

const SEARCH_ENGINE_DOMAINS = [
  "google.",
  "bing.com",
  "duckduckgo.com",
  "search.yahoo.",
  "yandex.",
  "ecosia.org",
  "baidu.com",
  "search.brave.com",
  "startpage.com",
  "qwant.com",
];

const SOCIAL_DOMAINS = [
  "instagram.com",
  "facebook.com",
  "fb.com",
  "l.instagram.com",
  "lm.facebook.com",
  "m.facebook.com",
  "t.co",
  "twitter.com",
  "x.com",
  "reddit.com",
  "out.reddit.com",
  "old.reddit.com",
  "tiktok.com",
  "pinterest.",
  "linkedin.com",
  "lnkd.in",
  "youtube.com",
  "youtu.be",
  "threads.net",
  "bsky.app",
  "mastodon.",
];

const PAID_MEDIUMS = [
  "cpc",
  "ppc",
  "paid",
  "cpm",
  "cpv",
  "display",
  "paid_social",
  "paidsocial",
];
const EMAIL_MEDIUMS = ["email", "newsletter", "e-mail"];
const SOCIAL_MEDIUMS = ["social", "organic_social", "social-media", "sm"];

function domainMatches(domain: string, patterns: string[]): boolean {
  return patterns.some((pattern) =>
    pattern.endsWith(".")
      ? domain.includes(pattern)
      : domain === pattern ||
        domain.endsWith(`.${pattern}`) ||
        domain.includes(`.${pattern}`) ||
        domain === pattern,
  );
}

export function isSearchEngine(referrerDomain: string): boolean {
  return domainMatches(referrerDomain.toLowerCase(), SEARCH_ENGINE_DOMAINS);
}

export function isSocialNetwork(referrerDomain: string): boolean {
  return domainMatches(referrerDomain.toLowerCase(), SOCIAL_DOMAINS);
}

export function classifyChannel(input: {
  utmSource?: string | null;
  utmMedium?: string | null;
  referrerDomain?: string | null;
}): Channel {
  const source = input.utmSource?.trim().toLowerCase() || null;
  const medium = input.utmMedium?.trim().toLowerCase() || null;
  const referrer = input.referrerDomain?.trim().toLowerCase() || null;

  // 1. Explicit UTM parameters win.
  if (source || medium) {
    if (medium && EMAIL_MEDIUMS.includes(medium)) return "email";
    if (medium && PAID_MEDIUMS.includes(medium)) {
      if (source && isSearchEngine(source)) return "paid_search";
      if (source && isSocialNetwork(source)) return "paid_social";
      if (source && ["google", "bing"].includes(source)) return "paid_search";
      if (
        source &&
        [
          "instagram",
          "facebook",
          "meta",
          "tiktok",
          "reddit",
          "twitter",
          "x",
          "linkedin",
          "pinterest",
        ].includes(source)
      ) {
        return "paid_social";
      }
      return "other";
    }
    if (medium && SOCIAL_MEDIUMS.includes(medium)) return "organic_social";
    if (source) {
      if (
        isSearchEngine(source) ||
        ["google", "bing", "duckduckgo"].includes(source)
      )
        return "organic_search";
      if (
        isSocialNetwork(source) ||
        [
          "instagram",
          "facebook",
          "tiktok",
          "reddit",
          "twitter",
          "x",
          "linkedin",
          "pinterest",
          "youtube",
          "threads",
        ].includes(source)
      ) {
        return "organic_social";
      }
      if (EMAIL_MEDIUMS.includes(source)) return "email";
      return "other";
    }
    return "other";
  }

  // 2-4. Referrer-based.
  if (referrer) {
    if (isSearchEngine(referrer)) return "organic_search";
    if (isSocialNetwork(referrer)) return "organic_social";
    return "referral";
  }

  // 5. No signal at all.
  return "direct";
}
