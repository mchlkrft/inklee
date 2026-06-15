import { test, expect } from "@playwright/test";
import { loginAsArtist } from "./helpers/auth";
import { submitTestBooking } from "./helpers/booking";

test.describe("submit → artist reject", () => {
  test.skip(
    !process.env.E2E_ARTIST_EMAIL,
    "Set E2E_ARTIST_EMAIL, E2E_ARTIST_PASSWORD, E2E_ARTIST_SLUG to run",
  );

  test("customer submits booking and artist rejects it", async ({ page }) => {
    // 1. Submit booking as anonymous customer
    const bookingId = await submitTestBooking(page);
    await expect(page.getByText(/got it —/i).first()).toBeVisible();

    // 2. Artist logs in
    await loginAsArtist(page);

    // 3. Navigate to booking detail
    await page.goto(`/bookings/requests/${bookingId}`);

    // 4. Verify pending (exact match avoids matching "mark deposit pending" button)
    await expect(page.getByText("pending", { exact: true })).toBeVisible();

    // 5. Click reject (first press opens confirm dialog)
    await page.getByRole("button", { name: "reject" }).click();

    // 6. Confirm rejection
    await page.getByRole("button", { name: "yes, reject" }).click();

    // 7. Status badge should update to rejected
    await expect(page.getByText("rejected")).toBeVisible({ timeout: 10_000 });
  });
});
