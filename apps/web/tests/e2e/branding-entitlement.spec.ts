import { test, expect } from "@playwright/test";
import { admin } from "./helpers/seed";

// P0 (plus-build-plan.md): the end-to-end pass that gates un-parking the
// `branding` capability in production. Asserts the SERVED HTML on the real
// public surfaces, not the gate function: a Plus-entitled artist's public page
// and hub carry no "Powered by inklee" branding, a free artist's do, and the
// entitlement resolves through the real account_overrides read.
//
// The e2e environment leaves DISABLED_CAPABILITIES unset, so these specs run
// against exactly the un-parked behavior production gets after the env change.

const BRANDING_TEXT = /powered by inklee/i;

function seedFromEnv() {
  return {
    a: {
      id: process.env.E2E_ARTIST_ID!,
      slug: process.env.E2E_ARTIST_SLUG!,
    },
    b: {
      id: process.env.E2E_ARTIST_B_ID!,
      slug: process.env.E2E_ARTIST_B_SLUG!,
    },
  };
}

test.describe("branding entitlement on served public pages", () => {
  test.beforeAll(async () => {
    const { a } = seedFromEnv();
    // Comp artist A to Plus exactly the way an admin comp does it.
    const { error } = await admin().from("account_overrides").upsert(
      {
        artist_id: a.id,
        plan_tier: "plus",
        plan_source: "comp",
      },
      { onConflict: "artist_id" },
    );
    if (error) throw new Error(`comp seed failed: ${error.message}`);
  });

  test.afterAll(async () => {
    const { a } = seedFromEnv();
    await admin().from("account_overrides").delete().eq("artist_id", a.id);
  });

  test("a Plus artist's booking page and hub carry no Inklee branding", async ({
    page,
  }) => {
    const { a } = seedFromEnv();
    await page.goto(`/${a.slug}`);
    // The page rendered (footer chrome present) and carries no branding.
    await expect(page.locator("footer").first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText(BRANDING_TEXT);

    await page.goto(`/${a.slug}/hub`);
    await expect(page.locator("body")).not.toContainText(BRANDING_TEXT);
  });

  test("a free artist's booking page and hub keep the branding", async ({
    page,
  }) => {
    const { b } = seedFromEnv();
    await page.goto(`/${b.slug}`);
    await expect(page.locator("body")).toContainText(BRANDING_TEXT);

    await page.goto(`/${b.slug}/hub`);
    await expect(page.locator("body")).toContainText(BRANDING_TEXT);
  });
});
