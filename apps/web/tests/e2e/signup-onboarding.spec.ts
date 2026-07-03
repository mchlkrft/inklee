import { test, expect } from "@playwright/test";

/**
 * Full first-run journey: signup -> onboarding wizard -> live public page.
 *
 * Requires an e2e Supabase with email confirmations OFF (the local stack's
 * config.toml default). Against a project with confirmations ON the signup
 * lands on the "check your email" state and this spec stops there.
 */
test.describe("artist signup and onboarding", () => {
  test("new artist signs up, completes onboarding, gets a live public page", async ({
    page,
  }) => {
    const runId = `${process.env.E2E_RUN_ID ?? "x"}${Date.now().toString(36)}`;
    const email = `e2e-signup-${runId}@inklee-e2e.test`;
    const password = `E2e-signup-${runId}-Aa1`;
    const slug = `e2e-signup-${runId}`;

    // 1. Signup (password policy: min 8, lower/upper/digit, confirm field)
    await page.goto("/signup");
    await page.fill('[name="email"]', email);
    await page.fill('[name="password"]', password);
    await page.fill('[name="password_confirm"]', password);
    await page.click('button[type="submit"]');

    // With autoconfirm the action lands on the onboarding intro.
    await expect(page).toHaveURL(/\/onboarding\/welcome/, { timeout: 20_000 });

    // 2. Intro -> claim slug (required: display name + slug)
    await page.getByRole("link", { name: /start setup/i }).click();
    await expect(page).toHaveURL(/\/onboarding\/claim-slug/);
    await page.fill('[name="display_name"]', `E2E Signup ${runId}`);
    await page.fill('[name="slug"]', slug);
    await page.click('button[type="submit"]');

    // 3. Booking mode step
    await expect(page).toHaveURL(/\/onboarding\/booking/, { timeout: 15_000 });
    await page.check('input[name="booking_mode"][value="preferred_date"]');
    await page.getByRole("button", { name: /continue/i }).click();

    // 4. Availability step (defaults are fine)
    await expect(page).toHaveURL(/\/onboarding\/availability/, {
      timeout: 15_000,
    });
    await page.getByRole("button", { name: /continue/i }).click();

    // 5. Booking form step
    await expect(page).toHaveURL(/\/onboarding\/form/, { timeout: 15_000 });
    await page.getByRole("button", { name: /looks good/i }).click();

    // 6. Done
    await expect(page).toHaveURL(/\/onboarding\/done/, { timeout: 15_000 });

    // 7. The public page is live without auth.
    await page.context().clearCookies();
    await page.goto(`/${slug}`);
    await expect(page.getByText(`E2E Signup ${runId}`).first()).toBeVisible();
    await expect(page.locator('[name="email"]').first()).toBeVisible();
  });

  test("claim-slug enforces required fields and slug rules", async ({
    page,
  }) => {
    const runId = `${process.env.E2E_RUN_ID ?? "x"}${Date.now().toString(36)}v`;
    const email = `e2e-val-${runId}@inklee-e2e.test`;
    const password = `E2e-val-${runId}-Aa1`;

    await page.goto("/signup");
    await page.fill('[name="email"]', email);
    await page.fill('[name="password"]', password);
    await page.fill('[name="password_confirm"]', password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/onboarding\/welcome/, { timeout: 20_000 });

    await page.goto("/onboarding/claim-slug");
    // A reserved slug is rejected by the live check: the inline feedback shows
    // the reserved message and the submit button stays disabled, so no profile
    // can be created with it.
    await page.fill('[name="display_name"]', "E2E Validation");
    await page.fill('[name="slug"]', "admin");
    await expect(page.getByText(/reserved/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('button[type="submit"]')).toBeDisabled();
    await expect(page).toHaveURL(/\/onboarding\/claim-slug/);
  });
});
