import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";
import {
  createTestArtist,
  deleteTestArtist,
  type SeededArtist,
} from "./helpers/seed";

/**
 * Books-closed -> waitlist flow. Seeds its OWN artist so toggling books does
 * not pollute the shared artist A that the other specs read (running specs in
 * parallel, a books-open assertion elsewhere must not race this one).
 */
test.describe("books open/closed and waitlist", () => {
  let artist: SeededArtist;

  test.beforeAll(async () => {
    const runId = `${process.env.E2E_RUN_ID ?? "x"}bw`;
    artist = await createTestArtist(runId, "books");
  });

  test.afterAll(async () => {
    if (artist) await deleteTestArtist(artist.id);
  });

  test("closing books hides the form and shows the waitlist; a client can join", async ({
    page,
  }) => {
    // Books open by default -> the booking form is live.
    await page.goto(`/${artist.slug}`);
    await expect(page.locator('[name="email"]').first()).toBeVisible();

    // Close books in settings.
    await login(page, artist);
    await page.goto("/bookings/settings");
    const toggle = page.getByRole("switch").first();
    if ((await toggle.getAttribute("aria-checked")) === "true") {
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "false");
    }
    await page
      .getByRole("button", { name: /^save$/i })
      .first()
      .click();
    await expect(page.getByText(/saved/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // Public page now shows the closed state + a waitlist form.
    await page.context().clearCookies();
    await page.goto(`/${artist.slug}`);
    await expect(
      page.getByText(/books are currently closed|currently closed/i).first(),
    ).toBeVisible();

    // A client joins the waitlist.
    const handle = `e2e_wl_${Date.now().toString(36)}`;
    await page.fill('[name="instagram_handle"]', handle);
    await page.fill('[name="email"]', "e2e-waitlist@inklee-e2e.test");
    await page.getByRole("button", { name: /join the waitlist/i }).click();
    await expect(
      page.getByText(/we'll email you|got it|we.ll be in touch/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    // The entry reaches the artist's waitlist.
    await login(page, artist);
    await page.goto("/bookings/waitlist");
    await expect(page.getByText(`@${handle}`).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
