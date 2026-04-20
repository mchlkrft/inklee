import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export async function loginAsArtist(page: Page) {
  const email = process.env.E2E_ARTIST_EMAIL;
  const password = process.env.E2E_ARTIST_PASSWORD;
  if (!email || !password)
    throw new Error("E2E_ARTIST_EMAIL / E2E_ARTIST_PASSWORD not set");

  await page.goto("/login");
  await page.fill('[name="email"]', email);
  await page.fill('[name="password"]', password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL("/dashboard", { timeout: 10_000 });
}
