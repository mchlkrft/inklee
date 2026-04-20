import { test, expect } from "@playwright/test";
import { loginAsArtist } from "./helpers/auth";
import { submitTestBooking } from "./helpers/booking";

test.describe("artist cancels approved booking", () => {
  test.skip(
    !process.env.E2E_ARTIST_EMAIL,
    "Set E2E_ARTIST_EMAIL, E2E_ARTIST_PASSWORD, E2E_ARTIST_SLUG to run",
  );

  test("artist approves then cancels a booking via calendar", async ({
    page,
  }) => {
    // 1. Submit and get booking ID
    const bookingId = await submitTestBooking(page);

    // 2. Artist logs in and approves the booking
    await loginAsArtist(page);
    await page.goto(`/dashboard/requests/${bookingId}`);
    await page.getByRole("button", { name: "approve" }).click();
    await expect(page.getByText("approved")).toBeVisible({ timeout: 10_000 });

    // 3. Go to calendar
    await page.goto("/dashboard/calendar");
    await expect(page).toHaveURL("/dashboard/calendar");

    // 4. Find the event for our booking (click the event tile with the test handle)
    const event = page.getByText("@e2e_test_customer").first();
    await expect(event).toBeVisible({ timeout: 8_000 });
    await event.click();

    // 5. Cancel from the drawer
    const cancelButton = page.getByRole("button", { name: /cancel/i });
    await expect(cancelButton).toBeVisible();
    await cancelButton.click();

    // 6. Confirm if a dialog appears
    const confirmCancel = page.getByRole("button", {
      name: /cancel booking|yes/i,
    });
    if (await confirmCancel.isVisible()) {
      await confirmCancel.click();
    }

    // 7. Event should no longer be visible on the calendar
    await expect(page.getByText("@e2e_test_customer")).not.toBeVisible({
      timeout: 8_000,
    });
  });
});
