import { test, expect } from "@playwright/test";
import { artistA } from "./helpers/auth";
import { createTestBooking } from "./helpers/seed";

test.describe("customer magic-link portal", () => {
  test("a valid token opens the portal; cancel works end to end", async ({
    page,
  }) => {
    const booking = await createTestBooking(artistA(), {
      handle: `e2e_portal_${Date.now().toString(36)}`,
    });

    await page.goto(`/request/${booking.token}`);
    // The portal renders the request (no login involved).
    await expect(page.getByText(/left forearm/i).first()).toBeVisible({
      timeout: 15_000,
    });

    // Cancel — the portal uses a confirm step before the destructive action.
    await page
      .getByRole("button", { name: /cancel/i })
      .first()
      .click();
    const confirm = page.getByRole("button", {
      name: /yes|confirm|cancel my request/i,
    });
    if (await confirm.count()) {
      await confirm.first().click();
    }
    await expect(page).toHaveURL(/cancelled=1|\/request\/submitted/, {
      timeout: 20_000,
    });
    await expect(
      page.getByRole("heading", { name: /request cancelled/i }),
    ).toBeVisible();
  });

  test("an invalid token fails safely with no data leak", async ({ page }) => {
    await page.goto(`/request/${"0".repeat(64)}`);
    await expect(
      page.getByText(/no longer valid|not found|expired|used/i).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/left forearm/i)).not.toBeVisible();
  });

  test("an expired token (31 days old) fails safely", async ({ page }) => {
    const thirtyOneDaysAgo = new Date(
      Date.now() - 31 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const booking = await createTestBooking(artistA(), {
      handle: `e2e_expired_${Date.now().toString(36)}`,
      createdAt: thirtyOneDaysAgo,
    });

    await page.goto(`/request/${booking.token}`);
    await expect(page.getByText(/expired/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/left forearm/i)).not.toBeVisible();
  });
});
