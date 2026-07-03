import { test, expect } from "@playwright/test";
import { login, artistA } from "./helpers/auth";
import { submitTestBooking } from "./helpers/public-form";

test.describe("public booking page and client request", () => {
  test("public page loads without auth and hides private data", async ({
    page,
  }) => {
    const { slug, email } = artistA();
    await page.goto(`/${slug}`);
    await expect(page.locator('[name="email"]').first()).toBeVisible();
    // The artist's own login email must never render on the public page.
    await expect(page.getByText(email)).not.toBeVisible();
  });

  test("required fields are enforced server-side", async ({ page }) => {
    const { slug } = artistA();
    await page.goto(`/${slug}`);
    // Strip client-side required gates so the SERVER validation is exercised.
    await page.evaluate(() => {
      document
        .querySelectorAll("input[required], textarea[required]")
        .forEach((el) => el.removeAttribute("required"));
    });
    await page.locator('button[type="submit"]').last().click();
    // Stays on the page with a field error instead of a success redirect.
    await expect(page).toHaveURL(new RegExp(`/${slug}`));
    await expect(page.getByText(/required|valid email/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("client submits a complete request; artist receives it", async ({
    page,
  }) => {
    const { slug } = artistA();

    // submitTestBooking asserts the /request/submitted success state and
    // returns the new booking id from the redirect.
    const bookingId = await submitTestBooking(
      page,
      slug,
      `e2e_pub_${Date.now().toString(36)}`,
    );
    await expect(
      page.getByRole("heading", { name: /request sent/i }),
    ).toBeVisible();

    // The artist can open the request (proves it landed under the right
    // artist with the submitted details). The instagram_handle field is
    // form-settings-gated, so verify on the always-present description.
    await login(page, artistA());
    const detail = await page.goto(`/bookings/requests/${bookingId}`);
    expect(detail?.status()).toBe(200);
    await expect(page.getByText(/left forearm/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("an unknown slug 404s instead of leaking existence info", async ({
    page,
  }) => {
    const response = await page.goto(`/e2e-definitely-not-a-real-artist`);
    expect(response?.status()).toBe(404);
  });
});
