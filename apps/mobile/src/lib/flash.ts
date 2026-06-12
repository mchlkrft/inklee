// Presentation + cache helpers for the flash screens. Mirrors the web
// @/lib/flash formatters (kept local for now — the response *types* are shared
// via @inklee/shared/mobile-api; consolidating the formatters to shared is a
// follow-up).
import type { QueryClient } from "@tanstack/react-query";
import { invalidateByPathPrefix } from "./api";

// Every /flash view (items, days, details). Lives here so screens share one
// definition instead of re-inlining the predicate.
export function invalidateFlash(client: QueryClient): Promise<void> {
  return invalidateByPathPrefix(client, ["/flash"]);
}

export const ITEM_STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
] as const;

export const PRICE_TYPE_OPTIONS = [
  { value: "request", label: "On request" },
  { value: "from", label: "From" },
  { value: "fixed", label: "Fixed" },
] as const;

export const BOOKING_MODE_OPTIONS = [
  { value: "unique", label: "Unique" },
  { value: "limited", label: "Limited" },
  { value: "repeatable", label: "Repeatable" },
] as const;

export const DAY_STATUS_OPTIONS = [
  { value: "upcoming", label: "Upcoming" },
  { value: "active", label: "Active" },
  { value: "past", label: "Past" },
  { value: "cancelled", label: "Cancelled" },
] as const;

const LABELS: Record<string, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
  upcoming: "Upcoming",
  active: "Active",
  past: "Past",
  cancelled: "Cancelled",
};

export function flashLabel(value: string): string {
  return LABELS[value] ?? value;
}

/** accent = needs attention/in-progress, success = live, dim = inactive. */
export function flashStatusTone(status: string): string {
  if (status === "published" || status === "active") return "text-success";
  if (status === "archived" || status === "past" || status === "cancelled") {
    return "text-shell-dim";
  }
  return "text-accent"; // draft / upcoming
}

export function formatFlashPrice(
  priceType: string,
  price: number | null,
): string {
  if (priceType === "request" || price == null) return "On request";
  const formatted = `€${Number(price).toFixed(0)}`;
  return priceType === "from" ? `From ${formatted}` : formatted;
}
