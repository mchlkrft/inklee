export interface DashboardWidgets {
  pending_requests: boolean;
  upcoming_appointments: boolean;
  /** Renamed 2026-05-25 from `books_status` — the books-open/closed pill
   *  lives in the top bar now, so this widget pivoted to upcoming guest
   *  spots. Older artist settings stored under `books_status` are read
   *  through the legacy fallback below so nobody flips back to default. */
  guest_spots: boolean;
  waitlist: boolean;
  booking_link: boolean;
}

export const DEFAULT_DASHBOARD_WIDGETS: DashboardWidgets = {
  pending_requests: true,
  upcoming_appointments: true,
  guest_spots: true,
  waitlist: true,
  booking_link: true,
};

export function parseDashboardWidgets(raw: unknown): DashboardWidgets {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_DASHBOARD_WIDGETS };
  const r = raw as Record<string, unknown>;

  // `guest_spots` is the new key; honour the legacy `books_status` value
  // if an older record hasn't been resaved yet.
  const guestSpots =
    typeof r.guest_spots === "boolean"
      ? r.guest_spots
      : typeof r.books_status === "boolean"
        ? r.books_status
        : true;

  return {
    pending_requests:
      typeof r.pending_requests === "boolean" ? r.pending_requests : true,
    upcoming_appointments:
      typeof r.upcoming_appointments === "boolean"
        ? r.upcoming_appointments
        : true,
    guest_spots: guestSpots,
    waitlist: typeof r.waitlist === "boolean" ? r.waitlist : true,
    booking_link: typeof r.booking_link === "boolean" ? r.booking_link : true,
  };
}
