import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

function testImageBuffer(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0i8AAAAASUVORK5CYII=",
    "base64",
  );
}

/** Submits a booking on the public form and returns the booking ID from the redirect URL. */
export async function submitTestBooking(
  page: Page,
  handle = "e2e_test_customer",
  options?: {
    preferredDate?: string;
    tripTitle?: string;
  },
): Promise<string> {
  const slug = process.env.E2E_ARTIST_SLUG;
  if (!slug) throw new Error("E2E_ARTIST_SLUG not set");

  await page.goto(`/${slug}`);
  await page.fill('[name="instagram_handle"]', handle);
  await page.fill('[name="email"]', "e2e@inklee-test.invalid");
  await page.fill('[name="placement"]', "left forearm");
  await page.click('[name="size"][value="hand-sized"]');
  await page.fill(
    'textarea[name="description"]',
    "automated e2e test - please ignore",
  );
  await page.locator('input[type="file"]').setInputFiles({
    name: "reference.png",
    mimeType: "image/png",
    buffer: testImageBuffer(),
  });
  await page.fill(
    '[name="preferred_date"]',
    options?.preferredDate ?? tomorrow(),
  );
  const tripSelect = page.locator('select[name="trip_id"]');
  if (options?.tripTitle && (await tripSelect.count())) {
    await tripSelect.selectOption({ label: options.tripTitle });
  }
  await page.click('button[type="submit"]');

  await expect(page).toHaveURL(/\/request\/submitted/, { timeout: 15_000 });

  const url = new URL(page.url());
  const id = url.searchParams.get("id");
  if (!id) throw new Error("booking ID not found in redirect URL");
  return id;
}
