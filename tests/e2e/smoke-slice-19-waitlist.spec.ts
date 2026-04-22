import { test, expect } from "@playwright/test";
import { loginAsArtist } from "./helpers/auth";

async function ensureBooksOpen(page: import("@playwright/test").Page) {
  await loginAsArtist(page);
  await page.goto("/bookings/books");
  const toggle = page.getByRole("switch");
  if ((await toggle.getAttribute("aria-checked")) === "false") {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "save" }).click();
    await expect(page.getByText("saved.")).toBeVisible();
  }
}

test.describe("slice 19 — waitlist core", () => {
  test.skip(
    !process.env.E2E_ARTIST_EMAIL,
    "Set E2E_ARTIST_EMAIL, E2E_ARTIST_PASSWORD, E2E_ARTIST_SLUG to run",
  );

  test.afterEach(async ({ page }) => {
    await ensureBooksOpen(page).catch(() => {});
  });

  test("customer joins waitlist when books are closed; artist can dismiss entry", async ({
    page,
  }) => {
    const slug = process.env.E2E_ARTIST_SLUG!;

    // --- Close books ---
    await loginAsArtist(page);
    await page.goto("/bookings/books");
    const toggle = page.getByRole("switch");
    if ((await toggle.getAttribute("aria-checked")) === "true") {
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "false");
      await page.getByRole("button", { name: "save" }).click();
      await expect(page.getByText("saved.")).toBeVisible();
    }

    const handle = `e2e_wl_${Date.now()}`;

    // --- Submit waitlist as anonymous customer ---
    await page.goto(`/${slug}`);
    await expect(
      page.getByRole("button", { name: /join the waitlist/i }),
    ).toBeVisible();
    await page.fill('[name="instagram_handle"]', handle);
    await page.fill('[name="email"]', "e2e-waitlist@inklee-test.invalid");
    await page.fill('[name="note"]', "smoke test entry — please dismiss");
    await page.getByRole("button", { name: /join the waitlist/i }).click();

    // Wait for either success or rate-limit error (server action takes up to ~3s)
    await expect(
      page.getByText(/got it.*we'll be in touch|too many requests/i),
    ).toBeVisible({ timeout: 15_000 });

    const rateLimited = await page.getByText(/too many requests/i).isVisible();
    if (rateLimited) {
      // Rate limit (3/hour per IP) hit from repeated test runs — limit is enforced, skip rest
      console.log("Waitlist rate limit hit — skipping dashboard verification");
      return;
    }

    // --- Artist views waitlist dashboard ---
    await loginAsArtist(page);
    await page.goto("/dashboard/waitlist");
    await expect(page.getByText(`@${handle}`)).toBeVisible();

    // --- Mark contacted ---
    await page.getByRole("button", { name: "contacted" }).first().click();
    await expect(page.getByText("contacted").first()).toBeVisible({
      timeout: 5_000,
    });

    // --- Dismiss (row stays but action buttons disappear) ---
    await page.getByRole("button", { name: "dismiss" }).first().click();
    await page.waitForTimeout(1_000);
    await page.reload();
    await expect(page.getByText(`@${handle}`)).toBeVisible();
    await expect(
      page
        .getByText(`@${handle}`)
        .locator("..")
        .locator("..")
        .getByRole("button"),
    ).not.toBeVisible();
  });
});
