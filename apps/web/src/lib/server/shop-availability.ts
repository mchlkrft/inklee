import "server-only";
import {
  productAvailability,
  availabilityLabel,
  type ProductAvailability,
} from "@inklee/shared/product-availability";
import { formatDateKey } from "@/lib/date-utils";

// Availability decoration for the public shop (Plus build P5c).
//
// This lives in a server module rather than inline in the page for a concrete
// reason: reading the clock during a React render is an impure call, and the
// lint rule that catches it is right to. Taking the instant ONCE here also
// means every product on a page is evaluated against the same moment, so a
// drop cannot appear open on one card and closed on the next because the map
// callback straddled a millisecond.

export type ShopAvailabilityRow = {
  status: string;
  available_from: string | null;
  preorder: boolean | null;
  quantity: number | null;
};

export type ShopAvailability = {
  availability: ProductAvailability;
  label: string | null;
};

/**
 * Build a resolver bound to a single instant.
 *
 * Call once per request, then apply it to every row.
 */
export function shopAvailabilityResolver(): (
  row: ShopAvailabilityRow,
) => ShopAvailability {
  const nowMs = Date.now();
  return (row) => {
    const availability = productAvailability(
      {
        status: row.status,
        availableFrom: row.available_from,
        preorder: row.preorder === true,
        stockQuantity: row.quantity,
      },
      nowMs,
    );
    return {
      availability,
      label: availabilityLabel(availability, (iso) =>
        formatDateKey(iso.slice(0, 10), { day: "numeric", month: "short" }),
      ),
    };
  };
}
