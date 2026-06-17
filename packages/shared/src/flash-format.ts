// Pure, platform-agnostic Flash vocabulary + presentation helpers shared by
// apps/web and apps/mobile so the two surfaces cannot drift (ME-10).
//
// Import via the SUBPATH ("@inklee/shared/flash-format"), never the barrel:
// these Flash* type names also exist as re-export shims in apps/web/src/lib/flash.ts
// and apps/web/src/lib/mobile-flash.ts, so a barrel `export *` would collide.

export const FLASH_ITEM_STATUSES = ["draft", "published", "archived"] as const;
export const FLASH_PRICE_TYPES = ["fixed", "from", "request"] as const;
export const FLASH_BOOKING_MODES = ["unique", "limited", "repeatable"] as const;
export const FLASH_DAY_STATUSES = [
  "upcoming",
  "active",
  "past",
  "cancelled",
] as const;

export type FlashItemStatus = (typeof FLASH_ITEM_STATUSES)[number];
export type FlashPriceType = (typeof FLASH_PRICE_TYPES)[number];
export type FlashBookingMode = (typeof FLASH_BOOKING_MODES)[number];
export type FlashDayStatus = (typeof FLASH_DAY_STATUSES)[number];

// Booking-request statuses that consume a flash design's intake capacity. A
// pending request counts (founder decision 2026-06-17: a pending request makes a
// "unique" design read as booked), so every availability GATE across web +
// mobile uses this ONE set. Distinct from the artist-facing "confirmed" stat,
// which counts only "approved".
export const FLASH_ACTIVE_REQUEST_STATUSES = [
  "pending",
  "approved",
  "deposit_pending",
] as const;

type FlashOption<T extends string> = { value: T; label: string };

export const FLASH_ITEM_STATUS_OPTIONS: readonly FlashOption<FlashItemStatus>[] =
  [
    { value: "draft", label: "Draft" },
    { value: "published", label: "Published" },
    { value: "archived", label: "Archived" },
  ];
export const FLASH_PRICE_TYPE_OPTIONS: readonly FlashOption<FlashPriceType>[] = [
  { value: "request", label: "On request" },
  { value: "from", label: "From" },
  { value: "fixed", label: "Fixed" },
];
export const FLASH_BOOKING_MODE_OPTIONS: readonly FlashOption<FlashBookingMode>[] =
  [
    { value: "unique", label: "Unique" },
    { value: "limited", label: "Limited" },
    { value: "repeatable", label: "Repeatable" },
  ];
export const FLASH_DAY_STATUS_OPTIONS: readonly FlashOption<FlashDayStatus>[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "active", label: "Active" },
  { value: "past", label: "Past" },
  { value: "cancelled", label: "Cancelled" },
];

const FLASH_LABELS: Record<string, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
  upcoming: "Upcoming",
  active: "Active",
  past: "Past",
  cancelled: "Cancelled",
};

export function flashLabel(value: string): string {
  return FLASH_LABELS[value] ?? value;
}

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

// One price string for web (client-facing) AND mobile (artist-facing). Sentence
// case, no em-dash.
export function formatPrice(
  priceType: string,
  price: string | number | null,
): string {
  if (priceType === "request" || price === null || price === undefined) {
    return "Price on request";
  }
  const formatted = `€${Number(price).toFixed(0)}`;
  return priceType === "from" ? `From ${formatted}` : formatted;
}
