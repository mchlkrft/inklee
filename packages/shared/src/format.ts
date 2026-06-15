import { formatDateValue } from "./date-utils";

export function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function formatDate(dateStr: string): string {
  return formatDateValue(dateStr, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Long, friendly date for the dashboard greeting, e.g. "Wednesday, June 15". */
export function formatLongDate(dateStr: string): string {
  return formatDateValue(dateStr, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
