import { isDateKeyBefore } from "./date-utils";

export type FormAppearance = "dark" | "light" | "auto";

export interface BooksSettings {
  books_open: boolean;
  booking_cap: number | null;
  /** Scheduled OPEN date (P3f). Books stay closed until this date arrives,
   *  then open on their own. The counterpart to booking_window_ends_at, which
   *  has always existed; without it an artist announcing "books open on the
   *  1st" had to remember to flip a switch that morning. */
  booking_opens_at: string | null; // ISO date string
  booking_window_ends_at: string | null; // ISO date string
  books_closed_message: string | null;
  form_appearance: FormAppearance;
}

export const DEFAULT_BOOKS_SETTINGS: BooksSettings = {
  books_open: true,
  booking_cap: null,
  booking_opens_at: null,
  booking_window_ends_at: null,
  books_closed_message: null,
  form_appearance: "dark",
};

export function parseBooksSettings(raw: unknown): BooksSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_BOOKS_SETTINGS };
  const r = raw as Record<string, unknown>;
  const appearance = r.form_appearance;
  return {
    books_open:
      typeof r.books_open === "boolean"
        ? r.books_open
        : DEFAULT_BOOKS_SETTINGS.books_open,
    booking_cap:
      typeof r.booking_cap === "number" && r.booking_cap > 0
        ? r.booking_cap
        : null,
    booking_opens_at:
      typeof r.booking_opens_at === "string" ? r.booking_opens_at : null,
    booking_window_ends_at:
      typeof r.booking_window_ends_at === "string"
        ? r.booking_window_ends_at
        : null,
    books_closed_message:
      typeof r.books_closed_message === "string" &&
      r.books_closed_message.trim().length > 0
        ? r.books_closed_message.trim()
        : null,
    form_appearance:
      appearance === "dark" || appearance === "light" || appearance === "auto"
        ? appearance
        : DEFAULT_BOOKS_SETTINGS.form_appearance,
  };
}

/**
 * The EFFECTIVE books-open state: an expired booking window keeps the books
 * closed even while the `books_open` flag is on. `todayKey` is the artist's
 * timezone date key (YYYY-MM-DD) the caller resolves server-side via
 * `todayInTimeZone` — passing it in keeps this Intl-free, so mobile (Hermes,
 * no Intl) can call it too. This is the ONE definition shared by the public
 * booking page render, the public booking-submit gate, and the mobile /me and
 * /home routes, so the four can never disagree on whether books are open.
 */
export function deriveBooksOpen(
  books: BooksSettings,
  todayKey: string,
): { booksOpen: boolean; windowExpired: boolean; notYetOpen: boolean } {
  const windowExpired =
    books.booking_window_ends_at !== null &&
    isDateKeyBefore(books.booking_window_ends_at, todayKey);
  // Scheduled open (P3f): today is still BEFORE the announced date. The flag
  // stays authoritative on top of it, so an artist who schedules a date and
  // then closes their books is closed, not opened by the schedule.
  const notYetOpen =
    books.booking_opens_at !== null &&
    isDateKeyBefore(todayKey, books.booking_opens_at);
  return {
    booksOpen: books.books_open && !windowExpired && !notYetOpen,
    windowExpired,
    notYetOpen,
  };
}
