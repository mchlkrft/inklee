import { test, expect } from "@playwright/test";
import { loginAsArtist } from "./helpers/auth";
import { submitTestBooking } from "./helpers/booking";

test.describe("submit → artist approve", () => {
  test.skip(
    !process.env.E2E_ARTIST_EMAIL,
    "Set E2E_ARTIST_EMAIL, E2E_ARTIST_PASSWORD, E2E_ARTIST_SLUG to run",
  );

  test("customer submits booking and artist approves it", async ({ page }) => {
    // 1. Submit booking as anonymous customer
    const bookingId = await submitTestBooking(page);
    await expect(page.getByText(/got it —/i).first()).toBeVisible();

    // 2. Artist logs in
    await loginAsArtist(page);

    // 3. Navigate directly to the booking detail
    await page.goto(`/dashboard/requests/${bookingId}`);

    // 4. Verify booking is pending (exact match avoids matching "mark deposit pending" button)
    await expect(page.getByText("pending", { exact: true })).toBeVisible();

    // 5. Approve
    await page.getByRole("button", { name: "approve" }).click();

    // 6. Status badge should update to approved
    await expect(page.getByText("approved")).toBeVisible({ timeout: 10_000 });
  });
});
