import { test, expect } from "@playwright/test";
import { login, artistA } from "./helpers/auth";
import { createTestBooking, daysFromNow } from "./helpers/seed";

test.describe("artist request processing and calendar", () => {
  test("artist accepts a request; booking lands in the calendar", async ({
    page,
  }) => {
    const handle = `e2e_accept_${Date.now().toString(36)}`;
    const preferredDate = daysFromNow(7);
    const booking = await createTestBooking(artistA(), {
      handle,
      preferredDate,
    });

    await login(page, artistA());
    await page.goto(`/bookings/requests/${booking.id}`);

    // Pending state renders the booking-flow verbs (Accept / Pass).
    const accept = page.getByRole("button", { name: "Accept", exact: true });
    await expect(accept).toBeVisible();
    await accept.click();

    // Status chip flips to the human label for approved.
    await expect(page.getByText("Accepted").first()).toBeVisible({
      timeout: 15_000,
    });

    // The accepted booking is visible in the calendar (same month, since the
    // preferred date is 7 days out it may sit in next month's grid — navigate
    // once if needed).
    await page.goto("/bookings/calendar");
    const event = page.getByText(`@${handle}`).first();
    if (!(await event.isVisible().catch(() => false))) {
      await page
        .getByRole("button", { name: /next|→|›/i })
        .first()
        .click()
        .catch(() => {});
    }
    await expect(page.getByText(`@${handle}`).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("artist passes on a request; it leaves the pending list", async ({
    page,
  }) => {
    const handle = `e2e_pass_${Date.now().toString(36)}`;
    const booking = await createTestBooking(artistA(), { handle });

    await login(page, artistA());
    await page.goto(`/bookings/requests/${booking.id}`);

    await page.getByRole("button", { name: "Pass", exact: true }).click();
    // Two-step confirm.
    await page.getByRole("button", { name: /yes, pass/i }).click();

    await expect(page.getByText("Passed").first()).toBeVisible({
      timeout: 15_000,
    });

    // Gone from the pending filter.
    await page.goto("/bookings/overview?view=requests&status=pending");
    await expect(page.getByText(`@${handle}`)).not.toBeVisible();
  });
});
