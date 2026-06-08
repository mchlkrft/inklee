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
function toLocalDate(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(value);
}

/** "Friday, 12 June 2026" — the calendar agenda header (date-key input). */
export function formatDayLabel(dateKey: string): string {
  const d = toLocalDate(dateKey);
  return `${WEEKDAY_LONG[d.getDay()]}, ${d.getDate()} ${MONTH_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

/** "12 Jun 2026" — compact absolute date (accepts a date-key or an ISO string). */
export function formatShortDate(value: string): string {
  const d = toLocalDate(value);
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}
