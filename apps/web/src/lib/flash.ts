import { localDateKey } from "@/lib/date-utils";
import type { FlashAvailability } from "@inklee/shared/flash-format";

// Flash vocabulary + presentation helpers now live in @inklee/shared/flash-format
// so web and mobile cannot drift (ME-10). This module keeps the availability
// ENGINE (it depends on the web date util) and slugify, and re-exports the shared
// surface so the many existing `@/lib/flash` importers keep working unchanged.
export {
  FLASH_ITEM_STATUSES,
  FLASH_PRICE_TYPES,
  FLASH_BOOKING_MODES,
  FLASH_DAY_STATUSES,
  FLASH_ACTIVE_REQUEST_STATUSES,
  formatPrice,
  formatFlashAvailabilityLabel,
  flashLabel,
} from "@inklee/shared/flash-format";
export type {
  FlashAvailability,
  FlashItemStatus,
  FlashPriceType,
  FlashBookingMode,
  FlashDayStatus,
} from "@inklee/shared/flash-format";
// Back-compat: this module historically exported the item status as `FlashStatus`.
export type { FlashItemStatus as FlashStatus } from "@inklee/shared/flash-format";

export type FlashItemRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  booking_mode: string;
  max_bookings: number | null;
  is_bookable: boolean;
  available_from: string | null;
  available_until: string | null;
};

/**
 * Compute availability from a flash item row + active request count.
 * Pending requests reduce intake capacity so unique/limited flash cannot collect
 * more live requests than the artist can reasonably review for that design.
 */
export function computeFlashAvailability(
  item: FlashItemRow,
  activeRequestCount: number,
): FlashAvailability {
  if (item.status === "draft") return { bookable: false, reason: "draft" };
  if (item.status === "archived")
    return { bookable: false, reason: "archived" };
  if (!item.is_bookable) return { bookable: false, reason: "disabled" };

  const today = localDateKey();
  if (item.available_from && item.available_from > today)
    return { bookable: false, reason: "not_yet" };
  if (item.available_until && item.available_until < today)
    return { bookable: false, reason: "expired" };

  if (item.booking_mode === "repeatable") return { bookable: true };

  if (item.booking_mode === "unique") {
    return activeRequestCount >= 1
      ? { bookable: false, reason: "booked" }
      : { bookable: true };
  }

  if (item.booking_mode === "limited") {
    const max = item.max_bookings ?? 1;
    const remaining = Math.max(0, max - activeRequestCount);
    return remaining === 0
      ? { bookable: false, reason: "full" }
      : { bookable: true, remaining };
  }

  return { bookable: true };
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
