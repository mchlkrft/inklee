import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";
import { daysFromNow } from "./seed";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Drives the custom DateInput popover (components/date-input.tsx): opens it via
 * its trigger, navigates to the target month, and clicks the day. Used
 * anywhere the app renders the branded picker instead of a native date input.
 */
export async function pickDate(page: Page, trigger: Locator, dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  await trigger.click();
  const popover = page.locator("div.absolute.z-30").last();
  await expect(popover).toBeVisible();

  const header = popover.locator("span.font-semibold").first();
  const target = `${MONTHS[m - 1]} ${y}`;
  for (let i = 0; i < 24; i++) {
    if ((await header.textContent())?.trim() === target) break;
    await popover.getByRole("button", { name: "Next month" }).click();
  }

  await popover
    .getByRole("button", { name: String(d), exact: true })
    .and(page.locator("button:not([disabled])"))
    .first()
    .click();
}

/** Fills whichever of the public form's optional fields are visible. */
export async function fillPublicForm(
  page: Page,
  handle: string,
  email: string,
  opts?: { preferredDate?: string },
) {
  if (await page.locator('[name="instagram_handle"]').count()) {
    await page.fill('[name="instagram_handle"]', handle);
  }
  await page.fill('[name="email"]', email);
  if (await page.locator('[name="placement"]').count()) {
    await page.fill('[name="placement"]', "left forearm");
  }
  if (await page.locator('[name="size"]').count()) {
    await page.check('[name="size"][value="hand-sized"]');
  }
  if (await page.locator('textarea[name="description"]').count()) {
    await page.fill(
      'textarea[name="description"]',
      "automated e2e request - safe to ignore",
    );
  }
  if (await page.locator("#preferred_date").count()) {
    await pickDate(
      page,
      page.locator("#preferred_date"),
      opts?.preferredDate ?? daysFromNow(7),
    );
  }
}

/**
 * Submits a booking on /<slug> as an anonymous client and returns the booking
 * id from the /request/submitted redirect.
 */
export async function submitTestBooking(
  page: Page,
  slug: string,
  handle: string,
  options?: { preferredDate?: string; tripTitle?: string },
): Promise<string> {
  await page.goto(`/${slug}`);
  await fillPublicForm(page, handle, "e2e-client@inklee-e2e.test", options);

  const tripSelect = page.locator('select[name="trip_id"]');
  if (options?.tripTitle && (await tripSelect.count())) {
    await tripSelect.selectOption({ label: options.tripTitle });
  }

  await page.locator('button[type="submit"]').last().click();
  await expect(page).toHaveURL(/\/request\/submitted/, { timeout: 20_000 });

  const id = new URL(page.url()).searchParams.get("id");
  if (!id) throw new Error("booking id not found in redirect URL");
  return id;
}
