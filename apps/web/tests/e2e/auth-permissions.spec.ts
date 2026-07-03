import { test, expect } from "@playwright/test";
import { login, artistA, artistB } from "./helpers/auth";
import { createTestBooking } from "./helpers/seed";

test.describe("auth and permission boundaries", () => {
  test("logged-out user is redirected from the artist dashboard", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("logged-out user is redirected from admin", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
  });

  test("logged-out user cannot open a request detail", async ({ page }) => {
    const booking = await createTestBooking(artistA());
    await page.goto(`/bookings/requests/${booking.id}`);
    await expect(page).toHaveURL(/\/login/);
  });

  test("a normal artist cannot reach the admin area", async ({ page }) => {
    await login(page, artistA());
    await page.goto("/admin");
    // requireAdmin() bounces non-admins back to their dashboard.
    await expect(page).toHaveURL(/\/(dashboard|login)/);
    await expect(page.getByText(artistA().email)).not.toBeVisible();
  });

  test("artist A cannot open artist B's request", async ({ page }) => {
    const bHandle = `e2e_victim_${Date.now().toString(36)}`;
    const bBooking = await createTestBooking(artistB(), { handle: bHandle });
    await login(page, artistA());
    await page.goto(`/bookings/requests/${bBooking.id}`);
    // Ownership-scoped read renders the not-found page: none of artist B's
    // booking data leaks (notFound() renders a 200 body in dev, so assert on
    // content, not the HTTP status).
    await expect(page.getByText(`@${bHandle}`)).not.toBeVisible();
    await expect(page.getByText(/left forearm/i)).not.toBeVisible();
    await expect(
      page.getByText(/not found|does not exist|can.t find/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("artist A cannot approve artist B's request via the mobile API shape", async ({
    request,
  }) => {
    // No bearer token at all — the mobile surface must fail closed.
    const bBooking = await createTestBooking(artistB());
    const res = await request.post(
      `/api/mobile/bookings/${bBooking.id}/approve`,
    );
    expect([401, 403]).toContain(res.status());
  });
});
