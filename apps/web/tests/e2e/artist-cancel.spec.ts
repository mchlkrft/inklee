import { test, expect } from "@playwright/test";
import { loginAsArtist } from "./helpers/auth";

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

test.describe("artist cancels approved booking", () => {
  test.skip(
    !process.env.E2E_ARTIST_EMAIL,
    "Set E2E_ARTIST_EMAIL, E2E_ARTIST_PASSWORD, E2E_ARTIST_SLUG to run",
  );

  test("artist creates appointment then cancels it via calendar", async ({
    page,
  }) => {
    // 1. Log in
    await loginAsArtist(page);

    // 2. Go to calendar
    await page.goto("/bookings/calendar");
    await page.waitForLoadState("networkidle");

    // 3. Open new appointment modal
    await page.getByRole("button", { name: /new appointment/i }).click();

    // 4. Fill in appointment details
    await page.fill('[name="customer_handle"]', "e2e_cancel_test");
    await page.fill('[name="preferred_date"]', tomorrow());
    await page.fill('[name="placement"]', "left forearm");
    await page.selectOption('[name="size"]', "hand-sized");

    // 5. Submit the appointment (creates as approved/artist_created)
    await page.getByRole("button", { name: "add appointment" }).click();

    // 6. Wait for modal backdrop to disappear before interacting with calendar
    await expect(page.locator(".fixed.inset-0.bg-black\\/30")).not.toBeVisible({
      timeout: 10_000,
    });

    // 7. Event should appear on the calendar
    const event = page
      .getByRole("button", { name: "@e2e_cancel_test" })
      .first();
    await expect(event).toBeVisible({ timeout: 10_000 });
    await event.click();

    // 8. Cancel appointment — two-step: first click opens confirm, second confirms
    await page.getByRole("button", { name: "cancel appointment" }).click();
    await page.getByRole("button", { name: "yes, cancel" }).click();

    // 10. Event should be removed from calendar
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("button", { name: "@e2e_cancel_test" }).first(),
    ).not.toBeVisible({ timeout: 12_000 });
  });
});
