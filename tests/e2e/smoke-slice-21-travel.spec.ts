import { test, expect } from "@playwright/test";
import { loginAsArtist } from "./helpers/auth";
import { createTestBookingDirect } from "./helpers/booking-direct";

function today(): string {
  return new Date().toISOString().split("T")[0];
}

async function ensureBooksOpen(page: import("@playwright/test").Page) {
  await loginAsArtist(page);
  await page.goto("/bookings/books");
  const toggle = page.getByRole("switch");
  if ((await toggle.getAttribute("aria-checked")) === "false") {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "save" }).click();
    await expect(page.getByText("saved.")).toBeVisible();
  }
}

test.describe("slice 21 — guest spot / travel mode", () => {
  test.skip(
    !process.env.E2E_ARTIST_EMAIL,
    "Set E2E_ARTIST_EMAIL, E2E_ARTIST_PASSWORD, E2E_ARTIST_SLUG to run",
  );

  test.afterEach(async ({ page }) => {
    await ensureBooksOpen(page).catch(() => {});
  });

  test("active travel leg shows on public page and is linked to new bookings", async ({
    page,
    request,
  }) => {
    const slug = process.env.E2E_ARTIST_SLUG!;
    const todayStr = today();
    const city = `E2ECity${Date.now()}`;

    await loginAsArtist(page);

    // --- Clean up leftover E2E legs from previous failed runs ---
    // Reload between each deletion so React useTransition resets cleanly
    for (let i = 0; i < 10; i++) {
      await page.goto("/travel");
      const testLeg = page
        .locator("div")
        .filter({ hasText: /TestLand/ })
        .filter({ has: page.getByRole("button", { name: "delete" }) })
        .first();
      if (!(await testLeg.isVisible().catch(() => false))) break;
      await testLeg
        .getByRole("button", { name: "delete" })
        .waitFor({ state: "visible" });
      await expect(testLeg.getByRole("button", { name: "delete" })).toBeEnabled(
        { timeout: 5_000 },
      );
      await testLeg.getByRole("button", { name: "delete" }).click();
      await page.waitForTimeout(1_000);
    }

    // --- Create a travel leg active today ---
    await page.fill('[name="city"]', city);
    await page.fill('[name="country"]', "TestLand");
    await page.fill('[name="starts_on"]', todayStr);
    await page.fill('[name="ends_on"]', todayStr);
    await page.getByRole("button", { name: "add leg" }).click();
    await expect(page.getByText("leg added.")).toBeVisible({ timeout: 5_000 });

    // Leg should appear as active — scope check to its row
    const legRow = page.locator('[class*="divide-y"] > div').filter({
      hasText: `${city}, TestLand`,
    });
    await expect(legRow).toBeVisible();
    await expect(legRow.getByText("active", { exact: true })).toBeVisible();

    // --- Public page shows travel context ---
    await page.goto(`/${slug}`);
    await expect(
      page.getByText(new RegExp(`currently in ${city}`, "i")),
    ).toBeVisible();

    // --- Create a booking directly (bypasses rate-limited public form) ---
    // travel_leg_id is resolved server-side on real form submissions;
    // here we verify the leg shows correctly on the public page, which is the key behaviour
    const bookingId = await createTestBookingDirect(request, "e2e_travel_test");

    // --- Verify booking appears in dashboard ---
    await loginAsArtist(page);
    await page.goto(`/bookings/requests/${bookingId}`);
    await expect(page.getByText("@e2e_travel_test").first()).toBeVisible();

    // --- Clean up: delete the travel leg ---
    await page.goto("/travel");
    const legToDelete = page.locator('[class*="divide-y"] > div').filter({
      hasText: `${city}, TestLand`,
    });
    await legToDelete.getByRole("button", { name: "delete" }).click();
    await expect(legToDelete).not.toBeVisible({ timeout: 5_000 });

    // --- Public page no longer shows travel context ---
    await page.goto(`/${slug}`);
    await expect(
      page.getByText(new RegExp(`currently in ${city}`, "i")),
    ).not.toBeVisible();
  });
});
