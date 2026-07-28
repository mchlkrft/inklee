import { describe, it, expect } from "vitest";
import {
  deriveBooksOpen,
  DEFAULT_BOOKS_SETTINGS,
  type BooksSettings,
} from "@inklee/shared/books-settings";

const base: BooksSettings = { ...DEFAULT_BOOKS_SETTINGS };

describe("deriveBooksOpen", () => {
  it("is open when the flag is on and there is no window", () => {
    expect(
      deriveBooksOpen({ ...base, books_open: true }, "2026-06-18"),
    ).toEqual({ booksOpen: true, windowExpired: false, notYetOpen: false });
  });

  it("is closed when the flag is off (regardless of window)", () => {
    expect(
      deriveBooksOpen({ ...base, books_open: false }, "2026-06-18"),
    ).toEqual({ booksOpen: false, windowExpired: false, notYetOpen: false });
  });

  it("keeps books open on the window's last day (window == today)", () => {
    // The window end is inclusive: expired only once today is AFTER it.
    expect(
      deriveBooksOpen(
        { ...base, books_open: true, booking_window_ends_at: "2026-06-18" },
        "2026-06-18",
      ),
    ).toEqual({ booksOpen: true, windowExpired: false, notYetOpen: false });
  });

  it("closes the books the day after the window ends (window < today)", () => {
    expect(
      deriveBooksOpen(
        { ...base, books_open: true, booking_window_ends_at: "2026-06-17" },
        "2026-06-18",
      ),
    ).toEqual({ booksOpen: false, windowExpired: true, notYetOpen: false });
  });

  it("is open before the window ends (window > today)", () => {
    expect(
      deriveBooksOpen(
        { ...base, books_open: true, booking_window_ends_at: "2026-06-30" },
        "2026-06-18",
      ),
    ).toEqual({ booksOpen: true, windowExpired: false, notYetOpen: false });
  });

  // Scheduled open date (P3f), the counterpart to the window end above.
  it("stays closed before the announced open date", () => {
    expect(
      deriveBooksOpen(
        { ...base, books_open: true, booking_opens_at: "2026-07-01" },
        "2026-06-18",
      ),
    ).toEqual({ booksOpen: false, windowExpired: false, notYetOpen: true });
  });

  it("opens ON the announced date, not the day after", () => {
    expect(
      deriveBooksOpen(
        { ...base, books_open: true, booking_opens_at: "2026-06-18" },
        "2026-06-18",
      ),
    ).toEqual({ booksOpen: true, windowExpired: false, notYetOpen: false });
  });

  it("keeps the flag authoritative: a schedule never re-opens closed books", () => {
    expect(
      deriveBooksOpen(
        { ...base, books_open: false, booking_opens_at: "2026-06-01" },
        "2026-06-18",
      ),
    ).toEqual({ booksOpen: false, windowExpired: false, notYetOpen: false });
  });

  it("handles an open date and a close window together", () => {
    const withBoth = {
      ...base,
      books_open: true,
      booking_opens_at: "2026-06-10",
      booking_window_ends_at: "2026-06-20",
    };
    expect(deriveBooksOpen(withBoth, "2026-06-05").booksOpen).toBe(false);
    expect(deriveBooksOpen(withBoth, "2026-06-15").booksOpen).toBe(true);
    expect(deriveBooksOpen(withBoth, "2026-06-21").booksOpen).toBe(false);
  });
});
