import type { MobileBookingDetail as BookingDetail } from "@inklee/shared/mobile-api";
import { CURRENCY_SYMBOLS } from "@inklee/shared/money";
import { apiPost } from "./api";

// Shapes of GET /api/mobile/bookings/:id (see the route handler) — now the
// single source of truth in @inklee/shared, shared with the server route. The
// detail screen and BookingActions read from these; re-exported under their
// original names so existing import sites are unchanged.
export type {
  MobileBookingDetail as BookingDetail,
  MobileBookingDeposit as BookingDeposit,
  MobileBookingTimelineEvent,
} from "@inklee/shared/mobile-api";

// A paid, not-yet-refunded in-app card deposit — the only kind that can be
// refunded in-app, and the thing that makes an artist-cancel auto-refund the
// client. Mirrors the web `hasPaidInAppDeposit && !depositRefunded` gating in
// requests/[id]/page.tsx.
export function canRefundDeposit(d: BookingDetail): boolean {
  return (
    !!d.deposit &&
    d.deposit.paid &&
    d.deposit.hasCardIntent &&
    !d.deposit.refunded
  );
}

// Mutations resolve to { ok: true } on success; apiPost throws ApiError on the
// server's { error } envelope (state-machine guard, ownership, validation).
export function approveBooking(id: string) {
  return apiPost<{ ok: true }>(`/bookings/${id}/approve`);
}
export function rejectBooking(id: string) {
  return apiPost<{ ok: true }>(`/bookings/${id}/reject`);
}
export function cancelBooking(id: string) {
  return apiPost<{ ok: true }>(`/bookings/${id}/cancel`);
}
// Reopen a cancelled/passed booking back to `pending` so the artist can
// re-request a deposit (the server re-checks no deposit money was kept).
export function reopenBooking(id: string) {
  return apiPost<{ ok: true }>(`/bookings/${id}/reopen`);
}
export function requestDeposit(
  id: string,
  amount: number,
  dueAt: string,
  note: string | null,
) {
  return apiPost<{ ok: true }>(`/bookings/${id}/deposit`, {
    amount,
    dueAt,
    note,
  });
}
export function markDepositReceived(id: string) {
  return apiPost<{ ok: true }>(`/bookings/${id}/deposit-received`);
}
export function refundDeposit(id: string) {
  return apiPost<{ ok: true }>(`/bookings/${id}/deposit-refund`);
}

// formatMoneyShort (the drop-.00, grouped chase-view formatter) is single-sourced
// in @inklee/shared/money so the web overview and this app render identical
// strings; re-exported here so existing "@/lib/bookings" import sites are
// unchanged.
export { formatMoneyShort } from "@inklee/shared/money";

/** Always-2dp money for the booking detail (RN-safe, no Intl dependency). */
export function formatMoney(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency.toLowerCase()];
  const value = amount.toFixed(2);
  return symbol ? `${symbol}${value}` : `${currency.toUpperCase()} ${value}`;
}
