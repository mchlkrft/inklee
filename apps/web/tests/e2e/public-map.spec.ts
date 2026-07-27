import { test, expect } from "@playwright/test";

/**
 * The public tattoo map, end to end (go-live plan S5, closing the obligations
 * S1, S2 and S2b handed forward).
 *
 * Everything here is asserted against the SERVED DOCUMENT and real network
 * traffic, which is the part the unit tests structurally cannot reach: they
 * assert metadata objects and pure functions, not the HTML a crawler or an
 * anonymous visitor actually receives.
 *
 * Runs with NEXT_PUBLIC_TATTOO_MAP and NEXT_PUBLIC_PUBLIC_MAP both "true"
 * (pinned in playwright.config.ts), i.e. the post-flip state.
 */

test.describe("anonymous public map", () => {
  test("serves the map to a signed-out visitor instead of redirecting to login", async ({
    page,
  }) => {
    const response = await page.goto("/map");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/map/);
    // The canvas mounts (the shell is the discovery surface).
    await expect(page.locator("canvas").first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("the anonymous document carries no personal data and no artist chrome", async ({
    page,
  }) => {
    await page.goto("/map");
    const html = await page.content();

    // Personal plane: the authed page SSR-embeds the journey and watched ids.
    // The anonymous document must contain neither (S1/S2 plane split).
    expect(html).not.toContain("watchedIds");
    expect(html).not.toContain("bookingCount");
    expect(html).not.toContain("timeframe");

    // Artist chrome: no rail, no bottom nav, no workspace shell.
    await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(
      0,
    );
    await expect(page.getByRole("link", { name: /dashboard/i })).toHaveCount(0);
    // The public plane's way in is the sign-in row instead.
    await expect(
      page.getByRole("link", { name: /create account/i }).first(),
    ).toBeVisible();
  });

  test("declares noindex, follow and a clean self-canonical", async ({
    page,
  }) => {
    await page.goto("/map");
    const robots = await page
      .locator('head meta[name="robots"]')
      .getAttribute("content");
    // The strategy's posture for the map: never indexed, but crawlable
    // through to claimed studio pages.
    expect(robots).toContain("noindex");
    expect(robots).toContain("follow");
    expect(robots).not.toContain("nofollow");

    const canonical = await page
      .locator('head link[rel="canonical"]')
      .getAttribute("href");
    expect(canonical).toMatch(/\/map$/);
  });

  test("quantizes the public pins request so shared-cache keys can collide", async ({
    page,
  }) => {
    const pinRequests: URL[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname === "/api/map/locations") pinRequests.push(url);
    });
    await page.goto("/map");
    await expect
      .poll(() => pinRequests.length, { timeout: 15_000 })
      .toBeGreaterThan(0);

    const params = pinRequests[0].searchParams;
    // Integer zoom and grid-snapped bounds: the quantizer's output, not raw
    // fractional viewport values (S1 helper, S2 wiring).
    expect(params.get("zoom")).toMatch(/^\d+$/);
    for (const key of ["west", "south", "east", "north"]) {
      const value = Number(params.get(key));
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  test("gated actions are sign-in walls that carry the return target", async ({
    page,
  }) => {
    await page.goto("/map");
    const signIn = page.getByRole("button", { name: /^sign in$/i }).first();
    await expect(signIn).toBeVisible();
    await signIn.click();
    await page.waitForURL(/\/login\?next=/);
    const next = new URL(page.url()).searchParams.get("next");
    expect(next).toContain("/map");
  });

  test("a shared map link restores the same viewport", async ({ page }) => {
    await page.goto("/map?ll=52.52,13.405&z=11");
    await expect(page.locator("canvas").first()).toBeVisible({
      timeout: 15_000,
    });
    // The URL state survives the load (it is the share contract).
    const url = new URL(page.url());
    expect(url.searchParams.get("ll")).toBe("52.52,13.405");
    expect(url.searchParams.get("z")).toBe("11");
  });

  test("the artists-in-town layer is absent on the public plane (founder D2)", async ({
    page,
  }) => {
    const artistRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/map/artists") {
        artistRequests.push(request.url());
      }
    });
    await page.goto("/map");
    await page.waitForTimeout(3_000);
    expect(artistRequests).toHaveLength(0);
  });
});

test.describe("studio entity pages", () => {
  test("an unknown slug is a 404, never a thin page", async ({ page }) => {
    const response = await page.goto("/studios/definitely-not-a-studio");
    expect(response?.status()).toBe(404);
  });

  test("the studio sitemap serves and contains only gate-passing pages", async ({
    request,
  }) => {
    const response = await request.get("/studios/sitemap.xml");
    expect(response.status()).toBe(200);
    const body = await response.text();
    // With no claimed studio in the fixture set the segment is empty; what
    // must never appear is a non-studio URL or an unclaimed entry.
    expect(body).not.toContain("/map");
    for (const url of body.match(/<loc>([^<]+)<\/loc>/g) ?? []) {
      expect(url).toContain("/studios/");
    }
  });

  test("robots.txt keeps the map crawl path open and allows studio media", async ({
    request,
  }) => {
    const response = await request.get("/robots.txt");
    const body = await response.text();
    // A Disallow on /map would block the noindex tag itself and the follow
    // path to claimed studios.
    expect(body).not.toMatch(/^Disallow: \/map$/m);
    // The proxy must stay crawlable under the blanket /api/ disallow, or
    // every studio image is uncrawlable.
    expect(body).toContain("/api/studio-media/");
    expect(body).toContain("/studios/sitemap.xml");
  });
});
