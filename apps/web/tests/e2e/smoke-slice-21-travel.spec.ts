import { test, expect } from "@playwright/test";
import { loginAsArtist } from "./helpers/auth";
import { submitTestBooking } from "./helpers/booking";

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

async function ensureBooksOpen(page: import("@playwright/test").Page) {
  await loginAsArtist(page);
  await page.goto("/bookings/settings");
  const toggle = page.getByRole("switch").first();
  if ((await toggle.getAttribute("aria-checked")) === "false") {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "save" }).click();
    await expect(page.getByText("saved.")).toBeVisible();
  }
}

test.describe("slice 21 - guest spot / travel mode", () => {
  test.skip(
    !process.env.E2E_ARTIST_EMAIL,
    "Set E2E_ARTIST_EMAIL, E2E_ARTIST_PASSWORD, E2E_ARTIST_SLUG to run",
  );

  test.afterEach(async ({ page }) => {
    await ensureBooksOpen(page).catch(() => {});
  });

  test("active trip shows on the public page and attaches to a new booking", async ({
    page,
  }) => {
    const tripTitle = `E2E Trip ${Date.now()}`;
    const customerHandle = `e2e_travel_${Date.now()}`;

    await loginAsArtist(page);
    await page.goto("/travel");

    await page.getByRole("button", { name: /new trip/i }).click();
    await page.locator('input[name="title"]').fill(tripTitle);
    await page.getByRole("button", { name: /^\+ Add stop$/ }).click();

    await page.locator('input[type="date"]').nth(0).fill(today());
    await page.locator('input[type="date"]').nth(1).fill(tomorrow());
    await page.getByRole("button", { name: "Add stop" }).click();

    await page.getByRole("button", { name: "Create trip" }).click();
    await expect(page.getByText(tripTitle)).toBeVisible({ timeout: 10_000 });

    const bookingId = await submitTestBooking(page, customerHandle, {
      preferredDate: tomorrow(),
      tripTitle,
    });

    await loginAsArtist(page);
    await page.goto(`/bookings/requests/${bookingId}`);
    await expect(page.getByText(`@${customerHandle}`).first()).toBeVisible();
    await expect(page.getByText(tripTitle)).toBeVisible();
  });
});
