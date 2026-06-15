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

const DAY_MS = 86_400_000;

/**
 * Relative due-date label for the deposits chase view, e.g. "due in 3 days",
 * "due tomorrow", "due today", "1 day overdue", "5 days overdue". Intl-free
 * (day arithmetic) so web and mobile share one wording; `now` is injected for
 * determinism. Days are ROUNDED, not floored: due dates are usually date-keys
 * (midnight) while `now` is mid-day, so flooring the raw ms gap would
 * systematically read a day short. A sub-day lapse reads as a flat "overdue"
 * so the label never disagrees with the "Overdue" classification.
 */
export function relativeDueLabel(dueAt: string, now: number): string {
  const diff = new Date(dueAt).getTime() - now; // >0 future, <0 past
  const days = Math.round(diff / DAY_MS);
  if (days < 0) {
    const n = -days;
    return n === 1 ? "1 day overdue" : `${n} days overdue`;
  }
  if (days === 0) return diff < 0 ? "overdue" : "due today";
  if (days === 1) return "due tomorrow";
  return `due in ${days} days`;
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
