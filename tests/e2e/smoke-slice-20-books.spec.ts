import { test, expect } from "@playwright/test";
import { loginAsArtist } from "./helpers/auth";

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

test.describe("slice 20 — books-open / wave booking mode", () => {
  test.skip(
    !process.env.E2E_ARTIST_EMAIL,
    "Set E2E_ARTIST_EMAIL, E2E_ARTIST_PASSWORD, E2E_ARTIST_SLUG to run",
  );

  test.afterEach(async ({ page }) => {
    await ensureBooksOpen(page).catch(() => {});
  });

  test("closing books hides form and shows waitlist; reopening restores form", async ({
    page,
  }) => {
    const slug = process.env.E2E_ARTIST_SLUG!;

    await loginAsArtist(page);

    // --- Close books ---
    await page.goto("/bookings/books");
    const toggle = page.getByRole("switch");

    const isOpen = (await toggle.getAttribute("aria-checked")) === "true";
    if (isOpen) {
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "false");
    }
    await page.getByRole("button", { name: "save" }).click();
    await expect(page.getByText("saved.")).toBeVisible();

    // --- Public page should show closed state ---
    await page.goto(`/${slug}`);
    await expect(
      page.getByText(/books are currently closed|currently closed/i),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /send request/i }),
    ).not.toBeVisible();
    // Waitlist form should appear
    await expect(
      page.getByRole("button", { name: /join the waitlist/i }),
    ).toBeVisible();

    // --- Reopen books ---
    await loginAsArtist(page);
    await page.goto("/bookings/books");
    const toggleAfter = page.getByRole("switch");
    await toggleAfter.click();
    await expect(toggleAfter).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "save" }).click();
    await expect(page.getByText("saved.")).toBeVisible();

    // --- Public page should show booking form again ---
    await page.goto(`/${slug}`);
    await expect(
      page.getByText(/books are currently closed/i),
    ).not.toBeVisible();
  });
});
