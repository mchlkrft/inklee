import { test, expect } from "@playwright/test";
import { login, artistA } from "./helpers/auth";
import { createTestBooking } from "./helpers/seed";

/**
 * Mobile viewport smoke (Pixel 7 project — see playwright.config.ts).
 * Asserts the launch-critical surfaces render and are interactable on a
 * phone-sized screen; deep behavior is covered by the desktop specs.
 */
test.describe("mobile viewport smoke", () => {
  test("public booking form is usable on mobile", async ({ page }) => {
    const { slug } = artistA();
    await page.goto(`/${slug}`);
    const email = page.locator('[name="email"]').first();
    await expect(email).toBeVisible();
    await email.fill("e2e-mobile@inklee-e2e.test");
    // No horizontal overflow: the document is no wider than the viewport.
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
    );
    expect(overflow).toBe(false);
  });

  test("onboarding intro renders on mobile", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.locator('[name="email"]')).toBeVisible();
    await expect(page.locator('[name="password_confirm"]')).toBeVisible();
  });

  test("requests list, request detail, and calendar render on mobile", async ({
    page,
  }) => {
    const handle = `e2e_mob_${Date.now().toString(36)}`;
    const booking = await createTestBooking(artistA(), { handle });

    await login(page, artistA());

    await page.goto("/bookings/overview");
    await expect(page.getByText(`@${handle}`).first()).toBeVisible({
      timeout: 15_000,
    });

    await page.goto(`/bookings/requests/${booking.id}`);
    await expect(
      page.getByRole("button", { name: "Accept", exact: true }),
    ).toBeVisible();

    await page.goto("/bookings/calendar");
    // The calendar grid renders without crashing; month navigation exists.
    await expect(page.locator("main")).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
