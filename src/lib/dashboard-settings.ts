export interface DashboardWidgets {
  pending_requests: boolean;
  upcoming_appointments: boolean;
  books_status: boolean;
  waitlist: boolean;
  booking_link: boolean;
}

export const DEFAULT_DASHBOARD_WIDGETS: DashboardWidgets = {
  pending_requests: true,
  upcoming_appointments: true,
  books_status: true,
  waitlist: true,
  booking_link: true,
};

export function parseDashboardWidgets(raw: unknown): DashboardWidgets {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_DASHBOARD_WIDGETS };
  const r = raw as Record<string, unknown>;
  return {
    pending_requests:
      typeof r.pending_requests === "boolean" ? r.pending_requests : true,
    upcoming_appointments:
      typeof r.upcoming_appointments === "boolean"
        ? r.upcoming_appointments
        : true,
    books_status: typeof r.books_status === "boolean" ? r.books_status : true,
    waitlist: typeof r.waitlist === "boolean" ? r.waitlist : true,
    booking_link: typeof r.booking_link === "boolean" ? r.booking_link : true,
  };
}
