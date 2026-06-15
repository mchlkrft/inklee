const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function partsToDateKey(parts: Intl.DateTimeFormatPart[]): string {
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function toUtcNoon(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00Z`);
}

export function isDateKey(value: string | null | undefined): value is string {
  return !!value && DATE_KEY_RE.test(value);
}

export function localDateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dateKeyInTimeZone(
  date: Date | string,
  timeZone: string,
): string {
  const source = typeof date === "string" ? new Date(date) : date;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return partsToDateKey(formatter.formatToParts(source));
}

export function todayInTimeZone(timeZone: string): string {
  return dateKeyInTimeZone(new Date(), timeZone);
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const date = toUtcNoon(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function compareDateKeys(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function isDateKeyBefore(a: string, b: string): boolean {
  return compareDateKeys(a, b) < 0;
}

export function isDateKeyAfter(a: string, b: string): boolean {
  return compareDateKeys(a, b) > 0;
}

export function isDateKeyOnOrAfter(a: string, b: string): boolean {
  return compareDateKeys(a, b) >= 0;
}

export function isDateKeyOnOrBefore(a: string, b: string): boolean {
  return compareDateKeys(a, b) <= 0;
}

export function formatDateKey(
  dateKey: string,
  options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
  },
): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    ...options,
  }).format(toUtcNoon(dateKey));
}

export function formatDateValue(
  value: string,
  options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
  },
): string {
  if (isDateKey(value)) {
    return formatDateKey(value, options);
  }
  return new Date(value).toLocaleDateString("en-GB", options);
}

export function relativeDateKeyFromToday(
  days: number,
  timeZone: string,
): string {
  return addDaysToDateKey(todayInTimeZone(timeZone), days);
}
