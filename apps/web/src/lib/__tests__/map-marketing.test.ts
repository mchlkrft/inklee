import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { MARKETING_ROUTES, MARKETING_URLS } from "@/lib/marketing-routes";
import robots from "@/app/robots";

/**
 * Guards the public-map marketing integration.
 *
 * Two things are protected here, both of which had NO test coverage before and
 * both of which are one careless edit away from a production incident:
 *
 * 1. Indexation. `MARKETING_ROUTES` is the only path into both the XML sitemap
 *    and IndexNow, so a stray row publishes a page we deliberately keep out of
 *    the index AND pushes it to Bing/Yandex. The canonical strategy keeps `/map`
 *    `noindex, follow` and out of the sitemap, keeps unclaimed entries out, and
 *    forbids indexable filter combinations and city/style pages.
 * 2. Broken public links. `/map` is authenticated-only today, so every
 *    public-facing map link must stay dark until `NEXT_PUBLIC_PUBLIC_MAP` flips.
 *
 * Reasoning: docs/marketing/public-map-marketing-integration-audit.md
 * Strategy: docs/seo/inklee-seo-strategy.md ("Public tattoo map and local studio
 * discovery").
 */

const ORIGINAL_TATTOO_MAP = process.env.NEXT_PUBLIC_TATTOO_MAP;
const ORIGINAL_PUBLIC_MAP = process.env.NEXT_PUBLIC_PUBLIC_MAP;

function restoreEnv(): void {
  if (ORIGINAL_TATTOO_MAP === undefined) {
    delete process.env.NEXT_PUBLIC_TATTOO_MAP;
  } else {
    process.env.NEXT_PUBLIC_TATTOO_MAP = ORIGINAL_TATTOO_MAP;
  }
  if (ORIGINAL_PUBLIC_MAP === undefined) {
    delete process.env.NEXT_PUBLIC_PUBLIC_MAP;
  } else {
    process.env.NEXT_PUBLIC_PUBLIC_MAP = ORIGINAL_PUBLIC_MAP;
  }
}

describe("sitemap / IndexNow safeguards for the public map", () => {
  const paths = MARKETING_ROUTES.map((route) => route.path);

  it("does not list /map (it is a noindex product utility)", () => {
    expect(paths).not.toContain("/map");
    expect(MARKETING_URLS).not.toContain("https://inklee.app/map");
  });

  it("lists no /map subpath, so map states never enter the sitemap", () => {
    const mapish = paths.filter(
      (path) => path === "/map" || path.startsWith("/map/"),
    );
    expect(mapish).toEqual([]);
  });

  it("lists no studio entity or city directory route", () => {
    // /studios/{slug} may only be indexed after the full claimed-profile
    // quality gate; /tattoo-studios/{country}/{city} needs SERP validation plus
    // an explicit allowlist. Neither exists yet.
    const directoryish = paths.filter(
      (path) =>
        path.startsWith("/studios") ||
        path.startsWith("/studio/") ||
        path === "/studio" ||
        path.startsWith("/tattoo-studios"),
    );
    expect(directoryish).toEqual([]);
  });

  it("lists no URL carrying query or fragment state", () => {
    // Filter combinations (style, city, category, guest spot status, bounds,
    // selection) stay interaction state and must never become documents.
    const stateful = paths.filter(
      (path) => path.includes("?") || path.includes("#") || path.includes("&"),
    );
    expect(stateful).toEqual([]);
  });

  it("keeps /pricing out until the indexation proposal is ratified", () => {
    expect(paths).not.toContain("/pricing");
  });
});

describe("robots.txt safeguards for the public map", () => {
  it("does not disallow /map", () => {
    // A Disallow would stop crawlers reading the noindex tag AND stop them
    // following links to eligible claimed studio profiles, which the strategy
    // explicitly requires. Its absence is intentional, not an oversight.
    const rules = robots().rules;
    const rule = Array.isArray(rules) ? rules[0] : rules;
    const disallow = rule?.disallow ?? [];
    const list = Array.isArray(disallow) ? disallow : [disallow];
    expect(list).not.toContain("/map");
    expect(list).not.toContain("/map/");
  });

  it("still disallows the authenticated app surfaces and /signup", () => {
    const rules = robots().rules;
    const rule = Array.isArray(rules) ? rules[0] : rules;
    const disallow = rule?.disallow ?? [];
    const list = Array.isArray(disallow) ? disallow : [disallow];
    for (const prefix of [
      "/api/",
      "/admin",
      "/dashboard",
      "/signup",
      "/login",
    ]) {
      expect(list).toContain(prefix);
    }
  });
});

describe("publicMapEnabled", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    restoreEnv();
    vi.resetModules();
  });

  it("is off when neither flag is set", async () => {
    delete process.env.NEXT_PUBLIC_TATTOO_MAP;
    delete process.env.NEXT_PUBLIC_PUBLIC_MAP;
    const { publicMapEnabled } = await import("@/lib/map-features");
    expect(publicMapEnabled()).toBe(false);
  });

  it("is off when only the platform gate is on", async () => {
    process.env.NEXT_PUBLIC_TATTOO_MAP = "true";
    delete process.env.NEXT_PUBLIC_PUBLIC_MAP;
    const { publicMapEnabled } = await import("@/lib/map-features");
    expect(publicMapEnabled()).toBe(false);
  });

  it("is off when only the public gate is on (AND-ed with the platform gate)", async () => {
    delete process.env.NEXT_PUBLIC_TATTOO_MAP;
    process.env.NEXT_PUBLIC_PUBLIC_MAP = "true";
    const { publicMapEnabled } = await import("@/lib/map-features");
    expect(publicMapEnabled()).toBe(false);
  });

  it("is off for truthy-but-not-exactly-true values", async () => {
    process.env.NEXT_PUBLIC_TATTOO_MAP = "true";
    process.env.NEXT_PUBLIC_PUBLIC_MAP = "1";
    const { publicMapEnabled } = await import("@/lib/map-features");
    expect(publicMapEnabled()).toBe(false);
  });

  it('is on only when both flags are exactly "true"', async () => {
    process.env.NEXT_PUBLIC_TATTOO_MAP = "true";
    process.env.NEXT_PUBLIC_PUBLIC_MAP = "true";
    const { publicMapEnabled } = await import("@/lib/map-features");
    expect(publicMapEnabled()).toBe(true);
  });
});

describe("mapMarketingCta", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    restoreEnv();
    vi.resetModules();
  });

  it("never emits a /map link while the public map is off", async () => {
    process.env.NEXT_PUBLIC_TATTOO_MAP = "true";
    delete process.env.NEXT_PUBLIC_PUBLIC_MAP;
    const { mapMarketingCta } = await import("@/lib/map-marketing");
    const cta = mapMarketingCta(
      "home-map-signup",
      "home-map-explore",
      "Get started free",
    );
    expect(cta.mode).toBe("signup");
    expect(cta.primary.href).toBe("/signup");
    expect(cta.primary.cta).toBe("home-map-signup");
    expect(cta.secondary).toBeNull();
  });

  it("leads with the map and keeps account creation on the surface once flipped", async () => {
    process.env.NEXT_PUBLIC_TATTOO_MAP = "true";
    process.env.NEXT_PUBLIC_PUBLIC_MAP = "true";
    const { mapMarketingCta } = await import("@/lib/map-marketing");
    const cta = mapMarketingCta(
      "gs-map-signup",
      "gs-map-explore",
      "Create your booking link",
    );
    expect(cta.mode).toBe("explore");
    expect(cta.primary.href).toBe("/map");
    expect(cta.primary.cta).toBe("gs-map-explore");
    expect(cta.secondary?.href).toBe("/signup");
    expect(cta.secondary?.cta).toBe("gs-map-signup");
  });

  it("uses no em-dash in any generated label", async () => {
    process.env.NEXT_PUBLIC_TATTOO_MAP = "true";
    process.env.NEXT_PUBLIC_PUBLIC_MAP = "true";
    const { mapMarketingCta } = await import("@/lib/map-marketing");
    const cta = mapMarketingCta("a", "b", "Get started free");
    for (const label of [cta.primary.label, cta.secondary?.label ?? ""]) {
      expect(label).not.toContain("—");
    }
  });
});

describe("footer link set", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    restoreEnv();
    vi.resetModules();
  });

  it("renders no /map entry while the public map is off", async () => {
    process.env.NEXT_PUBLIC_TATTOO_MAP = "true";
    delete process.env.NEXT_PUBLIC_PUBLIC_MAP;
    const { getRenderableFooterGroups } = await import("@/lib/footer-links");
    const hrefs = getRenderableFooterGroups().flatMap((group) =>
      group.items.map((item) => item.href),
    );
    expect(hrefs).not.toContain("/map");
  });

  it("renders the Tattoo map entry in Product once flipped", async () => {
    process.env.NEXT_PUBLIC_TATTOO_MAP = "true";
    process.env.NEXT_PUBLIC_PUBLIC_MAP = "true";
    const { getRenderableFooterGroups } = await import("@/lib/footer-links");
    const product = getRenderableFooterGroups().find((g) => g.id === "product");
    const entry = product?.items.find((item) => item.href === "/map");
    expect(entry?.label).toBe("Tattoo map");
  });
});
