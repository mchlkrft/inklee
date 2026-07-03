import { test, expect } from "@playwright/test";
import { login, artistA } from "./helpers/auth";
import { createTestBooking } from "./helpers/seed";

/**
 * Deposit flow — the SAFE subset.
 *
 * The e2e environment runs without a Stripe key, so requesting a deposit
 * takes the manual path by design (no PaymentIntent; the client pays the
 * artist directly and the artist marks it received). This is exactly what a
 * beta artist without Stripe Connect experiences. Card payments + webhook
 * idempotency are covered at the unit level (see docs/testing.md) and by the
 * launch gate's live G-5 run.
 */
test.describe("manual deposit flow", () => {
  test("request deposit -> awaiting deposit -> mark received -> accepted", async ({
    page,
  }) => {
    const handle = `e2e_dep_${Date.now().toString(36)}`;
    const booking = await createTestBooking(artistA(), { handle });

    await login(page, artistA());
    await page.goto(`/bookings/requests/${booking.id}`);

    // Open the deposit form.
    await page
      .getByRole("button", { name: "Request deposit", exact: true })
      .first()
      .click();
    await page.locator('input[type="number"]').fill("100");
    // The due date is pre-filled with a valid future date, so no date entry
    // is needed to submit.
    await page.getByRole("button", { name: /send deposit request/i }).click();

    // Booking flips to the deposit_pending human label.
    await expect(page.getByText("Awaiting deposit").first()).toBeVisible({
      timeout: 15_000,
    });

    // Manual deposit: the artist marks it received, which approves the booking.
    await page.getByRole("button", { name: /mark deposit received/i }).click();
    const confirm = page.getByRole("button", { name: /yes|confirm/i });
    if (await confirm.count()) {
      await confirm.first().click();
    }
    await expect(page.getByText("Accepted").first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("deposit amount below 1 is rejected", async ({ page }) => {
    const booking = await createTestBooking(artistA(), {
      handle: `e2e_depmin_${Date.now().toString(36)}`,
    });

    await login(page, artistA());
    await page.goto(`/bookings/requests/${booking.id}`);
    await page
      .getByRole("button", { name: "Request deposit", exact: true })
      .first()
      .click();

    const amount = page.locator('input[type="number"]');
    await amount.fill("0.5");
    // Bypass the client min so the SERVER floor (P2-5) is what rejects.
    await amount.evaluate((el) => el.removeAttribute("min"));
    await page.getByRole("button", { name: /send deposit request/i }).click();

    // Still pending — no deposit state was created.
    await expect(page.getByText("Awaiting deposit")).not.toBeVisible();
  });
});
