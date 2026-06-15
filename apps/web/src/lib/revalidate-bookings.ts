import { revalidatePath } from "next/cache";

/**
 * Revalidate every surface that renders `booking_requests` so they never drift
 * out of sync after a status change, deposit, or appointment edit. The bookings
 * overview and the bookings calendar are two views of the same data — any
 * mutation must refresh both (plus the dashboard mirrors). Pass the booking id
 * to also refresh its detail pages.
 *
 * Call this from every booking-mutating server action / route handler instead
 * of hand-listing paths, which is how the calendar and overview previously
 * drifted (one revalidated `/bookings/calendar`, the other `/bookings/overview`,
 * neither revalidated the other).
 */
export function revalidateBookingViews(bookingId?: string): void {
  revalidatePath("/bookings/overview");
  revalidatePath("/bookings/calendar");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/calendar");
  if (bookingId) {
    revalidatePath(`/bookings/requests/${bookingId}`);
    revalidatePath(`/dashboard/requests/${bookingId}`);
  }
}
