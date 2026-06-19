// Client list aggregation — derive unique clients from booking rows (grouped by
// email). The web Bookings > Clients view and the /api/mobile/clients route built
// byte-identical Maps; single-sourced here. Pure + Intl-free. (ME-10 D6)

import type { MobileClientListItem } from "./mobile-api";

export type ClientBookingRow = {
  customer_email: string | null;
  customer_handle: string | null;
  status: string;
  created_at: string;
};

/**
 * Group booking rows into unique clients by email. Callers pass rows already
 * sorted newest-first, so the FIRST row seen per email is the latest — its
 * status/created_at become latestStatus/lastBookingAt and later rows only bump
 * the count. Rows without an email are skipped (the query already filters them,
 * but guard anyway). Insertion order (newest-first) is preserved.
 */
export function aggregateClients(
  rows: ClientBookingRow[],
): MobileClientListItem[] {
  const map = new Map<string, MobileClientListItem>();
  for (const b of rows) {
    if (!b.customer_email) continue;
    const email = b.customer_email;
    const existing = map.get(email);
    if (!existing) {
      map.set(email, {
        email,
        handle: b.customer_handle ?? "",
        bookingCount: 1,
        lastBookingAt: b.created_at,
        latestStatus: b.status,
      });
    } else {
      existing.bookingCount++;
    }
  }
  return [...map.values()];
}
