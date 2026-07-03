import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export interface ArtistCredentials {
  email: string;
  password: string;
}

/** Artist A — seeded by global-setup (or provided via env for manual runs). */
export function artistA(): ArtistCredentials & { slug: string; id: string } {
  const email = process.env.E2E_ARTIST_EMAIL;
  const password = process.env.E2E_ARTIST_PASSWORD;
  const slug = process.env.E2E_ARTIST_SLUG;
  const id = process.env.E2E_ARTIST_ID ?? "";
  if (!email || !password || !slug)
    throw new Error("E2E artist A not seeded — global setup did not run");
  return { email, password, slug, id };
}

/** Artist B — the cross-tenant victim/counterpart. */
export function artistB(): ArtistCredentials & { slug: string; id: string } {
  const email = process.env.E2E_ARTIST_B_EMAIL;
  const password = process.env.E2E_ARTIST_B_PASSWORD;
  const slug = process.env.E2E_ARTIST_B_SLUG;
  const id = process.env.E2E_ARTIST_B_ID ?? "";
  if (!email || !password || !slug)
    throw new Error("E2E artist B not seeded — global setup did not run");
  return { email, password, slug, id };
}

export async function login(page: Page, creds: ArtistCredentials) {
  await page.goto("/login");
  await page.fill('[name="email"]', creds.email);
  await page.fill('[name="password"]', creds.password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL("/dashboard", { timeout: 15_000 });
}

/** Kept for the legacy slice smoke specs. */
export async function loginAsArtist(page: Page) {
  await login(page, artistA());
}
