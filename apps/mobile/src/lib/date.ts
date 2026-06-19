// Canonical date/time formatting for the mobile app. Hermes ships Intl only on
// Android, so the shared format.ts / date-utils formatters (Intl.DateTimeFormat
// based) crash on iOS — these hand-rolled ones avoid it. Values are parsed into
// a LOCAL Date from their parts so a bare date-key never shifts across a tz.
//
// ⚠️ ALWAYS format dates/times in mobile through this module — never import
// formatDate/formatDateValue/formatDateKey from @inklee/shared (those use Intl).
// relativeTime is the one shared helper that's Intl-free (pure arithmetic), so
// it's re-exported here to keep a single import site.
export { relativeTime } from "@inklee/shared/format";

export const MONTH_LONG = [
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

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const WEEKDAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// Accepts a YYYY-MM-DD date-key (parsed as a local date) or an ISO timestamp.
// Exported for Date-typed props (e.g. a picker's minimumDate): a bare
// `new Date("YYYY-MM-DD")` parses as UTC midnight, which is the PREVIOUS local
// day west of UTC — this keeps date-keys on the local calendar day.
export function toLocalDate(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(value);
}

/** "Friday, 12 June 2026" — the calendar agenda header (date-key input). */
export function formatDayLabel(dateKey: string): string {
  const d = toLocalDate(dateKey);
  return `${WEEKDAY_LONG[d.getDay()]}, ${d.getDate()} ${MONTH_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Thursday, June 18" — the Home greeting date (weekday-long, month-long,
 *  day-numeric), Intl-free to match the web formatLongDate shape. Takes a
 *  YYYY-MM-DD date-key; the server sends today in the artist's timezone. */
export function formatLongDate(dateKey: string): string {
  const d = toLocalDate(dateKey);
  return `${WEEKDAY_LONG[d.getDay()]}, ${MONTH_LONG[d.getMonth()]} ${d.getDate()}`;
}

/** Today's date-key (YYYY-MM-DD) in the DEVICE timezone, Intl-free. Only a
 *  fallback for older servers that don't send a timezone-aware todayKey. */
export function deviceTodayKey(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** "12 Jun 2026" — compact absolute date (accepts a date-key or an ISO string). */
export function formatShortDate(value: string): string {
  const d = toLocalDate(value);
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** "12 Jun 2026, 14:30" — absolute date + time for feed timestamps (ISO input).
 *  Mirrors the web feed's medium-date + short-time format, Intl-free. */
export function formatShortDateTime(value: string): string {
  const d = toLocalDate(value);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`;
}
