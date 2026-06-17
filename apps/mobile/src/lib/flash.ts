// Cache helpers for the flash screens + re-exports of the shared Flash vocabulary
// (one source for web + mobile, ME-10: @inklee/shared/flash-format). flashStatusTone
// stays local because it returns NativeWind theme classes that are mobile-specific.
import type { QueryClient } from "@tanstack/react-query";
import { invalidateByPathPrefix } from "./api";

export {
  FLASH_ITEM_STATUS_OPTIONS as ITEM_STATUS_OPTIONS,
  FLASH_PRICE_TYPE_OPTIONS as PRICE_TYPE_OPTIONS,
  FLASH_BOOKING_MODE_OPTIONS as BOOKING_MODE_OPTIONS,
  FLASH_DAY_STATUS_OPTIONS as DAY_STATUS_OPTIONS,
  flashLabel,
  formatPrice as formatFlashPrice,
} from "@inklee/shared/flash-format";

// Every /flash view (items, days, details) PLUS /calendar: flash days mark
// the calendar grid, so creating/editing one must refresh the markers.
export function invalidateFlash(client: QueryClient): Promise<void> {
  return invalidateByPathPrefix(client, ["/flash", "/calendar"]);
}

/** accent = needs attention/in-progress, success = live, dim = inactive. */
export function flashStatusTone(status: string): string {
  if (status === "published" || status === "active") return "text-success-fg";
  if (status === "archived" || status === "past" || status === "cancelled") {
    return "text-shell-dim";
  }
  return "text-accent"; // draft / upcoming
}
