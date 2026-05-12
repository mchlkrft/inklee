import { test, expect } from "@playwright/test";
import { loginAsArtist } from "./helpers/auth";
import { createTestBookingDirect } from "./helpers/booking-direct";

function nextWeek(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split("T")[0];
}

test.describe("slice 17 — stripe deposit payment", () => {
  test.skip(
    !process.env.E2E_ARTIST_EMAIL,
    "Set E2E_ARTIST_EMAIL, E2E_ARTIST_PASSWORD, E2E_ARTIST_SLUG to run",
  );

  test("artist can request deposit; deposit details render on dashboard", async ({
    page,
    request,
  }) => {
    // Create booking directly via Supabase API to avoid rate-limited public form
    const bookingId = await createTestBookingDirect(request, "e2e_stripe_test");

    await loginAsArtist(page);
    await page.goto(`/bookings/requests/${bookingId}`);
    await expect(page.getByText("pending", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "request deposit" }).click();
    await page.fill('input[type="number"][placeholder="200"]', "150");
    await page.fill('input[type="date"]', nextWeek());
    await page.getByRole("button", { name: "send deposit request" }).click();

    await expect(page.getByText("deposit pending")).toBeVisible({
      timeout: 10_000,
    });

    // Page re-renders server component after action — allow extra time
    await expect(page.getByText("€150.00")).toBeVisible({ timeout: 15_000 });
  });

  // NOTE: Full end-to-end Stripe payment (customer follows magic link → pays)
  // requires intercepting the confirmation email to get the token.
  // Verified manually using test card 4242 4242 4242 4242.
});
