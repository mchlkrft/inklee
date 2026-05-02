import { localDateKey } from "@/lib/date-utils";

export type FlashBookingMode = "unique" | "limited" | "repeatable";
export type FlashStatus = "draft" | "published" | "archived";
export type FlashPriceType = "fixed" | "from" | "request";
export type FlashDayStatus = "upcoming" | "active" | "past" | "cancelled";

export interface FlashAvailability {
  bookable: boolean;
  reason?:
    | "draft"
    | "archived"
    | "disabled"
    | "not_yet"
    | "expired"
    | "booked"
    | "full";
  remaining?: number; // only for limited mode
}

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
 * Compute availability from a flash item row + confirmed booking count.
 * Only confirmed (approved) bookings reduce capacity — pending requests do not.
 */
export function computeFlashAvailability(
  item: FlashItemRow,
  confirmedCount: number,
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
    return confirmedCount >= 1
      ? { bookable: false, reason: "booked" }
      : { bookable: true };
  }

  if (item.booking_mode === "limited") {
    const max = item.max_bookings ?? 1;
    const remaining = Math.max(0, max - confirmedCount);
    return remaining === 0
      ? { bookable: false, reason: "full" }
      : { bookable: true, remaining };
  }

  return { bookable: true };
}

export function formatFlashAvailabilityLabel(av: FlashAvailability): string {
  if (av.bookable) {
    if (av.remaining !== undefined) return `${av.remaining} remaining`;
    return "Available";
  }
  switch (av.reason) {
    case "booked":
      return "Booked";
    case "full":
      return "Fully booked";
    case "not_yet":
      return "Not yet available";
    case "expired":
      return "Expired";
    case "disabled":
      return "Disabled";
    case "draft":
      return "Draft";
    case "archived":
      return "Archived";
    default:
      return "Unavailable";
  }
}

export function formatPrice(
  priceType: string,
  price: string | number | null,
): string {
  if (priceType === "request") return "Price on request";
  if (price === null || price === undefined) return "Price on request";
  const formatted = `€${Number(price).toFixed(0)}`;
  return priceType === "from" ? `From ${formatted}` : formatted;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
