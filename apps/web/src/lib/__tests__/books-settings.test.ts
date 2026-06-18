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
    ).toEqual({ booksOpen: true, windowExpired: false });
  });

  it("is closed when the flag is off (regardless of window)", () => {
    expect(
      deriveBooksOpen({ ...base, books_open: false }, "2026-06-18"),
    ).toEqual({ booksOpen: false, windowExpired: false });
  });

  it("keeps books open on the window's last day (window == today)", () => {
    // The window end is inclusive: expired only once today is AFTER it.
    expect(
      deriveBooksOpen(
        { ...base, books_open: true, booking_window_ends_at: "2026-06-18" },
        "2026-06-18",
      ),
    ).toEqual({ booksOpen: true, windowExpired: false });
  });

  it("closes the books the day after the window ends (window < today)", () => {
    expect(
      deriveBooksOpen(
        { ...base, books_open: true, booking_window_ends_at: "2026-06-17" },
        "2026-06-18",
      ),
    ).toEqual({ booksOpen: false, windowExpired: true });
  });

  it("is open before the window ends (window > today)", () => {
    expect(
      deriveBooksOpen(
        { ...base, books_open: true, booking_window_ends_at: "2026-06-30" },
        "2026-06-18",
      ),
    ).toEqual({ booksOpen: true, windowExpired: false });
  });
});
